import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DailyStats } from '@/types/merit'
import { buildDayIndex, keysInWindow } from '@/lib/statisticsInsights'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { sumKeyCounts, totalKeyCount, type KeyCounts } from '@/lib/keyboard'

type RangeMode = 'day' | '7' | '30' | 'all'

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

function fmtPct(p: number): string {
  return `${Math.round(clamp01(p) * 100)}%`
}

function rangeLabel(
  t: (key: string, options?: Record<string, unknown>) => string,
  mode: RangeMode,
  endKey: string,
) {
  if (mode === 'day') return t('statistics.range.dayWithDate', { date: endKey })
  if (mode === '7') return t('statistics.range.lastDaysWithEnd', { days: 7, date: endKey })
  if (mode === '30') return t('statistics.range.lastDaysWithEnd', { days: 30, date: endKey })
  return t('customStatistics.mode.cumulative')
}

function modeToDays(mode: RangeMode): number | null {
  if (mode === '7') return 7
  if (mode === '30') return 30
  if (mode === 'day') return 1
  return null
}

function sumMaps(list: Array<KeyCounts | undefined | null>): KeyCounts {
  return sumKeyCounts(list)
}

type DayPoint = {
  key: string
  shifted: number
  unshifted: number
  hasSplit: boolean
}

function formatShortDate(dateKey: string): string {
  const parts = dateKey.split('-')
  if (parts.length !== 3) return dateKey
  return `${Number(parts[1])}/${Number(parts[2])}`
}

export function ShiftUsage({
  days,
  endKey,
  defaultRange = '30',
}: {
  days: DailyStats[]
  endKey: string
  defaultRange?: RangeMode
}) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<RangeMode>(defaultRange)
  const index = useMemo(() => buildDayIndex(days), [days])

  const windowDays = modeToDays(mode)

  const points = useMemo((): DayPoint[] => {
    const daysForTrend = mode === '7' ? 7 : 30
    const keys = keysInWindow(endKey, daysForTrend).reverse()
    return keys.map((key) => {
      const day = index.get(key) ?? null
      const hasSplit = day?.key_counts_unshifted != null || day?.key_counts_shifted != null
      const shifted = totalKeyCount(day?.key_counts_shifted ?? null)
      const unshifted = totalKeyCount(day?.key_counts_unshifted ?? null)
      return { key, shifted, unshifted, hasSplit }
    })
  }, [endKey, index, mode])

  const summary = useMemo(() => {
    if (windowDays === 1) {
      const day = index.get(endKey) ?? null
      const hasSplit = day?.key_counts_unshifted != null || day?.key_counts_shifted != null
      const shifted = totalKeyCount(day?.key_counts_shifted ?? null)
      const unshifted = totalKeyCount(day?.key_counts_unshifted ?? null)
      const total = shifted + unshifted
      return { shifted, unshifted, total, hasSplit, coveredDays: hasSplit ? 1 : 0, windowDays: 1 }
    }

    const keys = windowDays != null ? keysInWindow(endKey, windowDays) : [...index.keys()]
    const list = keys.map((k) => index.get(k) ?? null).filter(Boolean) as DailyStats[]
    const splitDays = list.filter((d) => d.key_counts_unshifted != null || d.key_counts_shifted != null)
    const shiftedCounts = sumMaps(splitDays.map((d) => d.key_counts_shifted ?? null))
    const unshiftedCounts = sumMaps(splitDays.map((d) => d.key_counts_unshifted ?? null))
    const shifted = totalKeyCount(shiftedCounts)
    const unshifted = totalKeyCount(unshiftedCounts)
    const total = shifted + unshifted
    return { shifted, unshifted, total, hasSplit: splitDays.length > 0, coveredDays: splitDays.length, windowDays: keys.length }
  }, [endKey, index, windowDays])

  const total = Math.max(0, summary.total)
  const shifted = Math.max(0, summary.shifted)
  const unshifted = Math.max(0, summary.unshifted)
  const denom = total > 0 ? total : 1
  const shiftedShare = clamp01(shifted / denom)
  const hasAny = total > 0

  const donut = useMemo(() => {
    const size = 120
    const strokeWidth = 14
    const r = (size - strokeWidth) / 2
    const cx = size / 2
    const cy = size / 2
    const circ = 2 * Math.PI * r
    const shiftedLen = circ * shiftedShare
    const unshiftedLen = circ * (1 - shiftedShare)
    return { size, strokeWidth, r, cx, cy, circ, shiftedLen, unshiftedLen }
  }, [shiftedShare])

  const maxDayTotal = useMemo(() => {
    return points.reduce((acc, p) => (p.hasSplit ? Math.max(acc, p.shifted + p.unshifted) : acc), 0)
  }, [points])

  const labelEvery = mode === '7' ? 1 : 5

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 tracking-wide">{t('customStatistics.widgets.shift_usage.title')}</div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">{rangeLabel(t, mode, endKey)}</div>
        </div>
        <div className="flex items-center gap-2" data-no-drag>
          <Button type="button" size="sm" variant={mode === 'day' ? 'secondary' : 'outline'} onClick={() => setMode('day')} data-no-drag>
            {t('statistics.range.day')}
          </Button>
          <Button type="button" size="sm" variant={mode === '7' ? 'secondary' : 'outline'} onClick={() => setMode('7')} data-no-drag>
            {t('statistics.range.days', { days: 7 })}
          </Button>
          <Button type="button" size="sm" variant={mode === '30' ? 'secondary' : 'outline'} onClick={() => setMode('30')} data-no-drag>
            {t('statistics.range.days', { days: 30 })}
          </Button>
          <Button type="button" size="sm" variant={mode === 'all' ? 'secondary' : 'outline'} onClick={() => setMode('all')} data-no-drag>
            {t('customStatistics.mode.cumulative')}
          </Button>
        </div>
      </div>

      {!summary.hasSplit ? (
        <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-3 py-5 text-center text-sm text-slate-500">
          {t('statistics.shiftUsage.noSplitData')}
        </div>
      ) : !hasAny ? (
        <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-3 py-5 text-center text-sm text-slate-500">
          {t('statistics.shiftUsage.noKeyData')}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[140px_minmax(0,1fr)] gap-4 items-center">
            <div className="flex items-center justify-center">
              <svg viewBox={`0 0 ${donut.size} ${donut.size}`} className="h-[120px] w-[120px]" role="img" aria-label={t('statistics.shiftUsage.ariaLabel')}>
                <g transform={`rotate(-90 ${donut.cx} ${donut.cy})`}>
                  <circle cx={donut.cx} cy={donut.cy} r={donut.r} fill="none" stroke="#e2e8f0" strokeWidth={donut.strokeWidth} />
                  <circle
                    cx={donut.cx}
                    cy={donut.cy}
                    r={donut.r}
                    fill="none"
                    stroke="#8b5cf6"
                    strokeWidth={donut.strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={`${donut.shiftedLen} ${donut.circ}`}
                    strokeDashoffset={0}
                  />
                  <circle
                    cx={donut.cx}
                    cy={donut.cy}
                    r={donut.r}
                    fill="none"
                    stroke="#0ea5e9"
                    strokeWidth={donut.strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={`${donut.unshiftedLen} ${donut.circ}`}
                    strokeDashoffset={-donut.shiftedLen}
                  />
                </g>
                <text x={donut.cx} y={donut.cy - 2} textAnchor="middle" fontSize="16" fontWeight="700" fill="#0f172a">
                  {fmtPct(shiftedShare)}
                </text>
                <text x={donut.cx} y={donut.cy + 18} textAnchor="middle" fontSize="10" fill="#64748b">
                  {t('statistics.shiftUsage.shiftKey')}
                </text>
              </svg>
            </div>

            <div className="space-y-2">
              <div className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(160px,1fr))]">
                <div className="rounded-lg border border-slate-200/60 bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-2 text-[11px] text-slate-500">
                      <span className="h-2.5 w-2.5 rounded-sm bg-violet-500" aria-hidden="true" />
                      {t('statistics.shiftUsage.shifted')}
                    </div>
                    <div className="text-[11px] text-slate-500 tabular-nums">{fmtPct(shiftedShare)}</div>
                  </div>
                  <div className="mt-1 text-lg font-bold text-slate-900 tabular-nums">{shifted.toLocaleString()}</div>
                  <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-violet-500" style={{ width: `${shiftedShare * 100}%` }} aria-hidden="true" />
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200/60 bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-2 text-[11px] text-slate-500">
                      <span className="h-2.5 w-2.5 rounded-sm bg-sky-500" aria-hidden="true" />
                      {t('statistics.shiftUsage.unshifted')}
                    </div>
                    <div className="text-[11px] text-slate-500 tabular-nums">{fmtPct(1 - shiftedShare)}</div>
                  </div>
                  <div className="mt-1 text-lg font-bold text-slate-900 tabular-nums">{unshifted.toLocaleString()}</div>
                  <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-sky-500" style={{ width: `${(1 - shiftedShare) * 100}%` }} aria-hidden="true" />
                  </div>
                </div>
              </div>

              <div className="text-xs text-slate-500 tabular-nums">
                {t('statistics.shiftUsage.coverage', {
                  covered: summary.coveredDays.toLocaleString(),
                  total: summary.windowDays.toLocaleString(),
                })}
              </div>
            </div>
          </div>

          {mode === 'all' ? (
            <div className="text-xs text-slate-500">{t('statistics.shiftUsage.allHint')}</div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <div className="min-w-0 truncate">{t('statistics.shiftUsage.trendHint')}</div>
                <div className="tabular-nums">{t('statistics.peakPerDay', { value: maxDayTotal.toLocaleString() })}</div>
              </div>
              <div className="h-36">
                <div className="flex h-full items-end gap-1">
                  {points.map((p, idx) => {
                    if (!p.hasSplit) {
                      return (
                        <div key={p.key} className="flex-1 min-w-0" title={t('statistics.shiftUsage.noSplitDay', { date: p.key })} data-no-drag>
                          <div className="relative h-28 w-full overflow-hidden rounded-md border border-slate-200/60 bg-slate-50" />
                          <div className={cn('mt-1 text-[10px] text-slate-400 tabular-nums text-center', idx % labelEvery === 0 || idx === points.length - 1 ? '' : 'opacity-0')}>
                            {formatShortDate(p.key)}
                          </div>
                        </div>
                      )
                    }
                    const dayTotal = p.shifted + p.unshifted
                    const totalPct = maxDayTotal > 0 ? (dayTotal / maxDayTotal) * 100 : 0
                    const shiftedPct = maxDayTotal > 0 ? (p.shifted / maxDayTotal) * 100 : 0
                    const unshiftedPct = maxDayTotal > 0 ? (p.unshifted / maxDayTotal) * 100 : 0
                    return (
                      <div
                        key={p.key}
                        className="flex-1 min-w-0"
                        title={t('statistics.tooltips.shiftBreakdown', {
                          date: p.key,
                          shifted: p.shifted.toLocaleString(),
                          unshifted: p.unshifted.toLocaleString(),
                        })}
                        data-no-drag
                      >
                        <div className="relative h-28 w-full overflow-hidden rounded-md border border-slate-200/60 bg-white">
                          <div className="absolute bottom-0 left-0 right-0 bg-slate-100" style={{ height: `${totalPct}%` }} aria-hidden="true" />
                          <div className="absolute bottom-0 left-0 right-0 bg-sky-500/80" style={{ height: `${unshiftedPct}%` }} aria-hidden="true" />
                          <div className="absolute bottom-0 left-0 right-0 bg-violet-500/85" style={{ height: `${shiftedPct}%` }} aria-hidden="true" />
                        </div>
                        <div className={cn('mt-1 text-[10px] text-slate-500 tabular-nums text-center', idx % labelEvery === 0 || idx === points.length - 1 ? '' : 'opacity-0')}>
                          {formatShortDate(p.key)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm bg-violet-500" aria-hidden="true" />
                    {t('statistics.shiftUsage.shifted')}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm bg-sky-500" aria-hidden="true" />
                    {t('statistics.shiftUsage.unshifted')}
                  </span>
                </div>
                <div className="tabular-nums">{t('statistics.totalWithValue', { value: total.toLocaleString() })}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
