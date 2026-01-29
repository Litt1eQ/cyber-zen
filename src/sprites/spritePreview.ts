export const SPRITE_PREVIEW_MAX_ROWS = 7
export const SPRITE_DEFAULT_IDLE_ROW_INDEX = 3

export function getSpritePreviewRowCount(rows: number): number {
  const n = Math.max(1, Math.floor(rows))
  return Math.min(SPRITE_PREVIEW_MAX_ROWS, n)
}

export function clampSpriteRowIndex(rowIndex: number, rowCount: number): number {
  const idx = Math.floor(rowIndex)
  if (!Number.isFinite(idx)) return 0
  const max = Math.max(0, Math.floor(rowCount) - 1)
  return Math.max(0, Math.min(max, idx))
}

export function spriteRowIndexToFrameIntervalMs(rowIndex: number): number {
  const idx = Math.floor(rowIndex)
  // Keep in sync with `useSpritePlayback` defaults.
  switch (idx) {
    case 6:
      return 90
    case 5:
      return 80
    case 4:
      return 95
    case 2:
      return 120
    case 1:
    case 0:
    case 3:
    default:
      return 140
  }
}
