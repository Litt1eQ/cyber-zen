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

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2))
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function formatYmdLocal(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function drawMosaicPlaceholder({
  ctx,
  x,
  y,
  w,
  h,
  seed,
}: {
  ctx: CanvasRenderingContext2D
  x: number
  y: number
  w: number
  h: number
  seed: string
}) {
  const r = Math.max(6, Math.round(Math.min(w, h) * 0.22))
  ctx.save()
  roundRectPath(ctx, x, y, w, h, r)
  ctx.clip()

  ctx.fillStyle = 'rgba(15,23,42,0.06)'
  ctx.fillRect(x, y, w, h)

  // simple deterministic "noise" based on seed
  let s = 0
  for (let i = 0; i < seed.length; i += 1) s = (s * 31 + seed.charCodeAt(i)) >>> 0
  const rand = () => {
    // xorshift32
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 0xffffffff
  }

  const block = Math.max(6, Math.round(h * 0.32))
  const gap = Math.max(2, Math.round(block * 0.22))
  for (let yy = y + gap; yy < y + h - gap; yy += block + gap) {
    for (let xx = x + gap; xx < x + w - gap; xx += block + gap) {
      const a = 0.08 + rand() * 0.14
      ctx.fillStyle = `rgba(15,23,42,${a.toFixed(3)})`
      ctx.fillRect(xx, yy, block, block)
    }
  }
  ctx.restore()
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.decoding = 'async'
  img.loading = 'eager'
  img.crossOrigin = 'anonymous'
  img.src = src
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`))
  })
  return img
}

let logoImagePromise: Promise<HTMLImageElement> | null = null
async function getLogoImage(): Promise<HTMLImageElement> {
  if (!logoImagePromise) logoImagePromise = loadImage('/logo.png')
  return logoImagePromise
}

export type KeyboardHeatmapShareOptions = {
  dateKey?: string | null
  modeLabel?: string
  hideNumbers?: boolean
  hideKeys?: boolean
  meritLabel?: string
  meritValue?: number | null
  showMeritValue?: boolean
  width?: number
  pixelRatio?: number
  appName?: string
}

export async function renderKeyboardHeatmapSharePng({
  unshiftedCounts,
  shiftedCounts,
  heatLevelCount,
  layoutId,
  platform,
  options,
}: {
  unshiftedCounts: KeyCounts
  shiftedCounts: KeyCounts
  heatLevelCount?: number | null
  layoutId?: KeyboardLayoutId | string | null
  platform: 'mac' | 'windows' | 'linux'
  options?: KeyboardHeatmapShareOptions
}): Promise<{ blob: Blob; suggestedName: string }> {
  const hideNumbers = options?.hideNumbers ?? false
  const hideKeys = options?.hideKeys ?? false
  const meritLabel = options?.meritLabel ?? '今日功德'
  const meritValue = options?.meritValue ?? null
  const showMeritValue = options?.showMeritValue ?? false
  const width = Math.round(options?.width ?? 1080)
  const pixelRatio = Math.max(1, Math.min(4, options?.pixelRatio ?? 2))
  const appName = options?.appName ?? 'CyberZen'

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

  const outerPad = 24
  const cardPadX = 52
  const cardPadY = 44
  const headerH = 126
  const sectionTitleH = 30
  const sectionGap = 22
  const footerH = 52
  const legendH = 28

  const cardW = width - outerPad * 2
  const contentW = cardW - cardPadX * 2
  const keyboardInset = Math.max(10, Math.round(width * 0.012))
  const keyboardInnerW = Math.max(1, contentW - keyboardInset * 2)
  const unitPx = Math.max(3.6, (keyboardInnerW - 1) / Math.max(1, grid.cols))
  const keyGapPx = Math.max(1, Math.round(unitPx * KEY_GAP_RATIO))
  const keyHeightPx = Math.max(18, Math.round(unitPx * GRID_UNIT_SCALE * 1.12))
  const keyboardInnerH = grid.rows * keyHeightPx
  const keyboardContainerH = keyboardInnerH + keyboardInset * 2
  const keyRadiusPx = Math.max(3, Math.round(keyHeightPx * 0.14))
  const labelFontPx = Math.max(10, Math.min(14, Math.round(keyHeightPx * 0.27)))
  const countFontPx = Math.max(8, Math.min(12, Math.round(keyHeightPx * 0.22)))

  const sectionBlockH = sectionTitleH + keyboardContainerH
  const cardH =
    cardPadY +
    headerH +
    sectionGap +
    sectionBlockH +
    sectionGap +
    sectionBlockH +
    sectionGap +
    legendH +
    sectionGap +
    footerH +
    cardPadY
  const height = outerPad * 2 + cardH

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * pixelRatio)
  canvas.height = Math.round(height * pixelRatio)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('CanvasRenderingContext2D unavailable')
  ctx.scale(pixelRatio, pixelRatio)

  // Transparent background
  ctx.clearRect(0, 0, width, height)

  // Card
  const cardX = outerPad
  const cardY = outerPad
  const cardR = 28
  ctx.save()
  ctx.shadowColor = 'rgba(2,6,23,0.18)'
  ctx.shadowBlur = 18
  ctx.shadowOffsetY = 8
  roundRectPath(ctx, cardX, cardY, cardW, cardH, cardR)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.restore()
  ctx.save()
  roundRectPath(ctx, cardX, cardY, cardW, cardH, cardR)
  ctx.strokeStyle = 'rgba(15,23,42,0.08)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.restore()

  const contentX = cardX + cardPadX
  let cursorY = cardY + cardPadY
  const numberFmt = new Intl.NumberFormat('zh-CN')

  // Header
  const logo = await getLogoImage()
  const logoSize = 36
  const logoR = 10
  ctx.save()
  roundRectPath(ctx, contentX, cursorY + 6, logoSize, logoSize, logoR)
  ctx.clip()
  ctx.drawImage(logo, contentX, cursorY + 6, logoSize, logoSize)
  ctx.restore()

  ctx.fillStyle = '#0f172a'
  ctx.font = '700 22px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"'
  ctx.textBaseline = 'top'
  ctx.fillText(meritLabel, contentX + logoSize + 12, cursorY + 3)

  ctx.fillStyle = 'rgba(15,23,42,0.62)'
  ctx.font = '500 13px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
  const sub = `${appName} · 键盘热力图${options?.modeLabel ? ` · ${options.modeLabel}` : ''}`
  ctx.fillText(sub, contentX + logoSize + 12, cursorY + 32)

  const dateKey = options?.dateKey ?? formatYmdLocal(new Date())
  const dateLabel = dateKey || formatYmdLocal(new Date())
  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(15,23,42,0.62)'
  ctx.font = '600 13px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
  ctx.fillText(dateLabel, contentX + contentW, cursorY + 10)
  ctx.textAlign = 'left'

  const meritX = contentX + logoSize + 12
  const meritY = cursorY + 56
  const meritH = 42
  const meritW = Math.max(240, Math.round(contentW * 0.46))
  if (meritValue != null && showMeritValue) {
    ctx.fillStyle = '#0f172a'
    ctx.font = '800 34px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
    ctx.textBaseline = 'top'
    ctx.fillText(numberFmt.format(meritValue), meritX, meritY)
  } else {
    const seed = `${dateLabel}:${String(meritValue ?? '')}`
    drawMosaicPlaceholder({ ctx, x: meritX, y: meritY + 6, w: meritW, h: meritH - 10, seed })
  }

  cursorY += headerH

  const drawKeyboardSection = ({
    title,
    counts,
    showShiftedLabel,
  }: {
    title: string
    counts: KeyCounts
    showShiftedLabel: boolean
  }) => {
    // Section title line
    const sectionTotal = totalKeyCount(counts)
    ctx.fillStyle = 'rgba(15,23,42,0.64)'
    ctx.font = '600 13px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
    ctx.textBaseline = 'top'
    ctx.fillText(title, contentX, cursorY + 2)
    if (!hideNumbers) {
      ctx.textAlign = 'right'
      ctx.fillStyle = 'rgba(15,23,42,0.55)'
      ctx.font = '600 13px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
      ctx.fillText(numberFmt.format(sectionTotal), contentX + contentW, cursorY + 2)
      ctx.textAlign = 'left'
    }

    const keyboardY = cursorY + sectionTitleH
    const keyboardX = contentX
    const keyboardInnerX = keyboardX + keyboardInset
    const keyboardInnerY = keyboardY + keyboardInset
    // Keyboard container
    ctx.save()
    roundRectPath(ctx, keyboardX, keyboardY, contentW, keyboardContainerH, 18)
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

        // Up (top center)
        drawKey({
          code: 'ArrowUp',
          label: '↑',
          x: left + colW + subGapPx,
          y: top,
          w: colW,
          h: halfH,
        })
        // Left / Down / Right (bottom row)
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

  drawKeyboardSection({ title: '无 Shift / 小写 / 数字', counts: unshiftedCounts, showShiftedLabel: false })
  cursorY += sectionGap
  drawKeyboardSection({ title: 'Shift / 大写 / 符号', counts: shiftedCounts, showShiftedLabel: true })
  cursorY += sectionGap

  // Legend
  ctx.fillStyle = 'rgba(15,23,42,0.55)'
  ctx.font = '600 12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
  ctx.textBaseline = 'middle'
  ctx.fillText('少', contentX, cursorY + legendH / 2)

  const levels = heatLevels(heatLevelsCount)
  const swatchSize = 12
  const swatchGap = 6
  const swatchesW = levels.length * swatchSize + Math.max(0, levels.length - 1) * swatchGap
  const swatchesX = contentX + (contentW - swatchesW) / 2
  const swatchY = cursorY + (legendH - swatchSize) / 2
  for (let i = 0; i < levels.length; i += 1) {
    const paint = heatPaint(levels[i], heatLevelsCount)
    const x = swatchesX + i * (swatchSize + swatchGap)
    roundRectPath(ctx, x, swatchY, swatchSize, swatchSize, 4)
    ctx.fillStyle = paint.fill
    ctx.fill()
    ctx.strokeStyle = paint.stroke
    ctx.lineWidth = 1
    ctx.stroke()
  }

  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(15,23,42,0.55)'
  ctx.font = '600 12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
  ctx.fillText('多', contentX + contentW, cursorY + legendH / 2)
  ctx.textAlign = 'left'

  cursorY += legendH + sectionGap

  // Footer / watermark
  ctx.fillStyle = 'rgba(15,23,42,0.5)'
  ctx.font = '600 12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
  ctx.textBaseline = 'top'
  ctx.fillText('由 CyberZen 生成', contentX, cursorY + 10)
  if (!hideNumbers) {
    const total = totalKeyCount(unshiftedCounts) + totalKeyCount(shiftedCounts)
    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(15,23,42,0.45)'
    ctx.font = '600 12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
    ctx.fillText(`总计 ${numberFmt.format(total)}`, contentX + contentW, cursorY + 10)
    ctx.textAlign = 'left'
  }

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Failed to encode PNG'))), 'image/png')
  })

  const safeDate = (dateLabel || formatYmdLocal(new Date())).split('/').join('-')
  const suggestedName = `CyberZen-Heatmap-${safeDate}.png`
  return { blob, suggestedName }
}
