import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  return (
    <div className="rounded-lg border border-slate-200/60 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] text-slate-500">{title}</div>
          <div className="mt-1 text-xl font-bold text-slate-900 tabular-nums">{counters.total.toLocaleString()}</div>
        </div>
        <div className="shrink-0 text-right text-[11px] text-slate-500 tabular-nums">
          <div>{t('statistics.breakdown.keyboard', { value: counters.keyboard.toLocaleString() })}</div>
          <div>{t('statistics.breakdown.click', { value: counters.mouse_single.toLocaleString() })}</div>
        </div>
      </div>
    </div>
  )
}

function ComparisonBlock({ comp }: { comp: PeriodComparison }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-2">
      <div className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(140px,1fr))]">
        <div className="rounded-md border border-slate-200/60 bg-white px-3 py-2">
          <div className="text-[11px] text-slate-500">{t('customStatistics.total')}</div>
          <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <div className="min-w-0">
              <TonePill value={comp.delta.total} />
            </div>
            <div className="text-[10px] text-slate-500 tabular-nums">{fmtPct(comp.pct.total)}</div>
          </div>
        </div>
        <div className="rounded-md border border-slate-200/60 bg-white px-3 py-2">
          <div className="text-[11px] text-slate-500">{t('customStatistics.keyboard')}</div>
          <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <div className="min-w-0">
              <TonePill value={comp.delta.keyboard} />
            </div>
            <div className="text-[10px] text-slate-500 tabular-nums">{fmtPct(comp.pct.keyboard)}</div>
          </div>
        </div>
        <div className="rounded-md border border-slate-200/60 bg-white px-3 py-2">
          <div className="text-[11px] text-slate-500">{t('customStatistics.click')}</div>
          <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <div className="min-w-0">
              <TonePill value={comp.delta.mouse_single} />
            </div>
            <div className="text-[10px] text-slate-500 tabular-nums">{fmtPct(comp.pct.mouse_single)}</div>
          </div>
        </div>
      </div>
      <div className="text-[11px] text-slate-500">
        {t('statistics.insights.comparison.currentVsPrevious', {
          current: comp.current.total.toLocaleString(),
          previous: comp.previous.total.toLocaleString(),
        })}
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
  const { t } = useTranslation()
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
          <div className="text-sm font-semibold text-slate-900 tracking-wide">{t('customStatistics.widgets.insights.title')}</div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">{t('statistics.untilDate', { date: endKey })}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile title={t('statistics.insights.streak.title')} icon={<Flame className="h-4 w-4" aria-hidden="true" />}>
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-[11px] text-slate-500">{t('statistics.insights.streak.current')}</div>
              <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{streaks.current}</div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-slate-500">{t('statistics.insights.streak.longest')}</div>
              <div className="mt-1 text-lg font-bold text-slate-900 tabular-nums">{streaks.longest}</div>
            </div>
          </div>
          {streaks.longestRange ? (
            <div className="mt-2 text-[11px] text-slate-500 tabular-nums">
              {streaks.longestRange.startKey} → {streaks.longestRange.endKey}
            </div>
          ) : (
            <div className="mt-2 text-[11px] text-slate-500">{t('statistics.insights.streak.none')}</div>
          )}
        </Tile>

        <Tile title={t('statistics.insights.weekMonth.title')} icon={<CalendarDays className="h-4 w-4" aria-hidden="true" />}>
          <div className="space-y-3">
            <div className="text-[11px] text-slate-500 tabular-nums">
              {t('statistics.insights.weekMonth.starts', { week: week?.startKey ?? '—', month: month?.startKey ?? '—' })}
            </div>
            {week ? <CompactCounters title={t('statistics.insights.weekMonth.weekSum')} counters={week.sum} /> : <div className="text-sm text-slate-500">{t('statistics.insights.weekMonth.noWeek')}</div>}
            {month ? <CompactCounters title={t('statistics.insights.weekMonth.monthSum')} counters={month.sum} /> : <div className="text-sm text-slate-500">{t('statistics.insights.weekMonth.noMonth')}</div>}
          </div>
        </Tile>

        <Tile title={t('statistics.insights.comparison.title')} icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}>
          <div className="space-y-4">
            <div>
              <div className="text-[11px] text-slate-500">{t('statistics.insights.comparison.label', { days: 7 })}</div>
              <div className="mt-2">
                <ComparisonBlock comp={comp7} />
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500">{t('statistics.insights.comparison.label', { days: 30 })}</div>
              <div className="mt-2">
                <ComparisonBlock comp={comp30} />
              </div>
            </div>
          </div>
        </Tile>

        <Tile title={t('statistics.insights.peak.title')} icon={<Clock className="h-4 w-4" aria-hidden="true" />}>
          <div className="space-y-3">
            <div className="rounded-md border border-slate-200/60 bg-white px-3 py-2">
              <div className="text-[11px] text-slate-500">{t('statistics.insights.peak.peakHourTitle', { days: 30 })}</div>
              {peak30 ? (
                <div className="mt-1 flex items-end justify-between gap-3">
                  <div className="text-lg font-bold text-slate-900 tabular-nums">{fmtHour(peak30.hour)}</div>
                  <div className="text-[11px] text-slate-500 tabular-nums">{t('statistics.times', { value: peak30.sum.total.toLocaleString() })}</div>
                </div>
              ) : (
                <div className="mt-1 text-sm text-slate-500">{t('statistics.insights.peak.noHourly')}</div>
              )}
            </div>

            <div className="rounded-md border border-slate-200/60 bg-white px-3 py-2">
              <div className="text-[11px] text-slate-500">{t('statistics.insights.peak.bestDayTitle', { days: 30 })}</div>
              {best30 ? (
                <div className="mt-1 flex items-end justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-900 tabular-nums">{best30.dateKey}</div>
                  <div className="text-[11px] text-slate-500 tabular-nums">{best30.total.toLocaleString()}</div>
                </div>
              ) : (
                <div className="mt-1 text-sm text-slate-500">{t('statistics.noData')}</div>
              )}
            </div>

            <div className="rounded-md border border-slate-200/60 bg-white px-3 py-2">
              <div className="text-[11px] text-slate-500">{t('statistics.insights.peak.bestDayAllTitle')}</div>
              {bestAll ? (
                <div className="mt-1 flex items-end justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-900 tabular-nums">{bestAll.dateKey}</div>
                  <div className="text-[11px] text-slate-500 tabular-nums">{bestAll.total.toLocaleString()}</div>
                </div>
              ) : (
                <div className="mt-1 text-sm text-slate-500">{t('statistics.noData')}</div>
              )}
            </div>
          </div>
        </Tile>
      </div>
    </div>
  )
}
