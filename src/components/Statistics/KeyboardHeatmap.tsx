import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { buildKeySpecIndex, type KeyCounts, getUSQwertyLayout, totalKeyCount } from '@/lib/keyboard'
import { isLinux, isMac, isWindows } from '@/utils/platform'
import {
  computeHeatThresholds,
  heatClass,
  heatLevelForValue,
  heatLevels,
  isHeatDark,
  normalizeHeatLevelCount,
} from './heatScale'

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
  layout: ReturnType<typeof getUSQwertyLayout>
  counts: KeyCounts
  max: number
  thresholds: number[] | null
  heatLevelCount: number
  showShiftedLabel: boolean
}) {
  const keyIndex = useMemo(() => buildKeySpecIndex(layout), [layout])
  const total = totalKeyCount(counts)

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
        <div className="overflow-x-auto">
          <div className="space-y-1 pr-1">
            {layout.map((row, rowIdx) => (
              <div key={rowIdx} className="flex gap-1">
                {row.map((key) => {
                  const count = counts[key.code] ?? 0
                  const level = heatLevelForValue(count, max, thresholds, heatLevelCount)
                  const label = showShiftedLabel ? key.shiftLabel ?? key.label : key.label
                  const rawLabel = keyIndex[key.code]?.label ?? key.label
                  return (
                    <div
                      key={key.code}
                      className={cn(
                        'h-10 min-w-[2.25rem] rounded-lg border px-2 py-1 text-[11px] leading-tight select-none',
                        'flex flex-col justify-between',
                        heatClass(level, heatLevelCount)
                      )}
                      style={{ flex: key.width ?? 1 }}
                      title={`${key.code} (${rawLabel}${key.shiftLabel ? `/${key.shiftLabel}` : ''})  ${count.toLocaleString()}`}
                      data-no-drag
                    >
                      <div
                        className={cn(
                          'font-medium truncate',
                          isHeatDark(level, heatLevelCount) ? 'text-white' : 'text-slate-800'
                        )}
                      >
                        {label}
                      </div>
                      <div
                        className={cn(
                          'tabular-nums truncate',
                          isHeatDark(level, heatLevelCount) ? 'text-white/90' : 'text-slate-500'
                        )}
                      >
                        {count > 0 ? count.toLocaleString() : ''}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
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
}: {
  unshiftedCounts: KeyCounts
  shiftedCounts: KeyCounts
  heatLevelCount?: number
}) {
  const heatLevelsCount = useMemo(() => normalizeHeatLevelCount(heatLevelCount), [heatLevelCount])
  const platform = useMemo(() => {
    if (isMac()) return 'mac'
    if (isWindows()) return 'windows'
    if (isLinux()) return 'linux'
    return 'windows'
  }, [])

  const layout = useMemo(() => getUSQwertyLayout(platform), [platform])

  const combinedStats = useMemo(() => {
    const values: number[] = []
    for (const row of layout) {
      for (const key of row) {
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
