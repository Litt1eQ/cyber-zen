import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  buildKeySpecIndex,
  type KeyCounts,
  getKeyboardLayout,
  type KeyboardLayoutId,
  type KeySpec,
  totalKeyCount,
  normalizeKeyboardLayoutId,
} from '@/lib/keyboard'
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
const KEY_GAP_RATIO = 0.26

type Placement = {
  key: KeySpec
  row: number
  col: number
  w: number
  h: number
}

type KeyContentMode = 'heatmap' | 'keys' | 'keysAndCounts'

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
  layout,
  counts,
  max,
  thresholds,
  heatLevelCount,
  showShiftedLabel,
}: {
  title: string
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
  const labelFontPx = useMemo(() => Math.max(9, Math.min(13, Math.round(keyHeightPx * 0.28))), [keyHeightPx])
  const countFontPx = useMemo(() => Math.max(8, Math.min(12, Math.round(keyHeightPx * 0.25))), [keyHeightPx])
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
              const keyPaddingPx =
                keyContentMode === 'heatmap' ? Math.max(1, Math.round(keyHeightPx * 0.08)) : Math.max(2, Math.round(keyHeightPx * 0.14))

              const left = col * unitPx + keyGapPx
              const top = row * keyHeightPx + keyGapPx
              const width = w * unitPx - keyGapPx * 2
              const height = h * keyHeightPx - keyGapPx * 2

              return (
                <div
                  key={`${key.code}:${row}:${col}`}
                  className={cn(
                    'absolute border select-none',
                    keyContentMode === 'keysAndCounts' && 'flex flex-col justify-between',
                    keyContentMode === 'keys' && 'flex items-center justify-center',
                    keyContentMode === 'heatmap' && 'flex items-center justify-center',
                    heatClass(level, heatLevelCount)
                  )}
                  style={{
                    left,
                    top,
                    width: Math.max(1, width),
                    height: Math.max(1, height),
                    padding: keyPaddingPx,
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
                        'font-medium truncate',
                        keyContentMode === 'keysAndCounts' ? '' : 'text-center',
                        isHeatDark(level, heatLevelCount) ? 'text-white' : 'text-slate-800'
                      )}
                      style={{ fontSize: labelFontPx, lineHeight: 1.1 }}
                    >
                      {label}
                    </div>
                  )}
                  {keyContentMode === 'keysAndCounts' && (
                    <div
                      className={cn(
                        'tabular-nums truncate',
                        isHeatDark(level, heatLevelCount) ? 'text-white/90' : 'text-slate-500'
                      )}
                      style={{ fontSize: countFontPx, lineHeight: 1.1 }}
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
    const max = values.reduce((acc, v) => Math.max(acc, v), 0)
    return { max, thresholds: computeHeatThresholds(values, heatLevelsCount) }
  }, [heatLevelsCount, layout, shiftedCounts, unshiftedCounts])

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
            layout={layout}
            counts={unshiftedCounts}
            max={combinedStats.max}
            thresholds={combinedStats.thresholds}
            heatLevelCount={heatLevelsCount}
            showShiftedLabel={false}
          />
          <KeyboardView
            title="Shift / 大写 / 符号"
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
