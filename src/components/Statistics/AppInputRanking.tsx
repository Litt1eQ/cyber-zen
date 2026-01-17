import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { RankingPanel, type RankingEntry } from '@/components/Statistics/ranking/RankingPanel'
import type { AppInputStats } from '@/lib/statisticsAggregates'
import { COMMANDS } from '@/types/events'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

type Entry = { id: string; name?: string | null; total: number; keyboard: number; mouse_single: number }
type MetricMode = 'total' | 'keyboard' | 'mouse_single'
type SortMode = 'value' | 'keyboard_share' | 'mouse_share' | 'name'

function toEntries(counts: Record<string, AppInputStats>): Entry[] {
  return Object.entries(counts)
    .map(([id, v]) => ({
      id,
      name: v?.name,
      total: v?.total ?? (v?.keyboard ?? 0) + (v?.mouse_single ?? 0),
      keyboard: v?.keyboard ?? 0,
      mouse_single: v?.mouse_single ?? 0,
    }))
    .filter((e) => (e.total ?? 0) > 0)
}

function normalizeQuery(raw: string): string {
  return raw.trim().toLowerCase()
}

function metricValue(entry: Entry, metric: MetricMode): number {
  if (metric === 'keyboard') return entry.keyboard
  if (metric === 'mouse_single') return entry.mouse_single
  return entry.total
}

function pct(n: number, d: number): number {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return 0
  return Math.max(0, Math.min(1, n / d))
}

export function AppInputRanking({
  counts,
  limit = 20,
  modeLabel,
  title,
  headerRight,
  interactive = false,
}: {
  counts: Record<string, AppInputStats>
  limit?: number
  modeLabel?: string
  title?: string
  headerRight?: React.ReactNode
  interactive?: boolean
}) {
  const { t } = useTranslation()
  const resolvedTitle = title ?? t('customStatistics.widgets.app_ranking_total.title')
  const requestedRef = useRef<Set<string>>(new Set())
  const [icons, setIcons] = useState<Record<string, string | null>>({})
  const [query, setQuery] = useState('')
  const [metric, setMetric] = useState<MetricMode>('total')
  const [sortMode, setSortMode] = useState<SortMode>('value')

  useEffect(() => {
    if (metric !== 'total' && (sortMode === 'keyboard_share' || sortMode === 'mouse_share')) {
      setSortMode('value')
    }
  }, [metric, sortMode])

  const baseEntries = useMemo(() => {
    const list = toEntries(counts)
    list.sort((a, b) => b.total - a.total)
    return list
  }, [counts])

  const derived = useMemo(() => {
    const q = normalizeQuery(query)
    const filtered = q
      ? baseEntries.filter((e) => {
          const name = (e.name ?? '').toLowerCase()
          return name.includes(q) || e.id.toLowerCase().includes(q)
        })
      : baseEntries

    const cmp = (a: Entry, b: Entry): number => {
      if (sortMode === 'name') {
        const an = ((a.name ?? '').trim() || a.id).toLowerCase()
        const bn = ((b.name ?? '').trim() || b.id).toLowerCase()
        return an.localeCompare(bn)
      }

      if (sortMode === 'keyboard_share') {
        const av = pct(a.keyboard, a.total)
        const bv = pct(b.keyboard, b.total)
        if (bv !== av) return bv - av
        const av2 = metricValue(a, metric)
        const bv2 = metricValue(b, metric)
        return bv2 - av2
      }

      if (sortMode === 'mouse_share') {
        const av = pct(a.mouse_single, a.total)
        const bv = pct(b.mouse_single, b.total)
        if (bv !== av) return bv - av
        const av2 = metricValue(a, metric)
        const bv2 = metricValue(b, metric)
        return bv2 - av2
      }

      const av = metricValue(a, metric)
      const bv = metricValue(b, metric)
      if (bv !== av) return bv - av
      return b.total - a.total
    }

    const list = [...filtered].filter((e) => metricValue(e, metric) > 0)
    list.sort(cmp)

    const maxValue = list.reduce((acc, e) => Math.max(acc, metricValue(e, metric)), 0)
    return { list, maxValue, baseCount: baseEntries.length, filteredCount: filtered.length }
  }, [baseEntries, metric, query, sortMode])

  const entries = derived.list

  useEffect(() => {
    if (!isTauri()) return
    const ids = entries.slice(0, limit).map((e) => e.id)
    for (const id of ids) {
      if (!id) continue
      if (requestedRef.current.has(id)) continue
      requestedRef.current.add(id)

      void invoke<string | null>(COMMANDS.GET_APP_ICON, { appId: id })
        .then((pngBase64) => {
          setIcons((prev) => (id in prev ? prev : { ...prev, [id]: pngBase64 }))
        })
        .catch(() => {
          setIcons((prev) => (id in prev ? prev : { ...prev, [id]: null }))
        })
    }
  }, [entries, limit])

  const panelEntries: RankingEntry[] = useMemo(() => {
    return entries.slice(0, limit).map((e) => {
      const displayName = (e.name ?? '').trim() || e.id
      const icon = icons[e.id]
      const fallbackLetter = displayName.trim().slice(0, 1).toUpperCase()
      const value = metricValue(e, metric)
      const showSegments = metric === 'total'
      return {
        id: e.id,
        value,
        segments: showSegments
          ? [
              { value: e.keyboard, className: 'bg-emerald-600', title: t('statistics.breakdown.keyboard', { value: e.keyboard.toLocaleString() }) },
              { value: e.mouse_single, className: 'bg-emerald-300', title: t('statistics.breakdown.click', { value: e.mouse_single.toLocaleString() }) },
            ]
          : undefined,
        title: e.name ? `${e.name} (${e.id})` : e.id,
        label: (
          <div className="inline-flex items-center gap-2.5 min-w-0">
            <div className="h-6 w-6 shrink-0 overflow-hidden rounded-md border border-slate-200/60 bg-white">
              {icon ? (
                <img src={`data:image/png;base64,${icon}`} alt="" className="h-full w-full object-contain" />
              ) : (
                <div className="h-full w-full flex items-center justify-center bg-slate-50 text-[11px] font-semibold text-slate-600">
                  {fallbackLetter || '?'}
                </div>
              )}
            </div>
            <div className="truncate font-medium text-slate-900">{displayName}</div>
            {metric === 'total' ? (
              <div className="ml-1 truncate text-[11px] text-slate-500 tabular-nums">
                {t('statistics.appInputRanking.segmentSummary', {
                  keyboard: e.keyboard.toLocaleString(),
                  click: e.mouse_single.toLocaleString(),
                })}
              </div>
            ) : metric === 'keyboard' ? (
              <div className="ml-1 truncate text-[11px] text-slate-500 tabular-nums">
                {t('statistics.appInputRanking.shareSummary', {
                  share: Math.round(pct(e.keyboard, e.total) * 100).toLocaleString(),
                  total: e.total.toLocaleString(),
                })}
              </div>
            ) : (
              <div className="ml-1 truncate text-[11px] text-slate-500 tabular-nums">
                {t('statistics.appInputRanking.shareSummary', {
                  share: Math.round(pct(e.mouse_single, e.total) * 100).toLocaleString(),
                  total: e.total.toLocaleString(),
                })}
              </div>
            )}
          </div>
        ),
      }
    })
  }, [entries, icons, limit, metric, t])

  const toolbar = useMemo(() => {
    if (!interactive) return null

    const sortOptions: Array<{ value: SortMode; label: string }> = [
      { value: 'value', label: t('statistics.appInputRanking.sort.byValue') },
      ...(metric === 'total'
        ? [
            { value: 'keyboard_share' as const, label: t('statistics.appInputRanking.sort.keyboardShare') },
            { value: 'mouse_share' as const, label: t('statistics.appInputRanking.sort.clickShare') },
          ]
        : []),
      { value: 'name', label: t('statistics.appInputRanking.sort.byName') },
    ]

    return (
      <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
        <div className="sm:col-span-3">
          <Input
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder={t('statistics.appInputRanking.searchPlaceholder')}
            className="h-9"
            data-no-drag
          />
        </div>

        <div className="sm:col-span-1">
          <Select value={metric} onValueChange={(v) => setMetric(v as MetricMode)}>
            <SelectTrigger className="h-9" data-no-drag>
              <SelectValue placeholder={t('statistics.appInputRanking.metricPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="total">{t('customStatistics.total')}</SelectItem>
              <SelectItem value="keyboard">{t('customStatistics.keyboard')}</SelectItem>
              <SelectItem value="mouse_single">{t('customStatistics.click')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="sm:col-span-2">
          <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
            <SelectTrigger className="h-9" data-no-drag>
              <SelectValue placeholder={t('statistics.appInputRanking.sortPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="sm:col-span-6 flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
          <div className="min-w-0 truncate">
            {derived.filteredCount !== derived.baseCount ? (
              <>{t('statistics.appInputRanking.matchCount', { filtered: derived.filteredCount.toLocaleString(), base: derived.baseCount.toLocaleString() })}</>
            ) : (
              <>{t('statistics.appInputRanking.coverageCount', { apps: derived.baseCount.toLocaleString() })}</>
            )}
          </div>
          <div className={cn('shrink-0', (query.trim() || sortMode !== 'value' || metric !== 'total') && 'text-slate-400')}>
            {query.trim() ? t('statistics.appInputRanking.filtered') : ' '}
          </div>
        </div>
      </div>
    )
  }, [derived.baseCount, derived.filteredCount, interactive, metric, query, sortMode, t])

  return (
    <RankingPanel
      title={resolvedTitle}
      subtitle={interactive ? undefined : t('statistics.appInputRanking.coverageSubtitle', { apps: entries.length.toLocaleString() })}
      entries={panelEntries}
      limit={limit}
      maxValue={derived.maxValue}
      tone="up"
      emptyLabel={t('statistics.appInputRanking.noData')}
      headerRight={headerRight ?? modeLabel ?? null}
      toolbar={toolbar}
      listContainerClassName="max-h-72 overflow-y-auto pr-2"
      className="p-4"
    />
  )
}
