import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
  computeHeatThresholds,
  heatClass,
  heatLevelForValue,
  heatLevels,
  isHeatDark,
  normalizeHeatLevelCount,
} from './heatScale'

type Counts = Record<string, number>

function sumCounts(counts: Counts): number {
  let sum = 0
  for (const v of Object.values(counts)) sum += v
  return sum
}

const BUTTONS = [
  { code: 'MouseLeft', label: '左键', flex: 1 },
  { code: 'MouseRight', label: '右键', flex: 1 },
] as const

export function MouseButtonsHeatmap({ counts, heatLevelCount }: { counts: Counts; heatLevelCount?: number }) {
  const heatLevelsCount = useMemo(() => normalizeHeatLevelCount(heatLevelCount), [heatLevelCount])
  const stats = useMemo(() => {
    const values = BUTTONS.map((b) => counts[b.code] ?? 0)
    const max = values.reduce((acc, v) => Math.max(acc, v), 0)
    return { max, thresholds: computeHeatThresholds(values, heatLevelsCount) }
  }, [counts, heatLevelsCount])

  const total = sumCounts(counts)
  const hasAny = total > 0

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-slate-500">鼠标按钮分布</div>
        <div className="text-xs text-slate-500 tabular-nums">{total.toLocaleString()}</div>
      </div>

      {!hasAny ? (
        <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
          暂无鼠标按钮记录
        </div>
      ) : (
        <div className="flex gap-2">
          {BUTTONS.map((b) => {
            const count = counts[b.code] ?? 0
            const level = heatLevelForValue(count, stats.max, stats.thresholds, heatLevelsCount)
            return (
              <div
                key={b.code}
                className={cn(
                  'h-14 rounded-lg border px-3 py-2 text-[12px] leading-tight select-none',
                  'flex flex-col justify-between',
                  heatClass(level, heatLevelsCount)
                )}
                style={{ flex: b.flex }}
                title={`${b.code}  ${count.toLocaleString()}`}
                data-no-drag
              >
                <div className={cn('font-medium', isHeatDark(level, heatLevelsCount) ? 'text-white' : 'text-slate-800')}>
                  {b.label}
                </div>
                <div className={cn('tabular-nums', isHeatDark(level, heatLevelsCount) ? 'text-white/90' : 'text-slate-500')}>
                  {count > 0 ? count.toLocaleString() : ''}
                </div>
              </div>
            )
          })}
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
