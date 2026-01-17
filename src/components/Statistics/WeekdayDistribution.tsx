import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DailyStats } from '@/types/merit'
import { cn } from '@/lib/utils'
import { buildDayIndex, weekdayDistribution } from '@/lib/statisticsInsights'
import { Button } from '@/components/ui/button'

function fmt(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return Math.round(value).toLocaleString()
}

function weekdayLabelMon0(weekdayIndexMon0: number, locale: string): string {
  const base = new Date(2024, 0, 1, 12) // 2024-01-01 is Monday
  const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + weekdayIndexMon0, 12)
  try {
    return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date)
  } catch {
    return String(weekdayIndexMon0)
  }
}

export function WeekdayDistribution({
  days,
  endKey,
  defaultRangeDays = 30,
}: {
  days: DailyStats[]
  endKey: string
  defaultRangeDays?: 7 | 30 | 365
}) {
  const { t, i18n } = useTranslation()
  const [rangeDays, setRangeDays] = useState<7 | 30 | 365>(defaultRangeDays)
  const index = useMemo(() => buildDayIndex(days), [days])

  const buckets = useMemo(() => weekdayDistribution(index, endKey, rangeDays), [endKey, index, rangeDays])
  const maxAvgTotal = useMemo(() => buckets.reduce((acc, b) => Math.max(acc, b.avg.total), 0), [buckets])
  const hasAny = maxAvgTotal > 0

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 tracking-wide">{t('customStatistics.widgets.weekday_distribution.title')}</div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">{t('statistics.avgPerDayUntil', { date: endKey })}</div>
        </div>
        <div className="flex items-center gap-2" data-no-drag>
          <Button type="button" size="sm" variant={rangeDays === 7 ? 'secondary' : 'outline'} onClick={() => setRangeDays(7)} data-no-drag>
            {t('statistics.range.days', { days: 7 })}
          </Button>
          <Button type="button" size="sm" variant={rangeDays === 30 ? 'secondary' : 'outline'} onClick={() => setRangeDays(30)} data-no-drag>
            {t('statistics.range.days', { days: 30 })}
          </Button>
          <Button type="button" size="sm" variant={rangeDays === 365 ? 'secondary' : 'outline'} onClick={() => setRangeDays(365)} data-no-drag>
            {t('statistics.range.year')}
          </Button>
        </div>
      </div>

      {!hasAny ? (
        <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-3 py-5 text-center text-sm text-slate-500">
          {t('statistics.noData')}
        </div>
      ) : (
        <div className="h-32">
          <div className="flex h-full items-end gap-1">
            {buckets.map((b) => {
              const total = b.avg.total
              const k = Math.min(b.avg.keyboard, total)
              const m = Math.min(b.avg.mouse_single, Math.max(0, total - k))
              const totalPct = maxAvgTotal > 0 ? (total / maxAvgTotal) * 100 : 0
              const kPct = maxAvgTotal > 0 ? (k / maxAvgTotal) * 100 : 0
              const mPct = maxAvgTotal > 0 ? (m / maxAvgTotal) * 100 : 0
              const label = weekdayLabelMon0(b.weekdayIndexMon0, i18n.language)
              return (
                <div
                  key={b.weekdayIndexMon0}
                  className="flex-1 min-w-0"
                  title={t('statistics.weekdayDistribution.tooltip', {
                    weekday: label,
                    total: fmt(total),
                    keyboard: fmt(k),
                    click: fmt(m),
                    days: b.daysCount,
                  })}
                  data-no-drag
                >
                  <div className="relative h-24 w-full overflow-hidden rounded-md border border-slate-200/60 bg-white">
                    <div className="absolute bottom-0 left-0 right-0 bg-slate-100" style={{ height: `${totalPct}%` }} aria-hidden="true" />
                    <div className="absolute bottom-0 left-0 right-0 bg-amber-500/80" style={{ height: `${mPct}%` }} aria-hidden="true" />
                    <div className="absolute bottom-0 left-0 right-0 bg-teal-500/85" style={{ height: `${kPct}%` }} aria-hidden="true" />
                  </div>
                  <div className={cn('mt-1 text-[11px] text-slate-600 tabular-nums text-center')}>
                    {label}
                  </div>
                  <div className="text-[10px] text-slate-500 tabular-nums text-center">{fmt(total)}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm bg-teal-500" aria-hidden="true" />
            {t('customStatistics.keyboard')}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" aria-hidden="true" />
            {t('customStatistics.click')}
          </span>
        </div>
        <div className="tabular-nums">{t('statistics.peakPerDay', { value: fmt(maxAvgTotal) })}</div>
      </div>
    </div>
  )
}
