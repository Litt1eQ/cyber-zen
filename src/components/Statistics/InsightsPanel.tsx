import { useMemo } from 'react'
import type { DailyStats } from '@/types/merit'
import { cn } from '@/lib/utils'
import {
  bestDay,
  buildDayIndex,
  comparePeriods,
  computeStreaks,
  monthToDate,
  peakHour,
  weekToDate,
  type PeriodComparison,
  type PeriodCounters,
} from '@/lib/statisticsInsights'
import { Flame, CalendarDays, TrendingUp, Clock } from 'lucide-react'

function fmtHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`
}

function fmtPct(value: number | null): string {
  if (value == null) return '—'
  const pct = value * 100
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

function fmtDelta(value: number): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toLocaleString()}`
}

function deltaTone(value: number): 'up' | 'down' | 'flat' {
  if (value > 0) return 'up'
  if (value < 0) return 'down'
  return 'flat'
}

function TonePill({ value }: { value: number }) {
  const tone = deltaTone(value)
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
        'max-w-full overflow-hidden text-ellipsis whitespace-nowrap',
        tone === 'up' && 'bg-emerald-100 text-emerald-700',
        tone === 'down' && 'bg-rose-100 text-rose-700',
        tone === 'flat' && 'bg-slate-100 text-slate-600'
      )}
    >
      {fmtDelta(value)}
    </div>
  )
}

function CompactCounters({ title, counters }: { title: string; counters: PeriodCounters }) {
  return (
    <div className="rounded-lg border border-slate-200/60 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] text-slate-500">{title}</div>
          <div className="mt-1 text-xl font-bold text-slate-900 tabular-nums">{counters.total.toLocaleString()}</div>
        </div>
        <div className="shrink-0 text-right text-[11px] text-slate-500 tabular-nums">
          <div>键盘 {counters.keyboard.toLocaleString()}</div>
          <div>单击 {counters.mouse_single.toLocaleString()}</div>
        </div>
      </div>
    </div>
  )
}

function ComparisonBlock({ comp }: { comp: PeriodComparison }) {
  return (
    <div className="space-y-2">
      <div className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(140px,1fr))]">
        <div className="rounded-md border border-slate-200/60 bg-white px-3 py-2">
          <div className="text-[11px] text-slate-500">总计</div>
          <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <div className="min-w-0">
              <TonePill value={comp.delta.total} />
            </div>
            <div className="text-[10px] text-slate-500 tabular-nums">{fmtPct(comp.pct.total)}</div>
          </div>
        </div>
        <div className="rounded-md border border-slate-200/60 bg-white px-3 py-2">
          <div className="text-[11px] text-slate-500">键盘</div>
          <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <div className="min-w-0">
              <TonePill value={comp.delta.keyboard} />
            </div>
            <div className="text-[10px] text-slate-500 tabular-nums">{fmtPct(comp.pct.keyboard)}</div>
          </div>
        </div>
        <div className="rounded-md border border-slate-200/60 bg-white px-3 py-2">
          <div className="text-[11px] text-slate-500">单击</div>
          <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <div className="min-w-0">
              <TonePill value={comp.delta.mouse_single} />
            </div>
            <div className="text-[10px] text-slate-500 tabular-nums">{fmtPct(comp.pct.mouse_single)}</div>
          </div>
        </div>
      </div>
      <div className="text-[11px] text-slate-500">
        当前 {comp.current.total.toLocaleString()} · 上一段 {comp.previous.total.toLocaleString()}
      </div>
    </div>
  )
}

function Tile({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-slate-200/60 bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-900 tracking-wide">{title}</div>
        </div>
        <div className="h-8 w-8 rounded-lg border border-slate-200/60 bg-white flex items-center justify-center text-slate-700">
          {icon}
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  )
}

export function InsightsPanel({ days, endKey }: { days: DailyStats[]; endKey: string }) {
  const index = useMemo(() => buildDayIndex(days), [days])

  const streaks = useMemo(() => computeStreaks(index, endKey), [endKey, index])
  const week = useMemo(() => weekToDate(index, endKey), [endKey, index])
  const month = useMemo(() => monthToDate(index, endKey), [endKey, index])
  const comp7 = useMemo(() => comparePeriods(index, endKey, 7), [endKey, index])
  const comp30 = useMemo(() => comparePeriods(index, endKey, 30), [endKey, index])
  const peak30 = useMemo(() => peakHour(index, endKey, 30), [endKey, index])
  const best30 = useMemo(() => bestDay(index, endKey, 30), [endKey, index])
  const bestAll = useMemo(() => bestDay(index, endKey, 'all'), [endKey, index])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 tracking-wide">统计摘要</div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">截止 {endKey}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile title="连续功德" icon={<Flame className="h-4 w-4" aria-hidden="true" />}>
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-[11px] text-slate-500">当前连续</div>
              <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{streaks.current}</div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-slate-500">历史最长</div>
              <div className="mt-1 text-lg font-bold text-slate-900 tabular-nums">{streaks.longest}</div>
            </div>
          </div>
          {streaks.longestRange ? (
            <div className="mt-2 text-[11px] text-slate-500 tabular-nums">
              {streaks.longestRange.startKey} → {streaks.longestRange.endKey}
            </div>
          ) : (
            <div className="mt-2 text-[11px] text-slate-500">暂无连续记录</div>
          )}
        </Tile>

        <Tile title="本周 / 本月" icon={<CalendarDays className="h-4 w-4" aria-hidden="true" />}>
          <div className="space-y-3">
            <div className="text-[11px] text-slate-500 tabular-nums">周从 {week?.startKey ?? '—'} 起 · 月从 {month?.startKey ?? '—'} 起</div>
            {week ? <CompactCounters title="本周累计" counters={week.sum} /> : <div className="text-sm text-slate-500">暂无本周数据</div>}
            {month ? <CompactCounters title="本月累计" counters={month.sum} /> : <div className="text-sm text-slate-500">暂无本月数据</div>}
          </div>
        </Tile>

        <Tile title="近 7/30 天环比" icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}>
          <div className="space-y-4">
            <div>
              <div className="text-[11px] text-slate-500">近 7 天 vs 前 7 天</div>
              <div className="mt-2">
                <ComparisonBlock comp={comp7} />
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500">近 30 天 vs 前 30 天</div>
              <div className="mt-2">
                <ComparisonBlock comp={comp30} />
              </div>
            </div>
          </div>
        </Tile>

        <Tile title="高峰与最强" icon={<Clock className="h-4 w-4" aria-hidden="true" />}>
          <div className="space-y-3">
            <div className="rounded-md border border-slate-200/60 bg-white px-3 py-2">
              <div className="text-[11px] text-slate-500">近 30 天最活跃小时</div>
              {peak30 ? (
                <div className="mt-1 flex items-end justify-between gap-3">
                  <div className="text-lg font-bold text-slate-900 tabular-nums">{fmtHour(peak30.hour)}</div>
                  <div className="text-[11px] text-slate-500 tabular-nums">{peak30.sum.total.toLocaleString()} 次</div>
                </div>
              ) : (
                <div className="mt-1 text-sm text-slate-500">暂无小时数据</div>
              )}
            </div>

            <div className="rounded-md border border-slate-200/60 bg-white px-3 py-2">
              <div className="text-[11px] text-slate-500">近 30 天最强一天</div>
              {best30 ? (
                <div className="mt-1 flex items-end justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-900 tabular-nums">{best30.dateKey}</div>
                  <div className="text-[11px] text-slate-500 tabular-nums">{best30.total.toLocaleString()}</div>
                </div>
              ) : (
                <div className="mt-1 text-sm text-slate-500">暂无</div>
              )}
            </div>

            <div className="rounded-md border border-slate-200/60 bg-white px-3 py-2">
              <div className="text-[11px] text-slate-500">历史最强一天</div>
              {bestAll ? (
                <div className="mt-1 flex items-end justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-900 tabular-nums">{bestAll.dateKey}</div>
                  <div className="text-[11px] text-slate-500 tabular-nums">{bestAll.total.toLocaleString()}</div>
                </div>
              ) : (
                <div className="mt-1 text-sm text-slate-500">暂无</div>
              )}
            </div>
          </div>
        </Tile>
      </div>
    </div>
  )
}
