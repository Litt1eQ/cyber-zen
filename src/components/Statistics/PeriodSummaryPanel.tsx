import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock } from 'lucide-react'
import type { DailyStats } from '@/types/merit'
import { computePeriodSummary, type PeriodSummaryRange } from '@/lib/periodSummary'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { KeyboardHeatmap } from '@/components/Statistics/KeyboardHeatmap'
import { PeriodSummaryShareDialog } from '@/components/Statistics/PeriodSummaryShareDialog'

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

function fmtPct(p: number): string {
  return `${Math.round(clamp01(p) * 100)}%`
}

export function PeriodSummaryPanel({
  allDays,
  todayKey,
  heatLevelCount,
  layoutId,
  platform,
}: {
  allDays: DailyStats[]
  todayKey: string
  heatLevelCount?: number | null
  layoutId?: string | null
  platform: 'mac' | 'windows' | 'linux'
}) {
  const { t, i18n } = useTranslation()
  const [range, setRange] = useState<PeriodSummaryRange>('today')

  const summary = useMemo(() => computePeriodSummary(allDays, todayKey, range), [allDays, range, todayKey])

  const timeFmt = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(i18n.resolvedLanguage ?? undefined, { dateStyle: 'short', timeStyle: 'short' })
    } catch {
      return null
    }
  }, [i18n.resolvedLanguage])

  const firstEventText = useMemo(() => {
    const ms = summary?.firstEventAtMs ?? null
    if (!ms || ms <= 0) return '—'
    if (!timeFmt) return '—'
    return timeFmt.format(new Date(ms))
  }, [summary?.firstEventAtMs, timeFmt])

  const lastEventText = useMemo(() => {
    const ms = summary?.lastEventAtMs ?? null
    if (!ms || ms <= 0) return '—'
    if (!timeFmt) return '—'
    return timeFmt.format(new Date(ms))
  }, [summary?.lastEventAtMs, timeFmt])

  const total = summary?.totals.total ?? 0
  const keyboard = summary?.totals.keyboard ?? 0
  const mouse = summary?.totals.mouse_single ?? 0
  const denom = total > 0 ? total : 1
  const keyboardShare = clamp01(keyboard / denom)
  const mouseShare = clamp01(mouse / denom)

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 tracking-wide">{t('statistics.periodSummary.title')}</div>
          <div className="text-xs text-slate-500 mt-1">{t('statistics.periodSummary.description')}</div>
        </div>

        <PeriodSummaryShareDialog
          allDays={allDays}
          todayKey={todayKey}
          heatLevelCount={heatLevelCount}
          layoutId={layoutId}
          platform={platform}
          range={range}
          onRangeChange={setRange}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2" data-no-drag>
        <Button type="button" size="sm" variant={range === 'today' ? 'secondary' : 'outline'} onClick={() => setRange('today')} data-no-drag>
          {t('statistics.periodSummaryShare.ranges.today')}
        </Button>
        <Button type="button" size="sm" variant={range === 'yesterday' ? 'secondary' : 'outline'} onClick={() => setRange('yesterday')} data-no-drag>
          {t('statistics.periodSummaryShare.ranges.yesterday')}
        </Button>
        <Button type="button" size="sm" variant={range === 'last7' ? 'secondary' : 'outline'} onClick={() => setRange('last7')} data-no-drag>
          {t('statistics.periodSummaryShare.ranges.lastWeek')}
        </Button>
        <Button type="button" size="sm" variant={range === 'last30' ? 'secondary' : 'outline'} onClick={() => setRange('last30')} data-no-drag>
          {t('statistics.periodSummaryShare.ranges.lastMonth')}
        </Button>
        {summary ? (
          <div className="text-[11px] text-slate-500 tabular-nums ml-1">
            {summary.startKey === summary.endKey ? summary.endKey : `${summary.startKey} ~ ${summary.endKey}`}
          </div>
        ) : null}
      </div>

      {!summary || total <= 0 ? (
        <div className="mt-4 rounded-lg border border-slate-200/60 bg-slate-50 px-3 py-5 text-center text-sm text-slate-500">
          {t('statistics.periodSummaryShare.noData')}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div
              className={cn(
                'md:col-span-8 rounded-2xl border border-amber-200/40',
                'bg-gradient-to-br from-white via-amber-50/70 to-amber-100/40 p-5',
              )}
            >
              <div className="flex items-start justify-between gap-6">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-700">{t('statistics.periodSummaryShare.totalMeritTitle')}</div>
                  <div className="mt-1 text-xs text-slate-500 tabular-nums">
                    {summary.startKey === summary.endKey ? summary.endKey : `${summary.startKey} ~ ${summary.endKey}`}
                  </div>
                  <div className="mt-3 text-xs text-slate-500 tabular-nums">
                    {t('statistics.periodSummary.coverage', { covered: summary.days.length, expected: summary.expectedDays })}
                  </div>
                </div>
                <div className="text-5xl font-semibold leading-none tabular-nums bg-gradient-to-r from-amber-700 to-amber-500 bg-clip-text text-transparent">
                  {total.toLocaleString()}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-amber-200/50 bg-white/70 px-3 py-2 shadow-sm">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-amber-200/50 bg-white/90 text-slate-700">
                      <Clock className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] text-slate-500">{t('statistics.periodSummaryShare.labels.firstEvent')}</div>
                      <div className="mt-0.5 text-sm font-semibold text-slate-900 tabular-nums">{firstEventText}</div>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-amber-200/50 bg-white/70 px-3 py-2 shadow-sm">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-amber-200/50 bg-white/90 text-slate-700">
                      <Clock className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] text-slate-500">{t('statistics.periodSummaryShare.labels.lastEvent')}</div>
                      <div className="mt-0.5 text-sm font-semibold text-slate-900 tabular-nums">{lastEventText}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 text-sm text-slate-600">{t('statistics.todayOverview.sourceDistribution')}</div>
              <div className="mt-3 grid gap-3 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
                <div className="rounded-xl border border-amber-200/50 bg-white/70 p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
	                    <div className="inline-flex items-center gap-2 text-[11px] text-slate-500">
	                      <span className="h-2.5 w-2.5 rounded-sm bg-teal-500" aria-hidden="true" />
	                      {t('statistics.periodSummaryShare.labels.keyboard')}
	                    </div>
                    <div className="text-[11px] text-slate-500 tabular-nums">{fmtPct(keyboardShare)}</div>
                  </div>
                  <div className="mt-1 text-lg font-bold text-slate-900 tabular-nums">{keyboard.toLocaleString()}</div>
                  <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-teal-500" style={{ width: `${keyboardShare * 100}%` }} aria-hidden="true" />
                  </div>
                </div>

                <div className="rounded-xl border border-amber-200/50 bg-white/70 p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
	                    <div className="inline-flex items-center gap-2 text-[11px] text-slate-500">
	                      <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" aria-hidden="true" />
	                      {t('statistics.periodSummaryShare.labels.mouse')}
	                    </div>
                    <div className="text-[11px] text-slate-500 tabular-nums">{fmtPct(mouseShare)}</div>
                  </div>
                  <div className="mt-1 text-lg font-bold text-slate-900 tabular-nums">{mouse.toLocaleString()}</div>
                  <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-amber-500" style={{ width: `${mouseShare * 100}%` }} aria-hidden="true" />
                  </div>
                </div>
              </div>
            </div>

            <div className="md:col-span-4 rounded-2xl border border-amber-200/40 bg-white p-5">
              <div className="text-sm font-medium text-slate-700">{t('statistics.periodSummaryShare.subtitle')}</div>
              <div className="mt-1 text-xs text-slate-500 tabular-nums">{t('statistics.periodSummary.coverage', { covered: summary.days.length, expected: summary.expectedDays })}</div>

              <div className="mt-4 grid gap-3">
                <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                  <div className="text-[11px] text-slate-500">{t('customStatistics.total')}</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">{total.toLocaleString()}</div>
                </div>
                <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                  <div className="text-[11px] text-slate-500">{t('customStatistics.mode.daily')}</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">
                    {(summary.days.length ? Math.round(total / summary.days.length) : 0).toLocaleString()}
                  </div>
                </div>
              </div>

              <div className={cn('mt-3 text-xs text-slate-500 tabular-nums', total !== keyboard + mouse && 'text-slate-400')}>
                {total !== keyboard + mouse
                  ? t('statistics.notes.totalMismatch', { total: total.toLocaleString(), sum: (keyboard + mouse).toLocaleString() })
                  : ' '}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/70 bg-white p-4">
            <div className="text-sm font-semibold text-slate-900">{t('statistics.periodSummaryShare.heatmapTitle')}</div>
            <div className="mt-1 text-xs text-slate-500">{t('statistics.keyboardHeatmap.title')}</div>
            <div className="mt-4 overflow-x-auto">
              <KeyboardHeatmap
                unshiftedCounts={summary.aggregates.keyCountsUnshifted}
                shiftedCounts={summary.aggregates.keyCountsShifted}
                heatLevelCount={heatLevelCount ?? undefined}
                layoutId={layoutId}
              />
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
