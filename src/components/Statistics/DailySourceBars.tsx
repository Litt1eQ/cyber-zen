import { useMemo, useState } from 'react'
import type { DailyStats } from '@/types/merit'
import { buildDayIndex, keysInWindow } from '@/lib/statisticsInsights'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

function formatShortDate(dateKey: string): string {
  const parts = dateKey.split('-')
  if (parts.length !== 3) return dateKey
  return `${Number(parts[1])}/${Number(parts[2])}`
}

type RangeDays = 7 | 30

export function DailySourceBars({
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
      const keyboard = day?.keyboard ?? 0
      const mouse_single = day?.mouse_single ?? 0
      return { key, total, keyboard, mouse_single }
    })
    const maxTotal = points.reduce((acc, p) => Math.max(acc, p.total), 0)
    const sumTotal = points.reduce((acc, p) => acc + p.total, 0)
    const avg = points.length ? sumTotal / points.length : 0
    return { points, maxTotal, sumTotal, avg }
  }, [endKey, index, rangeDays])

  const hasAny = series.maxTotal > 0
  const labelEvery = rangeDays === 7 ? 1 : 5

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 tracking-wide">按天堆叠（键盘/单击）</div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">截止 {endKey}</div>
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
          暂无数据
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm bg-teal-500" aria-hidden="true" />
                键盘
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" aria-hidden="true" />
                单击
              </span>
            </div>
            <div className="tabular-nums">
              合计 {series.sumTotal.toLocaleString()} · 日均 {Math.round(series.avg).toLocaleString()} · 峰值 {series.maxTotal.toLocaleString()}
            </div>
          </div>

          <div className="h-36">
            <div className="flex h-full items-end gap-1">
              {series.points.map((p, idx) => {
                const total = p.total
                const k = Math.min(p.keyboard, total)
                const m = Math.min(p.mouse_single, Math.max(0, total - k))
                const totalPct = series.maxTotal > 0 ? (total / series.maxTotal) * 100 : 0
                const kPct = series.maxTotal > 0 ? (k / series.maxTotal) * 100 : 0
                const mPct = series.maxTotal > 0 ? (m / series.maxTotal) * 100 : 0
                return (
                  <div
                    key={p.key}
                    className="flex-1 min-w-0"
                    title={`${p.key}  总计 ${total.toLocaleString()}（键盘 ${k.toLocaleString()} / 单击 ${m.toLocaleString()}）`}
                    data-no-drag
                  >
                    <div className="relative h-28 w-full overflow-hidden rounded-md border border-slate-200/60 bg-white">
                      <div className="absolute bottom-0 left-0 right-0 bg-slate-100" style={{ height: `${totalPct}%` }} aria-hidden="true" />
                      <div className="absolute bottom-0 left-0 right-0 bg-amber-500/80" style={{ height: `${mPct}%` }} aria-hidden="true" />
                      <div className="absolute bottom-0 left-0 right-0 bg-teal-500/85" style={{ height: `${kPct}%` }} aria-hidden="true" />
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
        </div>
      )}
    </div>
  )
}

