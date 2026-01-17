import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DailyStats } from '@/types/merit'
import { buildDayIndex, keysInWindow } from '@/lib/statisticsInsights'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { isLinux, isMac, isWindows } from '@/utils/platform'
import {
  buildKeySpecIndex,
  getKeyboardLayout,
  normalizeKeyboardLayoutId,
  sumKeyCounts,
  totalKeyCount,
  type KeyboardPlatform,
} from '@/lib/keyboard'
import { KeyCombo, type KeyComboPart } from '@/components/ui/key-combo'

type RangeMode = 'day' | '7' | '30' | 'all'

type Entry = { code: string; label: string; count: number; share: number }

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

function keyPart(label: string): KeyComboPart[] {
  return [{ type: 'key', label }]
}

export function KeyPareto({
  days,
  endKey,
  keyboardLayoutId,
  defaultRange = '30',
}: {
  days: DailyStats[]
  endKey: string
  keyboardLayoutId?: string | null
  defaultRange?: RangeMode
}) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<RangeMode>(defaultRange)

  const platform: KeyboardPlatform = useMemo(() => {
    if (isMac()) return 'mac'
    if (isWindows()) return 'windows'
    if (isLinux()) return 'linux'
    return 'windows'
  }, [])

  const layoutId = useMemo(() => normalizeKeyboardLayoutId(keyboardLayoutId), [keyboardLayoutId])
  const keyIndex = useMemo(() => buildKeySpecIndex(getKeyboardLayout(layoutId, platform)), [layoutId, platform])

  const labelForCode = useMemo(() => {
    return (code: string) => keyIndex[code]?.label ?? code
  }, [keyIndex])

  const index = useMemo(() => buildDayIndex(days), [days])

  const stats = useMemo(() => {
    const windowDays = modeToDays(mode)
    const list =
      windowDays != null
        ? keysInWindow(endKey, windowDays).map((k) => index.get(k)).filter(Boolean)
        : Array.from(index.values())
    const merged = sumKeyCounts((list as DailyStats[]).map((d) => d.key_counts))
    const total = totalKeyCount(merged)
    const entries: Entry[] = Object.entries(merged)
      .map(([code, count]) => ({ code, label: labelForCode(code), count: count ?? 0, share: 0 }))
      .filter((e) => e.count > 0)
    entries.sort((a, b) => b.count - a.count)
    for (const e of entries) e.share = pct(e.count, total)

    const top10 = entries.slice(0, 10)
    const top10Sum = top10.reduce((acc, e) => acc + e.count, 0)
    const top10Share = pct(top10Sum, total)
    const longTailShare = Math.max(0, 1 - top10Share)
    return { total, entriesCount: entries.length, top10, top10Sum, top10Share, longTailShare }
  }, [endKey, index, labelForCode, mode])

  const hasAny = stats.total > 0

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 tracking-wide">{t('customStatistics.widgets.key_pareto.title')}</div>
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
          {t('statistics.keyPareto.noData')}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(160px,1fr))]">
            <div className="rounded-lg border border-slate-200/60 bg-white p-3">
              <div className="text-[11px] text-slate-500">{t('statistics.keyPareto.topNShare', { n: 10 })}</div>
              <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{Math.round(stats.top10Share * 100)}%</div>
              <div className="mt-1 text-[11px] text-slate-500 tabular-nums">{stats.top10Sum.toLocaleString()} / {stats.total.toLocaleString()}</div>
              <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-blue-600" style={{ width: `${stats.top10Share * 100}%` }} aria-hidden="true" />
              </div>
            </div>
            <div className="rounded-lg border border-slate-200/60 bg-white p-3">
              <div className="text-[11px] text-slate-500">{t('statistics.keyPareto.longTailShare')}</div>
              <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{Math.round(stats.longTailShare * 100)}%</div>
              <div className="mt-1 text-[11px] text-slate-500 tabular-nums">{t('statistics.keyPareto.longTailHint', { n: 10 })}</div>
              <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-slate-400" style={{ width: `${stats.longTailShare * 100}%` }} aria-hidden="true" />
              </div>
            </div>
            <div className="rounded-lg border border-slate-200/60 bg-white p-3">
              <div className="text-[11px] text-slate-500">{t('statistics.keyPareto.totalKeyPresses')}</div>
              <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{stats.total.toLocaleString()}</div>
              <div className="mt-1 text-[11px] text-slate-500 tabular-nums">{t('statistics.keyPareto.coverage', { keys: stats.entriesCount.toLocaleString() })}</div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200/60 bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold text-slate-900">{t('statistics.keyPareto.topNKeys', { n: 10 })}</div>
              <div className="text-xs text-slate-500 tabular-nums">{t('statistics.keyPareto.shareWithValue', { value: Math.round(stats.top10Share * 100).toLocaleString() })}</div>
            </div>

            <div className="mt-3 space-y-2">
              {stats.top10.map((e, idx) => (
                <div key={e.code} className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex items-center gap-2">
                    <div className={cn('h-6 w-6 rounded-md border border-slate-200/60 bg-slate-50 text-[11px] flex items-center justify-center tabular-nums text-slate-600')}>
                      {idx + 1}
                    </div>
                    <KeyCombo parts={keyPart(e.label)} size="sm" className="font-medium" />
                    <div className="min-w-0 truncate text-[11px] text-slate-400">{e.code}</div>
                  </div>
                  <div className="shrink-0 text-[11px] text-slate-500 tabular-nums">
                    {(e.share * 100).toFixed(1)}% · {e.count.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
