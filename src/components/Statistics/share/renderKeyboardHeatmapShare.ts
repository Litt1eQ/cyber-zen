import { type KeyCounts, totalKeyCount, type KeyboardLayoutId } from '@/lib/keyboard'
import { drawMosaicPlaceholder, formatYmdLocal, getLogoImage, roundRectPath } from './canvasPrimitives'
import { createKeyboardHeatmapBlockLayout, drawKeyboardHeatmapBlock } from './keyboardHeatmapBlock'

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
  locale?: string
  strings?: {
    subtitle?: string
    unshiftedSectionTitle?: string
    shiftedSectionTitle?: string
    legendLow?: string
    legendHigh?: string
    generatedBy?: string
    totalLabel?: string
  }
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
  const meritLabel = options?.meritLabel ?? 'Merit'
  const meritValue = options?.meritValue ?? null
  const showMeritValue = options?.showMeritValue ?? false
  const width = Math.round(options?.width ?? 1080)
  const pixelRatio = Math.max(1, Math.min(4, options?.pixelRatio ?? 2))
  const appName = options?.appName ?? 'CyberZen'
  const locale = options?.locale ?? 'en'
  const strings = options?.strings ?? {}

  const outerPad = 24
  const cardPadX = 52
  const cardPadY = 44
  const headerH = 126
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

  const cardH = cardPadY + headerH + keyboardBlockLayout.sizes.height + footerH + cardPadY
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
  const numberFmt = new Intl.NumberFormat(locale)

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
  ctx.fillText(meritLabel, contentX + logoSize + 12, cursorY + 3)

  ctx.fillStyle = 'rgba(15,23,42,0.62)'
  ctx.font = '500 13px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
  const subtitle = strings.subtitle ?? 'Keyboard Heatmap'
  const sub = `${appName} · ${subtitle}${options?.modeLabel ? ` · ${options.modeLabel}` : ''}`
  ctx.fillText(sub, contentX + logoSize + 12, cursorY + 32)

  const dateKey = options?.dateKey ?? formatYmdLocal(new Date())
  const dateLabel = dateKey || formatYmdLocal(new Date())
  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(15,23,42,0.62)'
  ctx.font = '600 13px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
  if (hideNumbers) {
    const w = Math.max(160, Math.round(contentW * 0.26))
    drawMosaicPlaceholder({ ctx, x: contentX + contentW - w, y: cursorY + 10, w, h: 18, seed: `${dateLabel}:${appName}` })
  } else {
    ctx.fillText(dateLabel, contentX + contentW, cursorY + 10)
  }
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

  // Footer / watermark
  ctx.fillStyle = 'rgba(15,23,42,0.5)'
  ctx.font = '600 12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.fillText(strings.generatedBy ?? `Generated by ${appName}`, contentX, cursorY + 10)
  if (!hideNumbers) {
    const total = totalKeyCount(unshiftedCounts) + totalKeyCount(shiftedCounts)
    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(15,23,42,0.45)'
    ctx.font = '600 12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
    ctx.fillText(`${strings.totalLabel ?? 'Total'} ${numberFmt.format(total)}`, contentX + contentW, cursorY + 10)
    ctx.textAlign = 'left'
  }

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Failed to encode PNG'))), 'image/png')
  })

  const safeDate = (dateLabel || formatYmdLocal(new Date())).split('/').join('-')
  const suggestedName = `CyberZen-Heatmap-${safeDate}.png`
  return { blob, suggestedName }
}
