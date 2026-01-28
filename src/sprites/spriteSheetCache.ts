import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core'
import type { CustomWoodenFishSkin } from '@/types/skins'
import { COMMANDS } from '@/types/events'
import { buildProcessedSheetFromSrc } from './spriteAnimation'

const DEFAULT_CACHE_TARGET_FRAME_WIDTH_PX = 512
const DEFAULT_CACHE_MAX_PROCESSED_PIXELS = 16_000_000

export async function precacheCustomSkinSpriteSheet(
  skin: Pick<CustomWoodenFishSkin, 'id' | 'sprite_sheet_path' | 'sprite_sheet'>
): Promise<boolean> {
  if (!isTauri()) return false
  if (!skin.sprite_sheet_path) return false

  // Already cached (best-effort check; backend is the source of truth).
  if (skin.sprite_sheet_path.includes('/_cache/') || skin.sprite_sheet_path.includes('\\_cache\\')) {
    return false
  }

  const cfg = skin.sprite_sheet
  if (!cfg) return false

  const chromaKey = cfg.chroma_key ?? true
  const removeGridLines = cfg.remove_grid_lines ?? true
  const needsPixelProcessing = chromaKey || removeGridLines
  if (!needsPixelProcessing) return false

  const columns = cfg.columns ?? 8
  const rows = cfg.rows ?? 7
  const chromaKeyOptions = cfg.chroma_key_options
    ? {
      similarity: cfg.chroma_key_options.similarity,
      smoothness: cfg.chroma_key_options.smoothness,
      spill: cfg.chroma_key_options.spill,
      keyColor: cfg.chroma_key_options.key_color,
    }
    : undefined

  const src = convertFileSrc(skin.sprite_sheet_path)
  const processed = await buildProcessedSheetFromSrc({
    src,
    columns,
    rows,
    chromaKey,
    chromaKeyAlgorithm: cfg.chroma_key_algorithm ?? 'classic',
    chromaKeyOptions,
    imageSmoothingEnabled: cfg.image_smoothing_enabled ?? true,
    removeGridLines,
    targetFrameWidthPx: DEFAULT_CACHE_TARGET_FRAME_WIDTH_PX,
    maxProcessedPixels: DEFAULT_CACHE_MAX_PROCESSED_PIXELS,
  })

  const pngBase64 = await canvasToPngBase64(processed.sheet)
  await invoke(COMMANDS.CACHE_CUSTOM_WOODEN_FISH_SPRITE_SHEET_PNG, { id: skin.id, pngBase64 })
  return true
}

async function canvasToPngBase64(canvas: HTMLCanvasElement): Promise<string> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to encode PNG.'))),
      'image/png',
      1
    )
  })
  return await blobToBase64(blob)
}

async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to read blob.'))
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.readAsDataURL(blob)
  })
  const comma = dataUrl.indexOf(',')
  if (comma === -1) throw new Error('Failed to encode base64.')
  return dataUrl.slice(comma + 1)
}
