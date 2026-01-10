import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { type KeyCounts, US_QWERTY_LAYOUT, totalKeyCount } from '@/lib/keyboard'

type HeatBuckets = { q1: number; q2: number; q3: number } | null

function computeBuckets(values: number[]): HeatBuckets {
  const nonZero = values.filter((v) => v > 0).sort((a, b) => a - b)
  if (nonZero.length < 4) return null
  const at = (p: number) => nonZero[Math.min(nonZero.length - 1, Math.floor(p * (nonZero.length - 1)))]
  return { q1: at(0.25), q2: at(0.5), q3: at(0.75) }
}

function levelForCount(count: number, max: number, buckets: HeatBuckets): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0
  if (buckets) {
    if (count <= buckets.q1) return 1
    if (count <= buckets.q2) return 2
    if (count <= buckets.q3) return 3
    return 4
  }
  if (max <= 0) return 0
  const ratio = count / max
  if (ratio <= 0.25) return 1
  if (ratio <= 0.5) return 2
  if (ratio <= 0.75) return 3
  return 4
}

function heatClass(level: 0 | 1 | 2 | 3 | 4): string {
  switch (level) {
    case 0:
      return 'bg-slate-100 border-slate-200 text-slate-700'
    case 1:
      return 'bg-blue-50 border-blue-100 text-slate-900'
    case 2:
      return 'bg-blue-100 border-blue-200 text-slate-900'
    case 3:
      return 'bg-blue-200 border-blue-300 text-slate-900'
    case 4:
      return 'bg-blue-600 border-blue-700 text-white'
  }
}

export function KeyboardHeatmap({ counts }: { counts: KeyCounts }) {
  const stats = useMemo(() => {
    const values: number[] = []
    for (const row of US_QWERTY_LAYOUT) {
      for (const key of row) {
        values.push(counts[key.code] ?? 0)
      }
    }
    const max = values.reduce((acc, v) => Math.max(acc, v), 0)
    return { max, buckets: computeBuckets(values) }
  }, [counts])

  const total = totalKeyCount(counts)
  const hasAny = total > 0

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-slate-500">击键分布（按键次数）</div>
        <div className="text-xs text-slate-500 tabular-nums">{total.toLocaleString()}</div>
      </div>

      {!hasAny ? (
        <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
          暂无键盘记录
        </div>
      ) : (
        <div className="space-y-1">
          {US_QWERTY_LAYOUT.map((row, rowIdx) => (
            <div key={rowIdx} className="flex gap-1">
              {row.map((key) => {
                const count = counts[key.code] ?? 0
                const level = levelForCount(count, stats.max, stats.buckets)
                return (
                  <div
                    key={key.code}
                    className={cn(
                      'h-10 rounded-lg border px-2 py-1 text-[11px] leading-tight select-none',
                      'flex flex-col justify-between',
                      heatClass(level)
                    )}
                    style={{ flex: key.width ?? 1 }}
                    title={`${key.code}  ${count.toLocaleString()}`}
                    data-no-drag
                  >
                    <div className={cn('font-medium', level === 4 ? 'text-white' : 'text-slate-800')}>{key.label}</div>
                    <div className={cn('tabular-nums', level === 4 ? 'text-white/90' : 'text-slate-500')}>
                      {count > 0 ? count.toLocaleString() : ''}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>少</span>
        <div className="flex items-center gap-1" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((lv) => (
            <span key={lv} className={cn('h-3 w-3 rounded border', heatClass(lv as 0 | 1 | 2 | 3 | 4))} />
          ))}
        </div>
        <span>多</span>
      </div>
    </div>
  )
}

