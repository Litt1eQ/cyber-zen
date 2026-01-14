import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  buildKeySpecIndex,
  type KeyCounts,
  getKeyboardLayout,
  MBP_NO_TOUCHBAR_ARROW_CLUSTER_CODE,
  MBP_TOUCHBAR_ARROW_CLUSTER_CODE,
  type KeyboardLayoutId,
  type KeySpec,
  totalKeyCount,
  normalizeKeyboardLayoutId,
} from '@/lib/keyboard'
import {
  LayoutGrid,
  Mic,
  Moon,
  Play,
  Power,
  Search,
  SkipBack,
  SkipForward,
  Sun,
  SunDim,
  Volume1,
  Volume2,
  VolumeX,
  type LucideIcon,
} from 'lucide-react'
import { isLinux, isMac, isWindows } from '@/utils/platform'
import {
  computeHeatThresholds,
  heatClass,
  heatLevelForValue,
  heatLevels,
  isHeatDark,
  normalizeHeatLevelCount,
} from './heatScale'

const GRID_UNIT_SCALE = 4 // 0.25u resolution
const KEY_GAP_RATIO = 0.22
const KEY_PADDING_Y_RATIO = 0.085
const KEY_PADDING_X_RATIO = 0.095
const LABEL_FONT_RATIO = 0.27
const COUNT_FONT_RATIO = 0.22
const ESC_FONT_RATIO = 0.82

type Placement = {
  key: KeySpec
  row: number
  col: number
  w: number
  h: number
}

type KeyContentMode = 'heatmap' | 'keys' | 'keysAndCounts'

const MAC_MBP_FN_ICON_BY_CODE: Partial<
  Record<
    string,
    {
      Icon: LucideIcon
      ariaLabel: string
    }
  >
> = {
  F1: { Icon: SunDim, ariaLabel: 'Brightness Down' },
  F2: { Icon: Sun, ariaLabel: 'Brightness Up' },
  F3: { Icon: LayoutGrid, ariaLabel: 'Mission Control' },
  F4: { Icon: Search, ariaLabel: 'Spotlight' },
  F5: { Icon: Mic, ariaLabel: 'Dictation' },
  F6: { Icon: Moon, ariaLabel: 'Do Not Disturb' },
  F7: { Icon: SkipBack, ariaLabel: 'Previous Track' },
  F8: { Icon: Play, ariaLabel: 'Play/Pause' },
  F9: { Icon: SkipForward, ariaLabel: 'Next Track' },
  F10: { Icon: VolumeX, ariaLabel: 'Mute' },
  F11: { Icon: Volume1, ariaLabel: 'Volume Down' },
  F12: { Icon: Volume2, ariaLabel: 'Volume Up' },
  Power: { Icon: Power, ariaLabel: 'Power' },
}

function approxTextWidthPx(text: string, fontSizePx: number): number {
  // Roughly matches typical sans-serif proportions; used only for best-effort fitting.
  return text.length * fontSizePx * 0.62
}

function fittedFontPx({
  text,
  baseFontPx,
  minFontPx,
  availableWidthPx,
}: {
  text: string
  baseFontPx: number
  minFontPx: number
  availableWidthPx: number
}): number {
  if (!text) return baseFontPx
  if (!Number.isFinite(availableWidthPx) || availableWidthPx <= 0) return minFontPx

  const estimated = approxTextWidthPx(text, baseFontPx)
  if (estimated <= availableWidthPx) return baseFontPx

  const scaled = Math.floor(baseFontPx * (availableWidthPx / estimated))
  return Math.max(minFontPx, Math.min(baseFontPx, scaled))
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
        for (let dc = 0; dc < w; dc++) {
          occupied[rr][col + dc] = true
        }
      }

      maxCol = Math.max(maxCol, col + w)
      if (key.kind !== 'spacer') placements.push({ key, row, col, w, h })
      col += w
    }
  }

  return { placements, cols: maxCol, rows: layout.length }
}

function KeyboardView({
  title,
  layoutId,
  layout,
  counts,
  max,
  thresholds,
  heatLevelCount,
  showShiftedLabel,
}: {
  title: string
  layoutId?: KeyboardLayoutId
  layout: ReturnType<typeof getKeyboardLayout>
  counts: KeyCounts
  max: number
  thresholds: number[] | null
  heatLevelCount: number
  showShiftedLabel: boolean
}) {
  const keyIndex = useMemo(() => buildKeySpecIndex(layout), [layout])
  const total = totalKeyCount(counts)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [hostWidth, setHostWidth] = useState(0)

  const grid = useMemo(() => computePlacements(layout), [layout])

  useLayoutEffect(() => {
    const el = hostRef.current
    if (!el) return
    setHostWidth(el.getBoundingClientRect().width)
    const ro = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect?.width ?? 0
      setHostWidth(next)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const unitPx = useMemo(() => {
    if (!hostWidth || !grid.cols) return 8
    // keep a tiny safety margin to avoid 1px overflow due to rounding
    return Math.max(4, (hostWidth - 1) / grid.cols)
  }, [grid.cols, hostWidth])

  const keyGapPx = useMemo(() => Math.max(1, Math.round(unitPx * KEY_GAP_RATIO)), [unitPx])
  const keyHeightPx = useMemo(() => Math.max(18, Math.round(unitPx * GRID_UNIT_SCALE * 1.12)), [unitPx])
  const keyboardHeight = useMemo(() => grid.rows * keyHeightPx, [grid.rows, keyHeightPx])
  const labelFontPx = useMemo(() => Math.max(9, Math.min(13, Math.round(keyHeightPx * LABEL_FONT_RATIO))), [keyHeightPx])
  const countFontPx = useMemo(() => Math.max(7, Math.min(11, Math.round(keyHeightPx * COUNT_FONT_RATIO))), [keyHeightPx])
  const keyRadiusPx = useMemo(() => Math.max(3, Math.round(keyHeightPx * 0.14)), [keyHeightPx])

  const keyContentMode: KeyContentMode = useMemo(() => {
    if (unitPx < 6 || keyHeightPx < 22) return 'heatmap'
    if (unitPx < 8 || keyHeightPx < 28) return 'keys'
    return 'keysAndCounts'
  }, [keyHeightPx, unitPx])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-slate-500">{title}</div>
        <div className="text-xs text-slate-500 tabular-nums">{total.toLocaleString()}</div>
      </div>

      {total <= 0 ? (
        <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-3 py-5 text-center text-sm text-slate-500">
          暂无记录
        </div>
      ) : (
        <div ref={hostRef} className="w-full overflow-hidden">
          <div className="relative w-full" style={{ height: keyboardHeight }} data-no-drag>
            {grid.placements.map(({ key, row, col, w, h }) => {
              const count = counts[key.code] ?? 0
              const level = heatLevelForValue(count, max, thresholds, heatLevelCount)
              const label = showShiftedLabel ? key.shiftLabel ?? key.label : key.label
              const rawLabel = keyIndex[key.code]?.label ?? key.label
              const macFnIcon =
                layoutId === 'macbook_pro_no_touchbar' && MAC_MBP_FN_ICON_BY_CODE[key.code]
                  ? MAC_MBP_FN_ICON_BY_CODE[key.code]
                  : null
              const useMacFnIcon = Boolean(macFnIcon) && !showShiftedLabel
              const paddingY =
                keyContentMode === 'heatmap'
                  ? Math.max(1, Math.round(keyHeightPx * 0.08))
                  : Math.max(2, Math.round(keyHeightPx * KEY_PADDING_Y_RATIO))
              const paddingX =
                keyContentMode === 'heatmap'
                  ? Math.max(1, Math.round(keyHeightPx * 0.08))
                  : Math.max(2, Math.round(keyHeightPx * KEY_PADDING_X_RATIO))

              const left = col * unitPx + keyGapPx
              const top = row * keyHeightPx + keyGapPx
              const width = w * unitPx - keyGapPx * 2
              const height = h * keyHeightPx - keyGapPx * 2
              const availableLabelWidthPx = Math.max(0, width - paddingX * 2)

              const keyLabelBaseFontPx = key.code === 'Escape' ? Math.max(8, Math.round(labelFontPx * ESC_FONT_RATIO)) : labelFontPx
              const fittedLabelFontPx = fittedFontPx({
                text: label,
                baseFontPx: keyLabelBaseFontPx,
                minFontPx: 7,
                availableWidthPx: availableLabelWidthPx,
              })
              const fittedCountFontPx = fittedFontPx({
                text: count > 0 ? count.toLocaleString() : '',
                baseFontPx: countFontPx,
                minFontPx: 7,
                availableWidthPx: availableLabelWidthPx,
              })

              const isNoTouchBarArrowCluster = layoutId === 'macbook_pro_no_touchbar' && key.code === MBP_NO_TOUCHBAR_ARROW_CLUSTER_CODE
              const isTouchBarArrowCluster = layoutId === 'macbook_pro' && key.code === MBP_TOUCHBAR_ARROW_CLUSTER_CODE
              if (isNoTouchBarArrowCluster || isTouchBarArrowCluster) {
                const subGapPx = Math.max(1, Math.round(keyGapPx * 0.85))
                const colWidth = Math.max(1, (width - subGapPx * 2) / 3)
                const halfHeight = Math.max(1, (height - subGapPx) / 2)

                const arrowLabelBaseFontPx = Math.max(9, Math.min(14, Math.round(halfHeight * 0.62)))
                const arrowCountBaseFontPx = Math.max(7, Math.min(11, Math.round(halfHeight * 0.42)))

                const renderArrowKey = ({
                  code,
                  glyph,
                  x,
                  y,
                  w,
                  h,
                }: {
                  code: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'
                  glyph: string
                  x: number
                  y: number
                  w: number
                  h: number
                }) => {
                  const subCount = counts[code] ?? 0
                  const subLevel = heatLevelForValue(subCount, max, thresholds, heatLevelCount)
                  const fittedArrowLabelFontPx = fittedFontPx({
                    text: glyph,
                    baseFontPx: arrowLabelBaseFontPx,
                    minFontPx: 8,
                    availableWidthPx: Math.max(0, w - paddingX * 2),
                  })
                  const countText = subCount > 0 ? subCount.toLocaleString() : ''
                  const countAvailableWidthPx = Math.max(
                    0,
                    w - paddingX * 2 - approxTextWidthPx(glyph, fittedArrowLabelFontPx) - Math.max(2, Math.round(paddingX * 0.5))
                  )
                  const fittedArrowCountFontPx = fittedFontPx({
                    text: countText,
                    baseFontPx: arrowCountBaseFontPx,
                    minFontPx: 7,
                    availableWidthPx: countAvailableWidthPx,
                  })

                  return (
                    <div
                      key={code}
                      className={cn('absolute border select-none', heatClass(subLevel, heatLevelCount))}
                      style={{
                        left: x,
                        top: y,
                        width: w,
                        height: h,
                        borderRadius: keyRadiusPx,
                      }}
                      title={`${code} (${glyph})  ${subCount.toLocaleString()}`}
                      data-no-drag
                    >
                      {keyContentMode === 'heatmap' ? (
                        <span className="sr-only">{glyph}</span>
                      ) : (
                        <div
                          className={cn(
                            'h-full w-full flex items-center justify-center',
                            isHeatDark(subLevel, heatLevelCount) ? 'text-white' : 'text-slate-800'
                          )}
                          style={{ padding: `${Math.max(1, Math.round(paddingY * 0.75))}px ${Math.max(1, Math.round(paddingX * 0.75))}px` }}
                        >
                          {keyContentMode === 'keysAndCounts' ? (
                            <div className="flex items-center justify-center gap-1 tabular-nums">
                              <span style={{ fontSize: fittedArrowLabelFontPx, lineHeight: 1.05 }}>{glyph}</span>
                              <span
                                className={cn(isHeatDark(subLevel, heatLevelCount) ? 'text-white/90' : 'text-slate-700')}
                                style={{ fontSize: fittedArrowCountFontPx, lineHeight: 1.05 }}
                              >
                                {countText}
                              </span>
                            </div>
                          ) : (
                            <span className="font-medium" style={{ fontSize: fittedArrowLabelFontPx, lineHeight: 1.05 }}>
                              {glyph}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                }

                const x0 = 0
                const x1 = colWidth + subGapPx
                const x2 = (colWidth + subGapPx) * 2
                const yTop = 0
                const yBottom = halfHeight + subGapPx

                return (
                  <div
                    key={`${key.code}:${row}:${col}`}
                    className="absolute"
                    style={{
                      left,
                      top,
                      width: Math.max(1, width),
                      height: Math.max(1, height),
                    }}
                    data-no-drag
                  >
                    {isNoTouchBarArrowCluster ? (
                      <>
                        {renderArrowKey({ code: 'ArrowUp', glyph: '↑', x: x1, y: yTop, w: colWidth, h: halfHeight })}
                        {renderArrowKey({ code: 'ArrowLeft', glyph: '←', x: x0, y: yBottom, w: colWidth, h: halfHeight })}
                        {renderArrowKey({ code: 'ArrowDown', glyph: '↓', x: x1, y: yBottom, w: colWidth, h: halfHeight })}
                        {renderArrowKey({ code: 'ArrowRight', glyph: '→', x: x2, y: yBottom, w: colWidth, h: halfHeight })}
                      </>
                    ) : (
                      <>
                        {renderArrowKey({ code: 'ArrowLeft', glyph: '←', x: x0, y: 0, w: colWidth, h: Math.max(1, height) })}
                        {renderArrowKey({ code: 'ArrowRight', glyph: '→', x: x2, y: 0, w: colWidth, h: Math.max(1, height) })}
                        {renderArrowKey({ code: 'ArrowUp', glyph: '↑', x: x1, y: yTop, w: colWidth, h: halfHeight })}
                        {renderArrowKey({ code: 'ArrowDown', glyph: '↓', x: x1, y: yBottom, w: colWidth, h: halfHeight })}
                      </>
                    )}
                  </div>
                )
              }

              return (
                <div
                  key={`${key.code}:${row}:${col}`}
                  className={cn(
                    'absolute border select-none',
                    keyContentMode === 'keysAndCounts' && 'flex flex-col items-start justify-between',
                    keyContentMode === 'keys' && 'flex items-center justify-center',
                    keyContentMode === 'heatmap' && 'flex items-center justify-center',
                    heatClass(level, heatLevelCount)
                  )}
                  style={{
                    left,
                    top,
                    width: Math.max(1, width),
                    height: Math.max(1, height),
                    padding: `${paddingY}px ${paddingX}px`,
                    borderRadius: keyRadiusPx,
                  }}
                  title={`${key.code} (${rawLabel}${key.shiftLabel ? `/${key.shiftLabel}` : ''})  ${count.toLocaleString()}`}
                  data-no-drag
                >
                  {keyContentMode === 'heatmap' ? (
                    <span className="sr-only">{label}</span>
                  ) : (
                    <div
                      className={cn(
                        'font-medium min-w-0 w-full',
                        useMacFnIcon ? 'flex items-center justify-center' : 'truncate',
                        keyContentMode === 'keysAndCounts' ? (useMacFnIcon ? 'text-center' : 'text-left') : 'text-center',
                        isHeatDark(level, heatLevelCount) ? 'text-white' : 'text-slate-800'
                      )}
                      style={{ fontSize: fittedLabelFontPx, lineHeight: 1.2 }}
                    >
                      {useMacFnIcon && macFnIcon ? (
                        <macFnIcon.Icon
                          className="shrink-0"
                          size={Math.max(10, Math.min(16, Math.round(keyHeightPx * 0.36)))}
                          strokeWidth={2}
                          aria-label={macFnIcon.ariaLabel}
                        />
                      ) : (
                        label
                      )}
                    </div>
                  )}
                  {keyContentMode === 'keysAndCounts' && (
                    <div
                      className={cn(
                        'tabular-nums truncate min-w-0 w-full',
                        isHeatDark(level, heatLevelCount) ? 'text-white/90' : 'text-slate-500'
                      )}
                      style={{ fontSize: fittedCountFontPx, lineHeight: 1.15 }}
                    >
                      {count > 0 ? count.toLocaleString() : ''}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export function KeyboardHeatmap({
  unshiftedCounts,
  shiftedCounts,
  heatLevelCount,
  layoutId,
}: {
  unshiftedCounts: KeyCounts
  shiftedCounts: KeyCounts
  heatLevelCount?: number
  layoutId?: KeyboardLayoutId | string | null
}) {
  const heatLevelsCount = useMemo(() => normalizeHeatLevelCount(heatLevelCount), [heatLevelCount])
  const platform = useMemo(() => {
    if (isMac()) return 'mac'
    if (isWindows()) return 'windows'
    if (isLinux()) return 'linux'
    return 'windows'
  }, [])

  const normalizedLayoutId = useMemo(() => normalizeKeyboardLayoutId(layoutId), [layoutId])
  const layout = useMemo(() => getKeyboardLayout(normalizedLayoutId, platform), [normalizedLayoutId, platform])

  const combinedStats = useMemo(() => {
    const values: number[] = []
    for (const row of layout) {
      for (const key of row) {
        if (key.kind === 'spacer') continue
        const u = unshiftedCounts[key.code] ?? 0
        const s = shiftedCounts[key.code] ?? 0
        values.push(u, s)
      }
    }
    if (normalizedLayoutId === 'macbook_pro_no_touchbar' || normalizedLayoutId === 'macbook_pro') {
      for (const code of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'] as const) {
        values.push(unshiftedCounts[code] ?? 0, shiftedCounts[code] ?? 0)
      }
    }
    const max = values.reduce((acc, v) => Math.max(acc, v), 0)
    return { max, thresholds: computeHeatThresholds(values, heatLevelsCount) }
  }, [heatLevelsCount, layout, normalizedLayoutId, shiftedCounts, unshiftedCounts])

  const total = totalKeyCount(unshiftedCounts) + totalKeyCount(shiftedCounts)
  const hasAny = total > 0

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-slate-500">击键分布（区分 Shift）</div>
        <div className="text-xs text-slate-500 tabular-nums">{total.toLocaleString()}</div>
      </div>

      {!hasAny ? (
        <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
          暂无键盘记录
        </div>
      ) : (
        <div className="space-y-4">
          <KeyboardView
            title="无 Shift / 小写 / 数字"
            layoutId={normalizedLayoutId}
            layout={layout}
            counts={unshiftedCounts}
            max={combinedStats.max}
            thresholds={combinedStats.thresholds}
            heatLevelCount={heatLevelsCount}
            showShiftedLabel={false}
          />
          <KeyboardView
            title="Shift / 大写 / 符号"
            layoutId={normalizedLayoutId}
            layout={layout}
            counts={shiftedCounts}
            max={combinedStats.max}
            thresholds={combinedStats.thresholds}
            heatLevelCount={heatLevelsCount}
            showShiftedLabel
          />
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>少</span>
        <div className="flex items-center gap-1" aria-hidden="true">
          {heatLevels(heatLevelsCount).map((lv) => (
            <span key={lv} className={cn('h-3 w-3 rounded border', heatClass(lv, heatLevelsCount))} />
          ))}
        </div>
        <span>多</span>
      </div>
    </div>
  )
}
