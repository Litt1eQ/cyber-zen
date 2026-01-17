import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DailyStats } from '@/types/merit'
import { buildDayIndex, keysInWindow } from '@/lib/statisticsInsights'
import { appInputCountsForDay, mergeAppInputCounts, type AppInputStats } from '@/lib/statisticsAggregates'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type RangeMode = 'day' | '7' | '30' | 'all'

type Entry = { id: string; name?: string | null; total: number }

function pct(n: number, d: number): number {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return 0
  return Math.max(0, Math.min(1, n / d))
}

function rangeLabel(t: (key: string, options?: Record<string, unknown>) => string, mode: RangeMode, endKey: string) {
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

function toEntries(counts: Record<string, AppInputStats>): Entry[] {
  return Object.entries(counts)
    .map(([id, v]) => ({
      id,
      name: v?.name,
      total: v?.total ?? (v?.keyboard ?? 0) + (v?.mouse_single ?? 0),
    }))
    .filter((e) => e.total > 0)
}

const COLORS = ['bg-emerald-600', 'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500', 'bg-sky-500'] as const

export function AppConcentration({
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

  const counts = useMemo(() => {
    const windowDays = modeToDays(mode)
    if (windowDays === 1) return appInputCountsForDay(index.get(endKey))
    if (windowDays != null) {
      const list = keysInWindow(endKey, windowDays).map((k) => index.get(k)).filter(Boolean) as DailyStats[]
      return mergeAppInputCounts(list)
    }

    const all = Array.from(index.values())
    return mergeAppInputCounts(all)
  }, [endKey, index, mode])

  const stats = useMemo(() => {
    const entries = toEntries(counts)
    entries.sort((a, b) => b.total - a.total)
    const total = entries.reduce((acc, e) => acc + e.total, 0)
    const top1 = entries.slice(0, 1).reduce((acc, e) => acc + e.total, 0)
    const top3 = entries.slice(0, 3).reduce((acc, e) => acc + e.total, 0)
    const top5 = entries.slice(0, 5).reduce((acc, e) => acc + e.total, 0)
    const hhi = total > 0 ? entries.reduce((acc, e) => acc + Math.pow(e.total / total, 2), 0) : null
    const effN = hhi && hhi > 0 ? 1 / hhi : null
    const top5Entries = entries.slice(0, 5).map((e, idx) => ({
      ...e,
      share: pct(e.total, total),
      color: COLORS[idx] ?? 'bg-slate-400',
    }))
    const other = Math.max(0, total - top5)
    return { entries, total, top1, top3, top5, top5Entries, other, hhi, effN }
  }, [counts])

  const hasAny = stats.total > 0

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 tracking-wide">{t('customStatistics.widgets.app_concentration.title')}</div>
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

      {!hasAny ? (
        <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-3 py-5 text-center text-sm text-slate-500">
          {t('statistics.appConcentration.noData')}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
            <div className="rounded-lg border border-slate-200/60 bg-white p-3">
              <div className="text-[11px] text-slate-500">{t('statistics.appConcentration.topNShare', { n: 1 })}</div>
              <div className="mt-1 text-xl font-bold text-slate-900 tabular-nums">{Math.round(pct(stats.top1, stats.total) * 100)}%</div>
              <div className="mt-1 text-[11px] text-slate-500 tabular-nums">{stats.top1.toLocaleString()} / {stats.total.toLocaleString()}</div>
            </div>
            <div className="rounded-lg border border-slate-200/60 bg-white p-3">
              <div className="text-[11px] text-slate-500">{t('statistics.appConcentration.topNShare', { n: 3 })}</div>
              <div className="mt-1 text-xl font-bold text-slate-900 tabular-nums">{Math.round(pct(stats.top3, stats.total) * 100)}%</div>
              <div className="mt-1 text-[11px] text-slate-500 tabular-nums">{stats.top3.toLocaleString()} / {stats.total.toLocaleString()}</div>
            </div>
            <div className="rounded-lg border border-slate-200/60 bg-white p-3">
              <div className="text-[11px] text-slate-500">{t('statistics.appConcentration.topNShare', { n: 5 })}</div>
              <div className="mt-1 text-xl font-bold text-slate-900 tabular-nums">{Math.round(pct(stats.top5, stats.total) * 100)}%</div>
              <div className="mt-1 text-[11px] text-slate-500 tabular-nums">{stats.top5.toLocaleString()} / {stats.total.toLocaleString()}</div>
            </div>
            <div className="rounded-lg border border-slate-200/60 bg-white p-3">
              <div className="text-[11px] text-slate-500">{t('statistics.appConcentration.hhiLabel')}</div>
              <div className="mt-1 text-xl font-bold text-slate-900 tabular-nums">{stats.hhi != null ? stats.hhi.toFixed(3) : '—'}</div>
              <div className="mt-1 text-[11px] text-slate-500 tabular-nums">
                {t('statistics.appConcentration.effectiveApps', { value: stats.effN != null ? stats.effN.toFixed(1) : '—' })}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200/60 bg-white p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold text-slate-900">{t('statistics.appConcentration.topAppsTitle')}</div>
              <div className="text-xs text-slate-500 tabular-nums">{t('statistics.totalWithValue', { value: stats.total.toLocaleString() })}</div>
            </div>

            <div className="flex h-2 rounded-full bg-slate-100 overflow-hidden">
              {stats.top5Entries.map((e) => (
                <div
                  key={e.id}
                  className={cn('h-full', e.color)}
                  style={{ width: `${e.share * 100}%` }}
                  title={`${(e.name ?? '').trim() || e.id}  ${(e.share * 100).toFixed(1)}%`}
                  aria-hidden="true"
                />
              ))}
              {stats.other > 0 ? (
                <div
                  className="h-full bg-slate-300"
                  style={{ width: `${pct(stats.other, stats.total) * 100}%` }}
                  title={`${t('statistics.other')}  ${(pct(stats.other, stats.total) * 100).toFixed(1)}%`}
                  aria-hidden="true"
                />
              ) : null}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {stats.top5Entries.map((e) => {
                const name = (e.name ?? '').trim() || e.id
                return (
                  <div key={e.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-center gap-2">
                      <span className={cn('h-2.5 w-2.5 rounded-sm', e.color)} aria-hidden="true" />
                      <div className="min-w-0 truncate font-medium text-slate-900" title={e.name ? `${e.name} (${e.id})` : e.id}>
                        {name}
                      </div>
                    </div>
                    <div className="shrink-0 text-[11px] text-slate-500 tabular-nums">
                      {(e.share * 100).toFixed(1)}% · {e.total.toLocaleString()}
                    </div>
                  </div>
                )
              })}
              {stats.other > 0 ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm bg-slate-300" aria-hidden="true" />
                    <div className="truncate font-medium text-slate-700">{t('statistics.other')}</div>
                  </div>
                  <div className="shrink-0 text-[11px] text-slate-500 tabular-nums">
                    {(pct(stats.other, stats.total) * 100).toFixed(1)}% · {stats.other.toLocaleString()}
                  </div>
                </div>
              ) : null}
            </div>

            {stats.hhi != null ? (
              <div className="text-[11px] text-slate-500">
                {t('statistics.appConcentration.hhiNote')}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
