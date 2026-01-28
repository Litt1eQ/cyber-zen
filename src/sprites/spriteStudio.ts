import type { ChromaKeyAlgorithm, ChromaKeyOptions } from '@/sprites/spriteCore'
import { buildProcessedSheetFromSrc } from '@/sprites/spriteAnimation'

export type SpriteSheetProcessOptions = {
  columns: number
  rows: number
  chromaKeyEnabled: boolean
  chromaKeyAlgorithm: ChromaKeyAlgorithm
  chromaKeyOptions: ChromaKeyOptions
  removeGridLinesEnabled: boolean
  imageSmoothingEnabled: boolean
  targetFrameWidthPx?: number
  maxProcessedPixels?: number
}

export type ProcessedSpriteSheet = {
  sheet: HTMLCanvasElement
  width: number
  height: number
  frameWidth: number
  frameHeight: number
  columns: number
  rows: number
}

export async function loadImageFromUrl(src: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image.'))
    img.src = src
  })
}

export async function processSpriteSheetToObjectUrl(
  srcUrl: string,
  opts: SpriteSheetProcessOptions
): Promise<ProcessedSpriteSheet> {
  const processed = await buildProcessedSheetFromSrc({
    src: srcUrl,
    columns: opts.columns,
    rows: opts.rows,
    chromaKey: opts.chromaKeyEnabled,
    chromaKeyAlgorithm: opts.chromaKeyAlgorithm,
    chromaKeyOptions: opts.chromaKeyOptions,
    imageSmoothingEnabled: opts.imageSmoothingEnabled,
    removeGridLines: opts.removeGridLinesEnabled,
    targetFrameWidthPx: opts.targetFrameWidthPx,
    maxProcessedPixels: opts.maxProcessedPixels,
  })

  const sheet = processed.sheet
  return {
    sheet,
    width: sheet.width,
    height: sheet.height,
    frameWidth: processed.frameWidth,
    frameHeight: processed.frameHeight,
    columns: processed.columns,
    rows: processed.rows,
  }
}

export async function exportSpriteFramePngBase64(params: {
  srcUrl: string
  process: SpriteSheetProcessOptions
  frameIndex: number
}): Promise<string> {
  const processed = await processSpriteSheetToObjectUrl(params.srcUrl, params.process)
  return exportFramePngBase64FromProcessedSheet({
    sheet: processed.sheet,
    frameWidth: processed.frameWidth,
    frameHeight: processed.frameHeight,
    columns: processed.columns,
    frameIndex: params.frameIndex,
  })
}

export async function exportFramePngBase64FromSheetUrl(params: {
  sheetUrl: string
  width: number
  height: number
  columns: number
  rows: number
  frameIndex: number
}): Promise<string> {
  const img = await loadImageFromUrl(params.sheetUrl)
  const width = Math.max(1, Math.floor(params.width))
  const height = Math.max(1, Math.floor(params.height))
  const cols = Math.max(1, Math.floor(params.columns))
  const rows = Math.max(1, Math.floor(params.rows))
  const frameW = Math.floor(width / cols)
  const frameH = Math.floor(height / rows)
  const idx = Math.max(0, Math.floor(params.frameIndex))
  const fx = idx % cols
  const fy = Math.floor(idx / cols) % rows

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, frameW)
  canvas.height = Math.max(1, frameH)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to create canvas context.')
  ctx.clearRect(0, 0, frameW, frameH)
  ctx.drawImage(img, fx * frameW, fy * frameH, frameW, frameH, 0, 0, frameW, frameH)

  const dataUrl = canvas.toDataURL('image/png')
  const comma = dataUrl.indexOf(',')
  if (comma === -1) throw new Error('Failed to encode PNG.')
  return dataUrl.slice(comma + 1)
}

export function exportFramePngBase64FromProcessedSheet(params: {
  sheet: HTMLCanvasElement
  frameWidth: number
  frameHeight: number
  columns: number
  frameIndex: number
}): string {
  const cols = Math.max(1, Math.floor(params.columns))
  const frameW = Math.max(1, Math.floor(params.frameWidth))
  const frameH = Math.max(1, Math.floor(params.frameHeight))
  const idx = Math.max(0, Math.floor(params.frameIndex))
  const fx = idx % cols
  const fy = Math.floor(idx / cols)

  const canvas = document.createElement('canvas')
  canvas.width = frameW
  canvas.height = frameH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to create canvas context.')
  ctx.clearRect(0, 0, frameW, frameH)
  ctx.drawImage(params.sheet, fx * frameW, fy * frameH, frameW, frameH, 0, 0, frameW, frameH)

  const dataUrl = canvas.toDataURL('image/png')
  const comma = dataUrl.indexOf(',')
  if (comma === -1) throw new Error('Failed to encode PNG.')
  return dataUrl.slice(comma + 1)
}
