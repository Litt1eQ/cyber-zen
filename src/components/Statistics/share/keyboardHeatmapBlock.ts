import {
  buildKeySpecIndex,
  type KeyCounts,
  getKeyboardLayout,
  MBP_NO_TOUCHBAR_ARROW_CLUSTER_CODE,
  MBP_TOUCHBAR_ARROW_CLUSTER_CODE,
  normalizeKeyboardLayoutId,
  totalKeyCount,
  type KeyboardLayoutId,
  type KeySpec,
} from '@/lib/keyboard'
import { computeHeatThresholds, heatLevelForValue, heatLevels, heatPaint, normalizeHeatLevelCount } from '../heatScale'
import { roundRectPath } from './canvasPrimitives'

const GRID_UNIT_SCALE = 4 // 0.25u resolution
const KEY_GAP_RATIO = 0.22
const KEY_PADDING_Y_RATIO = 0.085
const KEY_PADDING_X_RATIO = 0.095

type Placement = {
  key: KeySpec
  row: number
  col: number
  w: number
  h: number
}

function toGridUnits(width: number): number {
  const units = Math.round(width * GRID_UNIT_SCALE)
  return Math.max(1, units)
}

function computePlacements(layout: KeySpec[][]): { placements: Placement[]; cols: number; rows: number } {
  const occupied: boolean[][] = []
  const placements: Placement[] = []
  let maxCol = 0

  for (let row = 0; row < layout.length; row++) {
    let col = 0
    for (const key of layout[row] ?? []) {
      const w = toGridUnits(key.width ?? 1)
      const h = Math.max(1, Math.round(key.height ?? 1))

      while (occupied[row]?.[col]) col += 1

      for (let dr = 0; dr < h; dr++) {
        const rr = row + dr
        if (!occupied[rr]) occupied[rr] = []
        for (let dc = 0; dc < w; dc++) occupied[rr][col + dc] = true
      }

      maxCol = Math.max(maxCol, col + w)
      if (key.kind !== 'spacer') placements.push({ key, row, col, w, h })
      col += w
    }
  }

  return { placements, cols: maxCol, rows: layout.length }
}

export type KeyboardHeatmapBlockLayout = {
  normalizedLayoutId: ReturnType<typeof normalizeKeyboardLayoutId>
  grid: ReturnType<typeof computePlacements>
  keyIndex: ReturnType<typeof buildKeySpecIndex>
  heatLevelsCount: number
  thresholds: number[] | null
  max: number
  sizes: {
    keyboardInset: number
    unitPx: number
    keyGapPx: number
    keyHeightPx: number
    keyboardContainerH: number
    keyRadiusPx: number
    labelFontPx: number
    countFontPx: number
    sectionTitleH: number
    sectionGap: number
    legendH: number
    sectionBlockH: number
    height: number
  }
}

export function createKeyboardHeatmapBlockLayout({
  width,
  unshiftedCounts,
  shiftedCounts,
  heatLevelCount,
  layoutId,
  platform,
}: {
  width: number
  unshiftedCounts: KeyCounts
  shiftedCounts: KeyCounts
  heatLevelCount?: number | null
  layoutId?: KeyboardLayoutId | string | null
  platform: 'mac' | 'windows' | 'linux'
}): KeyboardHeatmapBlockLayout {
  const heatLevelsCount = normalizeHeatLevelCount(heatLevelCount)
  const normalizedLayoutId = normalizeKeyboardLayoutId(layoutId)
  const layout = getKeyboardLayout(normalizedLayoutId, platform)
  const grid = computePlacements(layout)
  const keyIndex = buildKeySpecIndex(layout)

  const combinedValues: number[] = []
  for (const row of layout) {
    for (const key of row) {
      if (key.kind === 'spacer') continue
      combinedValues.push(unshiftedCounts[key.code] ?? 0, shiftedCounts[key.code] ?? 0)
    }
  }
  if (normalizedLayoutId === 'macbook_pro_no_touchbar' || normalizedLayoutId === 'macbook_pro') {
    for (const code of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'] as const) {
      combinedValues.push(unshiftedCounts[code] ?? 0, shiftedCounts[code] ?? 0)
    }
  }
  const max = combinedValues.reduce((acc, v) => Math.max(acc, v), 0)
  const thresholds = computeHeatThresholds(combinedValues, heatLevelsCount)

  const sectionTitleH = 30
  const sectionGap = 22
  const legendH = 28
  const keyboardInset = Math.max(10, Math.round(width * 0.012))
  const keyboardInnerW = Math.max(1, width - keyboardInset * 2)
  const unitPx = Math.max(3.6, (keyboardInnerW - 1) / Math.max(1, grid.cols))
  const keyGapPx = Math.max(1, Math.round(unitPx * KEY_GAP_RATIO))
  const keyHeightPx = Math.max(18, Math.round(unitPx * GRID_UNIT_SCALE * 1.12))
  const keyboardInnerH = grid.rows * keyHeightPx
  const keyboardContainerH = keyboardInnerH + keyboardInset * 2
  const keyRadiusPx = Math.max(3, Math.round(keyHeightPx * 0.14))
  const labelFontPx = Math.max(10, Math.min(14, Math.round(keyHeightPx * 0.27)))
  const countFontPx = Math.max(8, Math.min(12, Math.round(keyHeightPx * 0.22)))
  const sectionBlockH = sectionTitleH + keyboardContainerH
  const height = sectionBlockH * 2 + sectionGap * 3 + legendH

  return {
    normalizedLayoutId,
    grid,
    keyIndex,
    heatLevelsCount,
    thresholds,
    max,
    sizes: {
      keyboardInset,
      unitPx,
      keyGapPx,
      keyHeightPx,
      keyboardContainerH,
      keyRadiusPx,
      labelFontPx,
      countFontPx,
      sectionTitleH,
      sectionGap,
      legendH,
      sectionBlockH,
      height,
    },
  }
}

export type KeyboardHeatmapBlockStrings = {
  unshiftedSectionTitle: string
  shiftedSectionTitle: string
  legendLow: string
  legendHigh: string
}

export function drawKeyboardHeatmapBlock({
  ctx,
  x,
  y,
  width,
  unshiftedCounts,
  shiftedCounts,
  hideNumbers,
  hideKeys,
  locale,
  strings,
  layout,
}: {
  ctx: CanvasRenderingContext2D
  x: number
  y: number
  width: number
  unshiftedCounts: KeyCounts
  shiftedCounts: KeyCounts
  hideNumbers: boolean
  hideKeys: boolean
  locale: string
  strings: KeyboardHeatmapBlockStrings
  layout: KeyboardHeatmapBlockLayout
}): { height: number } {
  const numberFmt = new Intl.NumberFormat(locale)
  const {
    normalizedLayoutId,
    grid,
    keyIndex,
    heatLevelsCount,
    thresholds,
    max,
    sizes: {
      keyboardInset,
      unitPx,
      keyGapPx,
      keyHeightPx,
      keyboardContainerH,
      keyRadiusPx,
      labelFontPx,
      countFontPx,
      sectionTitleH,
      sectionGap,
      legendH,
      sectionBlockH,
      height,
    },
  } = layout

  let cursorY = y

  const drawKeyboardSection = ({
    title,
    counts,
    showShiftedLabel,
  }: {
    title: string
    counts: KeyCounts
    showShiftedLabel: boolean
  }) => {
    const sectionTotal = totalKeyCount(counts)
    ctx.fillStyle = 'rgba(15,23,42,0.64)'
    ctx.font = '600 13px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.fillText(title, x, cursorY + 2)
    if (!hideNumbers) {
      ctx.textAlign = 'right'
      ctx.fillStyle = 'rgba(15,23,42,0.55)'
      ctx.font = '600 13px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
      ctx.fillText(numberFmt.format(sectionTotal), x + width, cursorY + 2)
      ctx.textAlign = 'left'
    }

    const keyboardY = cursorY + sectionTitleH
    const keyboardX = x
    const keyboardInnerX = keyboardX + keyboardInset
    const keyboardInnerY = keyboardY + keyboardInset
    ctx.save()
    roundRectPath(ctx, keyboardX, keyboardY, width, keyboardContainerH, 18)
    ctx.fillStyle = '#f8fafc'
    ctx.fill()
    ctx.strokeStyle = 'rgba(15,23,42,0.08)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.restore()

    for (const { key, row, col, w, h } of grid.placements) {
      const left = keyboardInnerX + col * unitPx + keyGapPx
      const top = keyboardInnerY + row * keyHeightPx + keyGapPx
      const rectW = w * unitPx - keyGapPx * 2
      const rectH = h * keyHeightPx - keyGapPx * 2

      const isNoTouchBarArrowCluster =
        normalizedLayoutId === 'macbook_pro_no_touchbar' && key.code === MBP_NO_TOUCHBAR_ARROW_CLUSTER_CODE
      const isTouchBarArrowCluster = normalizedLayoutId === 'macbook_pro' && key.code === MBP_TOUCHBAR_ARROW_CLUSTER_CODE

      const drawKey = ({
        code,
        label,
        x,
        y,
        w,
        h,
      }: {
        code: string
        label: string
        x: number
        y: number
        w: number
        h: number
      }) => {
        const count = counts[code] ?? 0
        const level = heatLevelForValue(count, max, thresholds, heatLevelsCount)
        const paint = heatPaint(level, heatLevelsCount)

        roundRectPath(ctx, x, y, w, h, keyRadiusPx)
        ctx.fillStyle = paint.fill
        ctx.fill()
        ctx.lineWidth = 1
        ctx.strokeStyle = paint.stroke
        ctx.stroke()

        const paddingY = Math.max(2, Math.round(keyHeightPx * KEY_PADDING_Y_RATIO))
        const paddingX = Math.max(2, Math.round(keyHeightPx * KEY_PADDING_X_RATIO))
        const textX = x + paddingX
        const textY = y + paddingY

        if (!hideKeys) {
          ctx.fillStyle = paint.text
          ctx.font = `600 ${labelFontPx}px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`
          ctx.textAlign = 'left'
          ctx.textBaseline = 'top'
          ctx.fillText(label, textX, textY)
        }

        if (!hideNumbers && count > 0) {
          ctx.fillStyle = paint.textMuted
          ctx.font = `600 ${countFontPx}px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`
          if (hideKeys) {
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(numberFmt.format(count), x + w / 2, y + h / 2)
          } else {
            ctx.textAlign = 'left'
            ctx.textBaseline = 'bottom'
            ctx.fillText(numberFmt.format(count), textX, y + h - Math.max(2, Math.round(paddingY * 0.8)))
          }
          ctx.textAlign = 'left'
          ctx.textBaseline = 'top'
        }
      }

      if (isNoTouchBarArrowCluster || isTouchBarArrowCluster) {
        const subGapPx = Math.max(1, Math.round(keyGapPx * 0.85))
        const colW = Math.max(1, (rectW - subGapPx * 2) / 3)
        const halfH = Math.max(1, (rectH - subGapPx) / 2)

        drawKey({ code: 'ArrowUp', label: '↑', x: left + colW + subGapPx, y: top, w: colW, h: halfH })
        const bottomY = top + halfH + subGapPx
        drawKey({ code: 'ArrowLeft', label: '←', x: left, y: bottomY, w: colW, h: halfH })
        drawKey({ code: 'ArrowDown', label: '↓', x: left + colW + subGapPx, y: bottomY, w: colW, h: halfH })
        drawKey({
          code: 'ArrowRight',
          label: '→',
          x: left + (colW + subGapPx) * 2,
          y: bottomY,
          w: colW,
          h: halfH,
        })
        continue
      }

      const label = showShiftedLabel ? key.shiftLabel ?? key.label : key.label
      const rawLabel = keyIndex[key.code]?.label ?? key.label
      drawKey({
        code: key.code,
        label: label || rawLabel || key.code,
        x: left,
        y: top,
        w: rectW,
        h: rectH,
      })
    }

    cursorY += sectionBlockH
  }

  drawKeyboardSection({
    title: strings.unshiftedSectionTitle,
    counts: unshiftedCounts,
    showShiftedLabel: false,
  })
  cursorY += sectionGap
  drawKeyboardSection({
    title: strings.shiftedSectionTitle,
    counts: shiftedCounts,
    showShiftedLabel: true,
  })
  cursorY += sectionGap

  // Legend
  ctx.fillStyle = 'rgba(15,23,42,0.55)'
  ctx.font = '600 12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillText(strings.legendLow, x, cursorY + legendH / 2)

  const levels = heatLevels(heatLevelsCount)
  const swatchSize = 12
  const swatchGap = 6
  const swatchesW = levels.length * swatchSize + Math.max(0, levels.length - 1) * swatchGap
  const swatchesX = x + (width - swatchesW) / 2
  const swatchY = cursorY + (legendH - swatchSize) / 2
  for (let i = 0; i < levels.length; i += 1) {
    const paint = heatPaint(levels[i], heatLevelsCount)
    const swatchX = swatchesX + i * (swatchSize + swatchGap)
    roundRectPath(ctx, swatchX, swatchY, swatchSize, swatchSize, 4)
    ctx.fillStyle = paint.fill
    ctx.fill()
    ctx.strokeStyle = paint.stroke
    ctx.lineWidth = 1
    ctx.stroke()
  }

  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(15,23,42,0.55)'
  ctx.font = '600 12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
  ctx.fillText(strings.legendHigh, x + width, cursorY + legendH / 2)
  ctx.textAlign = 'left'

  cursorY += legendH + sectionGap
  return { height: height }
}
