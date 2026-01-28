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

type CanvasLayout = {
  dpr: number
  width: number
  height: number
}

const canvasLayoutCache = new WeakMap<HTMLCanvasElement, CanvasLayout>()

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
  chromaKey?: boolean
  chromaKeyAlgorithm?: ChromaKeyAlgorithm
  chromaKeyOptions?: ChromaKeyOptions
  imageSmoothingEnabled?: boolean
  removeGridLines?: boolean
}): Promise<ProcessedSheet> {
  const sprite = await loadImage(opts.src)

  const cols = opts.columns ?? SPRITE_FRAMES_PER_ROW
  const rows = opts.rows ?? SPRITE_ROWS
  const sourceW = sprite.naturalWidth || sprite.width
  const sourceH = sprite.naturalHeight || sprite.height

  const valid = validateSpriteImageDimensions(sourceW, sourceH, cols, rows)
  if (!valid.valid) throw new Error(valid.error ?? 'Invalid sprite sheet dimensions.')

  const frameWidth = Math.floor(sourceW / cols)
  const frameHeight = Math.floor(sourceH / rows)
  const sheetW = frameWidth * cols
  const sheetH = frameHeight * rows

  const sourceCanvas = document.createElement('canvas')
  sourceCanvas.width = sourceW
  sourceCanvas.height = sourceH
  const sourceCtx = sourceCanvas.getContext('2d')
  if (!sourceCtx) throw new Error('Failed to create 2D context.')

  sourceCtx.clearRect(0, 0, sourceW, sourceH)
  sourceCtx.drawImage(sprite, 0, 0, sourceW, sourceH)

  if (opts.chromaKey ?? true) {
    applyChromaKey(sourceCtx, sourceW, sourceH, opts.chromaKeyOptions ?? {}, opts.chromaKeyAlgorithm ?? 'classic')
  }

  const sheet = document.createElement('canvas')
  sheet.width = sheetW
  sheet.height = sheetH
  const sheetCtx = sheet.getContext('2d')
  if (!sheetCtx) throw new Error('Failed to create 2D context.')

  sheetCtx.clearRect(0, 0, sheetW, sheetH)
  sheetCtx.imageSmoothingEnabled = opts.imageSmoothingEnabled ?? true

  // Crop the centered area that matches exact framing derived from the source.
  const cropW = Math.max(1, sheetW)
  const cropH = Math.max(1, sheetH)
  const cropX = Math.max(0, Math.floor((sourceW - cropW) / 2))
  const cropY = Math.max(0, Math.floor((sourceH - cropH) / 2))
  sheetCtx.drawImage(sourceCanvas, cropX, cropY, cropW, cropH, 0, 0, sheetW, sheetH)

  if (opts.removeGridLines ?? true) {
    removeGridLines(sheetCtx, sheetW, sheetH, cols, rows)
  }

  return { sheet, frameWidth, frameHeight, columns: cols, rows }
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
