import type { PeriodSummary } from '@/lib/periodSummary'
import type { KeyboardLayoutId, KeyCounts } from '@/lib/keyboard'
import { drawMosaicPlaceholder, getLogoImage, roundRectPath } from './canvasPrimitives'
import { createKeyboardHeatmapBlockLayout, drawKeyboardHeatmapBlock } from './keyboardHeatmapBlock'

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

function formatDateTimeLocal(ms: number, locale: string): string {
  const d = new Date(ms)
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(d)
  } catch {
    try {
      return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(d)
    } catch {
      return d.toLocaleString()
    }
  }
}

function drawClockBadge(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  // container
  ctx.save()
  roundRectPath(ctx, x, y, size, size, Math.max(10, Math.round(size * 0.28)))
  ctx.fillStyle = 'rgba(255,255,255,0.86)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(245,158,11,0.30)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.restore()

  // clock glyph (simple)
  const cx = x + size / 2
  const cy = y + size / 2
  const r = Math.max(8, Math.round(size * 0.28))
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(15,23,42,0.72)'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx, cy - r * 0.55)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + r * 0.45, cy)
  ctx.stroke()
  ctx.restore()
}

export type PeriodSummaryShareOptions = {
  hideNumbers?: boolean
  hideKeys?: boolean
  showMeritValue?: boolean
  width?: number
  pixelRatio?: number
  appName?: string
  locale?: string
  strings?: {
    title?: string
    subtitle?: string
    dateRangeLabel?: string
    dateLine?: string
    coverageLine?: string
    totalMeritTitle?: string
    sourceDistributionTitle?: string
    keyboardLabel?: string
    mouseLabel?: string
    firstEventLabel?: string
    lastEventLabel?: string
    heatmapTitle?: string
    unshiftedSectionTitle?: string
    shiftedSectionTitle?: string
    legendLow?: string
    legendHigh?: string
    generatedBy?: string
    noData?: string
  }
}

export async function renderPeriodSummarySharePng({
  summary,
  unshiftedCounts,
  shiftedCounts,
  heatLevelCount,
  layoutId,
  platform,
  options,
}: {
  summary: PeriodSummary
  unshiftedCounts: KeyCounts
  shiftedCounts: KeyCounts
  heatLevelCount?: number | null
  layoutId?: KeyboardLayoutId | string | null
  platform: 'mac' | 'windows' | 'linux'
  options?: PeriodSummaryShareOptions
}): Promise<{ blob: Blob; suggestedName: string }> {
  const hideNumbers = options?.hideNumbers ?? false
  const hideKeys = options?.hideKeys ?? false
  const showMeritValue = options?.showMeritValue ?? false
  const width = Math.round(options?.width ?? 1080)
  const pixelRatio = Math.max(1, Math.min(4, options?.pixelRatio ?? 2))
  const appName = options?.appName ?? 'CyberZen'
  const locale = options?.locale ?? 'en'
  const strings = options?.strings ?? {}

  const numberFmt = new Intl.NumberFormat(locale)

  const total = Math.max(0, summary.totals.total ?? 0)
  const keyboard = Math.max(0, summary.totals.keyboard ?? 0)
  const mouse = Math.max(0, summary.totals.mouse_single ?? 0)
  const denom = total > 0 ? total : 1
  const keyboardShare = clamp01(keyboard / denom)
  const mouseShare = clamp01(mouse / denom)

  const outerPad = 24
  const cardPadX = 52
  const cardPadY = 44
  const headerH = 112
  const statsH = 292
  const statsGap = 22
  const heatmapGapH = 14
  const footerH = 52

  const cardW = width - outerPad * 2
  const contentW = cardW - cardPadX * 2

  const keyboardBlockLayout = createKeyboardHeatmapBlockLayout({
    width: contentW,
    unshiftedCounts,
    shiftedCounts,
    heatLevelCount,
    layoutId,
    platform,
  })

  const cardH =
    cardPadY +
    headerH +
    statsH +
    statsGap +
    heatmapGapH +
    keyboardBlockLayout.sizes.height +
    footerH +
    cardPadY
  const height = outerPad * 2 + cardH

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * pixelRatio)
  canvas.height = Math.round(height * pixelRatio)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('CanvasRenderingContext2D unavailable')
  ctx.scale(pixelRatio, pixelRatio)

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

  // Subtle top gradient (clipped to card)
  ctx.save()
  roundRectPath(ctx, cardX, cardY, cardW, cardH, cardR)
  ctx.clip()
  const topGradH = cardPadY + headerH + 22
  const g = ctx.createLinearGradient(0, cardY, 0, cardY + topGradH)
  g.addColorStop(0, '#fff7ed') // amber-50
  g.addColorStop(0.55, '#ffffff')
  g.addColorStop(1, '#ffffff')
  ctx.fillStyle = g
  ctx.fillRect(cardX, cardY, cardW, topGradH)
  ctx.restore()

  // Header
  const logo = await getLogoImage()
  const logoSize = 36
  const logoR = 10
  // Enso ring behind logo
  ctx.save()
  ctx.beginPath()
  const cx = contentX + logoSize / 2
  const cy = cursorY + 6 + logoSize / 2
  ctx.arc(cx, cy, logoSize / 2 + 7, Math.PI * 0.12, Math.PI * 1.88)
  ctx.strokeStyle = 'rgba(217,119,6,0.55)'
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.stroke()
  ctx.restore()

  ctx.save()
  roundRectPath(ctx, contentX, cursorY + 6, logoSize, logoSize, logoR)
  ctx.clip()
  ctx.drawImage(logo, contentX, cursorY + 6, logoSize, logoSize)
  ctx.restore()

  ctx.fillStyle = '#0f172a'
  ctx.font = '700 22px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.fillText(strings.title ?? 'Summary', contentX + logoSize + 12, cursorY + 3)

  ctx.fillStyle = 'rgba(15,23,42,0.62)'
  ctx.font = '500 13px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
  const subtitle = strings.subtitle ?? 'Period Summary'
  ctx.fillText(`${appName} · ${subtitle}`, contentX + logoSize + 12, cursorY + 32)

  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(15,23,42,0.62)'
  ctx.font = '600 13px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
  const dateRange = strings.dateRangeLabel ?? `${summary.startKey} ~ ${summary.endKey}`
  if (hideNumbers) {
    const w = Math.max(160, Math.round(contentW * 0.26))
    drawMosaicPlaceholder({ ctx, x: contentX + contentW - w, y: cursorY + 10, w, h: 18, seed: `${dateRange}:${appName}` })
  } else {
    ctx.fillText(dateRange, contentX + contentW, cursorY + 10)
  }
  ctx.textAlign = 'left'

  cursorY += headerH

  // Stats container
  const statsX = contentX
  const statsY = cursorY
  ctx.save()
  roundRectPath(ctx, statsX, statsY, contentW, statsH, 18)
  const bg = ctx.createLinearGradient(statsX, statsY, statsX + contentW, statsY + statsH)
  bg.addColorStop(0, '#ffffff')
  bg.addColorStop(0.42, '#fffbeb') // amber-50
  bg.addColorStop(1, '#f8fafc') // slate-50
  ctx.fillStyle = bg
  ctx.fill()
  ctx.strokeStyle = 'rgba(15,23,42,0.08)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.restore()

  const pad = 22
  const innerX = statsX + pad
  const innerW = contentW - pad * 2

  const fmtPct = (p: number) => `${Math.round(clamp01(p) * 100)}%`
  const accentBorder = 'rgba(245,158,11,0.30)'

  // Title + date/coverage + big number (like UI card)
  ctx.fillStyle = 'rgba(15,23,42,0.72)'
  ctx.font = '700 14px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.fillText(strings.totalMeritTitle ?? 'Merit', innerX, statsY + 16)

  ctx.fillStyle = 'rgba(15,23,42,0.48)'
  ctx.font = '600 12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
  const dateLine = strings.dateLine ?? strings.dateRangeLabel ?? `${summary.startKey} ~ ${summary.endKey}`
  const coverageLine = strings.coverageLine ?? ''
  if (hideNumbers) {
    const w1 = Math.max(140, Math.round(innerW * 0.32))
    drawMosaicPlaceholder({ ctx, x: innerX, y: statsY + 40, w: w1, h: 16, seed: `date:${dateLine}` })
    const w2 = Math.max(140, Math.round(innerW * 0.28))
    drawMosaicPlaceholder({ ctx, x: innerX, y: statsY + 60, w: w2, h: 16, seed: `cov:${coverageLine}` })
  } else {
    ctx.fillText(dateLine, innerX, statsY + 38)
    if (coverageLine) ctx.fillText(coverageLine, innerX, statsY + 58)
  }

  if (total > 0 && showMeritValue) {
    ctx.textAlign = 'right'
    ctx.fillStyle = '#b45309' // amber-700
    ctx.font = '800 52px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
    ctx.fillText(numberFmt.format(total), innerX + innerW, statsY + 10)
    ctx.textAlign = 'left'
  } else if (total > 0 && !showMeritValue) {
    const seed = `${summary.startKey}:${summary.endKey}:total:${String(total)}`
    const w = Math.max(260, Math.round(innerW * 0.42))
    drawMosaicPlaceholder({ ctx, x: innerX + innerW - w, y: statsY + 20, w, h: 42, seed })
  } else {
    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(15,23,42,0.45)'
    ctx.font = '700 16px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
    ctx.fillText(strings.noData ?? 'No data', innerX + innerW, statsY + 18)
    ctx.textAlign = 'left'
  }

  const tileY = statsY + 90
  const tileH = 64
  const tileGap = 14
  const tileW = Math.round((innerW - tileGap) / 2)

  const drawSmallTile = ({
    x,
    y,
    label,
    value,
    seed,
  }: {
    x: number
    y: number
    label: string
    value: string
    seed: string
  }) => {
    const iconSize = 38
    ctx.save()
    roundRectPath(ctx, x, y, tileW, tileH, 16)
    ctx.fillStyle = 'rgba(255,255,255,0.72)'
    ctx.fill()
    ctx.strokeStyle = accentBorder
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.restore()

    drawClockBadge(ctx, x + 14, y + Math.round((tileH - iconSize) / 2), iconSize)

    const textX = x + 14 + iconSize + 12
    ctx.fillStyle = 'rgba(15,23,42,0.55)'
    ctx.font = '700 12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.fillText(label, textX, y + 14)

    if (hideNumbers) {
      drawMosaicPlaceholder({ ctx, x: textX, y: y + 34, w: Math.max(140, Math.round(tileW * 0.55)), h: 18, seed })
      return
    }
    ctx.fillStyle = '#0f172a'
    ctx.font = '800 18px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
    ctx.fillText(value, textX, y + 32)
  }

  drawSmallTile({
    x: innerX,
    y: tileY,
    label: strings.firstEventLabel ?? 'First',
    value: summary.firstEventAtMs != null ? formatDateTimeLocal(summary.firstEventAtMs, locale) : '—',
    seed: `first:${String(summary.firstEventAtMs ?? '')}`,
  })
  drawSmallTile({
    x: innerX + tileW + tileGap,
    y: tileY,
    label: strings.lastEventLabel ?? 'Last',
    value: summary.lastEventAtMs != null ? formatDateTimeLocal(summary.lastEventAtMs, locale) : '—',
    seed: `last:${String(summary.lastEventAtMs ?? '')}`,
  })

  // Source distribution
  ctx.fillStyle = 'rgba(15,23,42,0.70)'
  ctx.font = '700 13px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.fillText(strings.sourceDistributionTitle ?? 'Source distribution', innerX, tileY + tileH + 22)

  const distY = tileY + tileH + 54
  const distH = 92
  const distW = tileW

  const drawDistTile = ({
    x,
    y,
    label,
    value,
    share,
    color,
    seed,
  }: {
    x: number
    y: number
    label: string
    value: number
    share: number
    color: string
    seed: string
  }) => {
    ctx.save()
    roundRectPath(ctx, x, y, distW, distH, 18)
    ctx.fillStyle = 'rgba(255,255,255,0.72)'
    ctx.fill()
    ctx.strokeStyle = accentBorder
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.restore()

    // top row: dot + label, right pct
    const dotR = 7
    const dotCx = x + 18
    const dotCy = y + 22
    ctx.save()
    ctx.beginPath()
    ctx.arc(dotCx, dotCy, dotR, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.restore()

    ctx.fillStyle = 'rgba(15,23,42,0.58)'
    ctx.font = '700 12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.fillText(label, x + 34, y + 14)

    if (hideNumbers) {
      drawMosaicPlaceholder({ ctx, x: x + distW - Math.max(48, Math.round(distW * 0.18)) - 16, y: y + 14, w: Math.max(48, Math.round(distW * 0.18)), h: 16, seed: `${seed}:pct` })
      drawMosaicPlaceholder({ ctx, x: x + 16, y: y + 34, w: Math.max(120, Math.round(distW * 0.42)), h: 26, seed: `${seed}:value` })
    } else {
      ctx.textAlign = 'right'
      ctx.fillStyle = 'rgba(15,23,42,0.55)'
      ctx.font = '700 12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
      ctx.fillText(fmtPct(share), x + distW - 16, y + 14)
      ctx.textAlign = 'left'

      ctx.fillStyle = '#0f172a'
      ctx.font = '800 28px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
      ctx.fillText(numberFmt.format(value), x + 16, y + 32)
    }

    const barX = x + 16
    const barY = y + distH - 22
    const barW = distW - 32
    const barH = 10
    ctx.save()
    roundRectPath(ctx, barX, barY, barW, barH, 999)
    ctx.fillStyle = 'rgba(15,23,42,0.06)'
    ctx.fill()
    ctx.clip()
    ctx.fillStyle = color
    ctx.fillRect(barX, barY, Math.round(barW * clamp01(share)), barH)
    ctx.restore()
  }

  drawDistTile({
    x: innerX,
    y: distY,
    label: strings.keyboardLabel ?? 'Keyboard',
    value: keyboard,
    share: keyboardShare,
    color: '#0d9488',
    seed: `keyboard:${keyboard}:${keyboardShare}`,
  })
  drawDistTile({
    x: innerX + distW + tileGap,
    y: distY,
    label: strings.mouseLabel ?? 'Mouse',
    value: mouse,
    share: mouseShare,
    color: '#d97706',
    seed: `mouse:${mouse}:${mouseShare}`,
  })

  cursorY += statsH + statsGap

  cursorY += heatmapGapH

  drawKeyboardHeatmapBlock({
    ctx,
    x: contentX,
    y: cursorY,
    width: contentW,
    unshiftedCounts,
    shiftedCounts,
    hideNumbers,
    hideKeys,
    locale,
    strings: {
      unshiftedSectionTitle: strings.unshiftedSectionTitle ?? 'Unshifted',
      shiftedSectionTitle: strings.shiftedSectionTitle ?? 'Shifted',
      legendLow: strings.legendLow ?? 'Low',
      legendHigh: strings.legendHigh ?? 'High',
    },
    layout: keyboardBlockLayout,
  })
  cursorY += keyboardBlockLayout.sizes.height

  // Footer
  ctx.fillStyle = 'rgba(15,23,42,0.5)'
  ctx.font = '600 12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.fillText(strings.generatedBy ?? `Generated by ${appName}`, contentX, cursorY + 10)

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Failed to encode PNG'))), 'image/png')
  })

  const safeEnd = String(summary.endKey || '').split('/').join('-')
  const suggestedName = `CyberZen-Summary-${safeEnd}.png`
  return { blob, suggestedName }
}
