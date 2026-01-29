/**
 * Sprite-sheet animation and rendering helpers.
 *
 * Responsibilities:
 * - Load a sheet (URL or data URL)
 * - Build an in-memory processed sheet (optional chroma key + crop + optional seam cleanup)
 * - Draw a single frame onto a destination canvas with DPR handling
 */

import type { ChromaKeyAlgorithm, ChromaKeyOptions, CustomMood } from './spriteCore'
import {
  applyChromaKey,
  customMoodToFrameIntervalMs,
  customMoodToRowIndex,
  removeGridLines,
  SPRITE_FRAMES_PER_ROW,
  SPRITE_ROWS,
  validateSpriteImageDimensions,
} from './spriteCore'

export interface ProcessedSheet {
  sheet: HTMLCanvasElement
  frameWidth: number
  frameHeight: number
  columns: number
  rows: number
}

type ProcessedSheetBuildOptions = {
  src: string
  columns?: number
  rows?: number
  cropOffsetX?: number
  cropOffsetY?: number
  chromaKey?: boolean
  chromaKeyAlgorithm?: ChromaKeyAlgorithm
  chromaKeyOptions?: ChromaKeyOptions
  imageSmoothingEnabled?: boolean
  removeGridLines?: boolean
  /**
   * Hint for how large a single frame should be (in source pixels) after processing.
   * Used to downscale very large sheets to reduce chroma-key CPU cost.
   */
  targetFrameWidthPx?: number
  /**
   * Safety cap for processing cost. If the cropped sheet area exceeds this many pixels,
   * the sheet will be downscaled before chroma key / seam cleanup.
   */
  maxProcessedPixels?: number
}

type CanvasLayout = {
  dpr: number
  width: number
  height: number
}

const canvasLayoutCache = new WeakMap<HTMLCanvasElement, CanvasLayout>()

const processedSheetPromiseCache = new Map<string, Promise<ProcessedSheet>>()
const MAX_CACHED_SHEETS = 8

function stableStringify(value: unknown): string {
  if (value == null) return ''
  if (typeof value !== 'object') return String(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map((k) => `${k}:${stableStringify(obj[k])}`).join(',')}}`
}

function makeProcessedSheetCacheKey(opts: ProcessedSheetBuildOptions): string {
  const cols = opts.columns ?? SPRITE_FRAMES_PER_ROW
  const rows = opts.rows ?? SPRITE_ROWS
  const chromaKey = opts.chromaKey ?? true
  const algo = opts.chromaKeyAlgorithm ?? 'classic'
  const smoothing = opts.imageSmoothingEnabled ?? true
  const fixGrid = opts.removeGridLines ?? true
  const targetFrameWidthPx = opts.targetFrameWidthPx ? Math.round(opts.targetFrameWidthPx) : 0
  const maxProcessedPixels = opts.maxProcessedPixels ?? 0
  const cropOffsetX = opts.cropOffsetX && Number.isFinite(opts.cropOffsetX) ? Math.round(opts.cropOffsetX) : 0
  const cropOffsetY = opts.cropOffsetY && Number.isFinite(opts.cropOffsetY) ? Math.round(opts.cropOffsetY) : 0
  return [
    'v2',
    opts.src,
    `c${cols}`,
    `r${rows}`,
    `ox${cropOffsetX}`,
    `oy${cropOffsetY}`,
    `k${chromaKey ? 1 : 0}`,
    `a${algo}`,
    `s${smoothing ? 1 : 0}`,
    `g${fixGrid ? 1 : 0}`,
    `tw${targetFrameWidthPx}`,
    `mp${maxProcessedPixels}`,
    `o${stableStringify(opts.chromaKeyOptions ?? {})}`,
  ].join('|')
}

function ensureCanvasBackingStoreSize(opts: {
  canvas: HTMLCanvasElement
  displayWidth: number
  displayHeight: number
  dpr: number
}): void {
  const { canvas, displayWidth, displayHeight, dpr } = opts

  const width = Math.round(displayWidth * dpr)
  const height = Math.round(displayHeight * dpr)

  const prev = canvasLayoutCache.get(canvas)
  if (prev && prev.dpr === dpr && prev.width === width && prev.height === height) return

  canvasLayoutCache.set(canvas, { dpr, width, height })
  canvas.width = width
  canvas.height = height
  canvas.style.width = `${displayWidth}px`
  canvas.style.height = `${displayHeight}px`
}

async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image.'))
    img.src = src
  })
}

/**
 * Prefer fetching + object URL so `drawImage` can safely read pixels even for Tauri file URLs.
 */
export async function loadImage(src: string): Promise<HTMLImageElement> {
  if (src.startsWith('data:') || src.startsWith('blob:')) {
    return await loadImageElement(src)
  }

  try {
    const res = await fetch(src)
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    try {
      const img = await loadImageElement(url)
      return img
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch {
    return await loadImageElement(src)
  }
}

export async function buildProcessedSheetFromSrc(opts: {
  src: string
  columns?: number
  rows?: number
  cropOffsetX?: number
  cropOffsetY?: number
  chromaKey?: boolean
  chromaKeyAlgorithm?: ChromaKeyAlgorithm
  chromaKeyOptions?: ChromaKeyOptions
  imageSmoothingEnabled?: boolean
  removeGridLines?: boolean
  targetFrameWidthPx?: number
  maxProcessedPixels?: number
}): Promise<ProcessedSheet> {
  const key = makeProcessedSheetCacheKey(opts)
  const cached = processedSheetPromiseCache.get(key)
  if (cached) return await cached

  const promise = (async (): Promise<ProcessedSheet> => {
    const sprite = await loadImage(opts.src)

    const cols = opts.columns ?? SPRITE_FRAMES_PER_ROW
    const rows = opts.rows ?? SPRITE_ROWS
    const sourceW = sprite.naturalWidth || sprite.width
    const sourceH = sprite.naturalHeight || sprite.height

    const valid = validateSpriteImageDimensions(sourceW, sourceH, cols, rows)
    if (!valid.valid) throw new Error(valid.error ?? 'Invalid sprite sheet dimensions.')

    const sourceFrameWidth = Math.floor(sourceW / cols)
    const sourceFrameHeight = Math.floor(sourceH / rows)
    const sourceSheetW = sourceFrameWidth * cols
    const sourceSheetH = sourceFrameHeight * rows

    const targetFrameWidthPx =
      opts.targetFrameWidthPx && Number.isFinite(opts.targetFrameWidthPx)
        ? Math.max(1, Math.round(opts.targetFrameWidthPx))
        : sourceFrameWidth

    const maxProcessedPixels =
      opts.maxProcessedPixels && Number.isFinite(opts.maxProcessedPixels)
        ? Math.max(64 * 64, Math.round(opts.maxProcessedPixels))
        : 6_000_000

    const desiredScale = targetFrameWidthPx > 0 ? targetFrameWidthPx / Math.max(1, sourceFrameWidth) : 1
    const sourcePixels = sourceSheetW * sourceSheetH
    const maxPixelScale = sourcePixels > 0 ? Math.sqrt(maxProcessedPixels / sourcePixels) : 1
    const scale = Math.max(0.05, Math.min(1, desiredScale, maxPixelScale))

    const frameWidth = Math.max(1, Math.round(sourceFrameWidth * scale))
    const frameHeight = Math.max(1, Math.round(sourceFrameHeight * scale))
    const sheetW = frameWidth * cols
    const sheetH = frameHeight * rows

    const needsPixelReads = (opts.chromaKey ?? true) || (opts.removeGridLines ?? true)
    const sheet = document.createElement('canvas')
    sheet.width = sheetW
    sheet.height = sheetH
    const sheetCtx = sheet.getContext('2d', needsPixelReads ? { willReadFrequently: true } : undefined)
    if (!sheetCtx) throw new Error('Failed to create 2D context.')

    sheetCtx.clearRect(0, 0, sheetW, sheetH)
    sheetCtx.imageSmoothingEnabled = opts.imageSmoothingEnabled ?? true

    // Crop the centered area that matches exact framing derived from the source,
    // then (optionally) downscale to reduce chroma-key CPU cost.
    const cropW = Math.max(1, sourceSheetW)
    const cropH = Math.max(1, sourceSheetH)
    const baseCropX = Math.max(0, Math.floor((sourceW - cropW) / 2))
    const baseCropY = Math.max(0, Math.floor((sourceH - cropH) / 2))
    const maxCropX = Math.max(0, sourceW - cropW)
    const maxCropY = Math.max(0, sourceH - cropH)
    const ox = opts.cropOffsetX && Number.isFinite(opts.cropOffsetX) ? Math.round(opts.cropOffsetX) : 0
    const oy = opts.cropOffsetY && Number.isFinite(opts.cropOffsetY) ? Math.round(opts.cropOffsetY) : 0
    const cropX = Math.max(0, Math.min(maxCropX, baseCropX + ox))
    const cropY = Math.max(0, Math.min(maxCropY, baseCropY + oy))
    sheetCtx.drawImage(sprite, cropX, cropY, cropW, cropH, 0, 0, sheetW, sheetH)

    if (opts.chromaKey ?? true) {
      applyChromaKey(sheetCtx, sheetW, sheetH, opts.chromaKeyOptions ?? {}, opts.chromaKeyAlgorithm ?? 'classic')
    }

    if (opts.removeGridLines ?? true) {
      removeGridLines(sheetCtx, sheetW, sheetH, cols, rows)
    }

    return { sheet, frameWidth, frameHeight, columns: cols, rows }
  })()

  processedSheetPromiseCache.set(key, promise)
  if (processedSheetPromiseCache.size > MAX_CACHED_SHEETS) {
    const firstKey = processedSheetPromiseCache.keys().next().value as string | undefined
    if (firstKey) processedSheetPromiseCache.delete(firstKey)
  }

  try {
    return await promise
  } catch (e) {
    processedSheetPromiseCache.delete(key)
    throw e
  }
}

export function drawFrameToCanvas(opts: {
  canvas: HTMLCanvasElement
  sheet: CanvasImageSource
  frameWidth: number
  frameHeight: number
  frameIndex: number
  mood?: CustomMood
  rowIndex?: number
  size: number
  columns?: number
  imageSmoothingEnabled?: boolean
}): void {
  const {
    canvas,
    sheet,
    frameWidth,
    frameHeight,
    frameIndex,
    mood,
    rowIndex: rowIndexOverride,
    size,
    columns = SPRITE_FRAMES_PER_ROW,
    imageSmoothingEnabled = true,
  } = opts

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const aspectRatio = frameWidth / frameHeight
  const displayWidth = size
  const displayHeight = Math.max(1, Math.round(size / Math.max(0.01, aspectRatio)))

  const dpr = window.devicePixelRatio || 1
  ensureCanvasBackingStoreSize({ canvas, displayWidth, displayHeight, dpr })
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  ctx.clearRect(0, 0, displayWidth, displayHeight)
  ctx.imageSmoothingEnabled = imageSmoothingEnabled
  if ('imageSmoothingQuality' in ctx) {
    ;(ctx as CanvasRenderingContext2D & { imageSmoothingQuality: 'low' | 'medium' | 'high' }).imageSmoothingQuality = 'high'
  }

  const rowIndex = rowIndexOverride ?? customMoodToRowIndex(mood ?? 'idle')
  const sx = (frameIndex % columns) * frameWidth
  const sy = rowIndex * frameHeight
  ctx.drawImage(sheet, sx, sy, frameWidth, frameHeight, 0, 0, displayWidth, displayHeight)
}

export function moodToFrameIntervalMs(mood: CustomMood, speed: number = 1): number {
  const safeSpeed = Math.max(0.05, speed)
  return Math.max(16, Math.round(customMoodToFrameIntervalMs(mood) / safeSpeed))
}

export class HoverRafAnimator {
  private rafId: number | null = null
  private lastFrameTime = 0
  private frameIndex = 0
  private isHovered = false
  private isVisible = true

  constructor(
    private readonly draw: (frameIndex: number) => void,
    private readonly fps: number = 8,
    private readonly frameCount: number = SPRITE_FRAMES_PER_ROW
  ) {}

  setHovered(hovered: boolean): void {
    this.isHovered = hovered
    if (!hovered) this.frameIndex = 0
    this.tick(0)
  }

  setVisible(visible: boolean): void {
    this.isVisible = visible
    this.tick(0)
  }

  start(): void {
    this.tick(0)
  }

  stop(): void {
    if (this.rafId != null) cancelAnimationFrame(this.rafId)
    this.rafId = null
  }

  private tick = (timestamp: number): void => {
    if (!this.isVisible) {
      this.stop()
      this.draw(0)
      return
    }
    if (!this.isHovered) {
      this.stop()
      this.draw(0)
      return
    }

    const frameDuration = 1000 / this.fps
    if (timestamp - this.lastFrameTime >= frameDuration) {
      this.lastFrameTime = timestamp
      this.frameIndex = (this.frameIndex + 1) % this.frameCount
      this.draw(this.frameIndex)
    }

    this.rafId = requestAnimationFrame(this.tick)
  }
}

export async function preRenderRowFramesToBitmaps(opts: {
  sheet: HTMLCanvasElement
  frameWidth: number
  frameHeight: number
  rowIndex: number
  columns?: number
}): Promise<ImageBitmap[]> {
  const { sheet, frameWidth, frameHeight, rowIndex, columns = SPRITE_FRAMES_PER_ROW } = opts
  const frames: ImageBitmap[] = []

  const frameCanvas = document.createElement('canvas')
  frameCanvas.width = frameWidth
  frameCanvas.height = frameHeight
  const frameCtx = frameCanvas.getContext('2d')
  if (!frameCtx) return frames

  for (let col = 0; col < columns; col++) {
    frameCtx.clearRect(0, 0, frameWidth, frameHeight)
    frameCtx.drawImage(
      sheet,
      col * frameWidth,
      rowIndex * frameHeight,
      frameWidth,
      frameHeight,
      0,
      0,
      frameWidth,
      frameHeight
    )
    frames.push(await createImageBitmap(frameCanvas))
  }

  return frames
}
