import { useMemo, useState } from 'react'
import type { DailyStats } from '@/types/merit'
import { buildDayIndex, keysInWindow } from '@/lib/statisticsInsights'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type RangeDays = 7 | 30

function formatShortDate(dateKey: string): string {
  const parts = dateKey.split('-')
  if (parts.length !== 3) return dateKey
  return `${Number(parts[1])}/${Number(parts[2])}`
}

function distinctKeys(day: DailyStats | undefined | null): number {
  const counts = day?.key_counts ?? {}
  let n = 0
  for (const v of Object.values(counts)) {
    if ((v ?? 0) > 0) n += 1
  }
  return n
}

export function KeyDiversityBars({
  days,
  endKey,
  defaultRangeDays = 30,
}: {
  days: DailyStats[]
  endKey: string
  defaultRangeDays?: RangeDays
}) {
  const [rangeDays, setRangeDays] = useState<RangeDays>(defaultRangeDays)
  const index = useMemo(() => buildDayIndex(days), [days])

  const series = useMemo(() => {
    const keys = keysInWindow(endKey, rangeDays).reverse()
    const points = keys.map((key) => {
      const day = index.get(key) ?? null
      const total = day?.total ?? 0
      const distinct = distinctKeys(day)
      return { key, distinct, total }
    })
    const maxDistinct = points.reduce((acc, p) => Math.max(acc, p.distinct), 0)
    const sum = points.reduce((acc, p) => acc + p.distinct, 0)
    const avg = points.length ? sum / points.length : 0
    return { points, maxDistinct, avg }
  }, [endKey, index, rangeDays])

  const hasAny = series.maxDistinct > 0
  const labelEvery = rangeDays === 7 ? 1 : 5

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 tracking-wide">按键多样性</div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">每天使用到的不同按键数量（&gt;0）· 截止 {endKey}</div>
        </div>
        <div className="flex items-center gap-2" data-no-drag>
          <Button type="button" size="sm" variant={rangeDays === 7 ? 'secondary' : 'outline'} onClick={() => setRangeDays(7)} data-no-drag>
            7 天
          </Button>
          <Button type="button" size="sm" variant={rangeDays === 30 ? 'secondary' : 'outline'} onClick={() => setRangeDays(30)} data-no-drag>
            30 天
          </Button>
        </div>
      </div>

      {!hasAny ? (
        <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-3 py-5 text-center text-sm text-slate-500">
          暂无按键统计
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <div className="min-w-0 truncate">柱高：不同按键数（与总次数无关）</div>
            <div className="tabular-nums">日均 {Math.round(series.avg).toLocaleString()} · 峰值 {series.maxDistinct.toLocaleString()}</div>
          </div>

          <div className="h-36">
            <div className="flex h-full items-end gap-1">
              {series.points.map((p, idx) => {
                const pct = series.maxDistinct > 0 ? (p.distinct / series.maxDistinct) * 100 : 0
                const tone = (p.total ?? 0) > 0 ? 'bg-indigo-500/80' : 'bg-slate-300'
                return (
                  <div
                    key={p.key}
                    className="flex-1 min-w-0"
                    title={`${p.key}  不同按键 ${p.distinct.toLocaleString()}（总计 ${p.total.toLocaleString()}）`}
                    data-no-drag
                  >
                    <div className="relative h-28 w-full overflow-hidden rounded-md border border-slate-200/60 bg-white">
                      <div className="absolute bottom-0 left-0 right-0 bg-slate-100" style={{ height: `${pct}%` }} aria-hidden="true" />
                      <div className={cn('absolute bottom-0 left-0 right-0', tone)} style={{ height: `${pct}%` }} aria-hidden="true" />
                    </div>
                    <div
                      className={cn(
                        'mt-1 text-[10px] text-slate-500 tabular-nums text-center',
                        idx % labelEvery === 0 || idx === series.points.length - 1 ? '' : 'opacity-0'
                      )}
                    >
                      {formatShortDate(p.key)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="text-xs text-slate-500">
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm bg-indigo-500/80" aria-hidden="true" />
              有输入
            </span>
            <span className="ml-4 inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm bg-slate-300" aria-hidden="true" />
              总计为 0
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
