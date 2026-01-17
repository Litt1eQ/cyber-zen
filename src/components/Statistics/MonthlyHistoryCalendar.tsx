import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { DailyStats } from '../../types/merit'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { cn } from '@/lib/utils'
import { sumKeyCounts, type KeyCounts } from '@/lib/keyboard'
import { KeyboardHeatmap } from './KeyboardHeatmap'
import { KeyboardHeatmapShareDialog } from './KeyboardHeatmapShareDialog'
import { MouseButtonsHeatmap } from './MouseButtonsHeatmap'
import { ShortcutList } from './ShortcutList'
import { KeyRanking } from './KeyRanking'
import { HourlyDistribution } from './HourlyDistribution'
import { DayComparison } from './DayComparison'
import { YearlyHistoryHeatmap } from './YearlyHistoryHeatmap'
import {
  computeHeatThresholds,
  heatClass,
  heatLevelForValue,
  heatLevels,
  isHeatDark,
  normalizeHeatLevelCount,
} from './heatScale'
import {
  addMonths,
  daysInMonth,
  formatMonthLabelForLocale,
  formatNaiveDateKey,
  isSameMonth,
  monthCompare,
  naiveDateToLocalDate,
  parseNaiveDate,
  startOfMonth,
  type YearMonth,
  addDaysToNaiveDateKey,
  yearMonthFromNaiveDateKey,
} from '@/lib/date'
import { isLinux, isMac, isWindows } from '@/utils/platform'
import { useMediaQuery } from '@/hooks/useMediaQuery'

const YEAR_VIEW_QUERY = '(min-width: 900px)'

type Props = {
  days: DailyStats[]
  todayKey?: string
  heatLevelCount?: number
  keyboardLayoutId?: string | null
  onSelectedKeyChange?: (selectedKey: string | null) => void
  variant?: 'full' | 'calendar_only'
}

function safeLocalDateFromKey(dateKey: string): Date | null {
  const parts = parseNaiveDate(dateKey)
  if (!parts) return null
  return naiveDateToLocalDate(parts)
}

function formatDateLabelForLocale(dateKey: string, locale: string): string {
  const date = safeLocalDateFromKey(dateKey)
  if (!date) return dateKey
  try {
    const md = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(date)
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date)
    return `${md} (${weekday})`
  } catch {
    return dateKey
  }
}

function yearFromDateKey(dateKey: string): number | null {
  const parts = parseNaiveDate(dateKey)
  return parts?.year ?? null
}

function pickRange(days: DailyStats[], todayKey?: string): { min: YearMonth; max: YearMonth } {
  const monthKeys: YearMonth[] = []
  for (const d of days) {
    const ym = yearMonthFromNaiveDateKey(d.date)
    if (ym) monthKeys.push(ym)
  }
  const todayYm = todayKey ? yearMonthFromNaiveDateKey(todayKey) : null
  if (todayYm) monthKeys.push(todayYm)

  if (monthKeys.length === 0) {
    const now = new Date()
    const ym = { year: now.getFullYear(), month: now.getMonth() + 1 }
    return { min: ym, max: ym }
  }

  let min = monthKeys[0]
  let max = monthKeys[0]
  for (const ym of monthKeys) {
    if (monthCompare(ym, min) < 0) min = ym
    if (monthCompare(ym, max) > 0) max = ym
  }
  return { min, max }
}

function clampYearMonth(value: YearMonth, min: YearMonth, max: YearMonth): YearMonth {
  if (monthCompare(value, min) < 0) return min
  if (monthCompare(value, max) > 0) return max
  return value
}

function MonthlyHistoryCalendarOnly({
  days,
  todayKey,
  heatLevelCount,
  onSelectedKeyChange,
}: Pick<Props, 'days' | 'todayKey' | 'heatLevelCount' | 'onSelectedKeyChange'>) {
  const { t, i18n } = useTranslation()
  const showYearView = useMediaQuery(YEAR_VIEW_QUERY)
  const heatLevelsCount = useMemo(() => normalizeHeatLevelCount(heatLevelCount), [heatLevelCount])
  const byDateKey = useMemo(() => {
    const map = new Map<string, DailyStats>()
    for (const day of days) {
      const key = day.date
      const existing = map.get(key)
      if (!existing || (existing.total ?? 0) < (day.total ?? 0)) {
        map.set(key, day)
      }
    }
    return map
  }, [days])

  const range = useMemo(() => pickRange(days, todayKey), [days, todayKey])
  const initialCursor = useMemo(() => {
    const todayYm = todayKey ? yearMonthFromNaiveDateKey(todayKey) : null
    return todayYm ?? range.max
  }, [range.max, todayKey])
  const initialCursorYear = useMemo(() => {
    const y = todayKey ? yearFromDateKey(todayKey) : null
    return y ?? range.max.year
  }, [range.max.year, todayKey])

  const [cursor, setCursor] = useState<YearMonth>(initialCursor)
  const [cursorYear, setCursorYear] = useState<number>(initialCursorYear)
  const [selectedKey, setSelectedKey] = useState<string | null>(todayKey ?? null)
  const prevTodayKeyRef = useRef<string | undefined>(todayKey)

  useEffect(() => {
    // Expose selected day to parent (used by custom statistics window).
    // Optional and does not change the internal calendar behavior.
    onSelectedKeyChange?.(selectedKey)
  }, [onSelectedKeyChange, selectedKey])

  useEffect(() => {
    setCursor((current) => clampYearMonth(current, range.min, range.max))
    setCursorYear((current) => Math.min(range.max.year, Math.max(range.min.year, current)))
  }, [range.max.year, range.max.month, range.min.year, range.min.month])

  useEffect(() => {
    const prev = prevTodayKeyRef.current
    if (todayKey === prev) return
    prevTodayKeyRef.current = todayKey
    if (!todayKey) return
    setSelectedKey((current) => {
      if (!current || current === prev) return todayKey
      return current
    })
  }, [todayKey])

  useEffect(() => {
    if (!showYearView) return
    const y = selectedKey ? yearFromDateKey(selectedKey) : null
    if (y && y !== cursorYear) setCursorYear(y)
  }, [cursorYear, selectedKey, showYearView])

  useEffect(() => {
    if (showYearView) return
    const ym = selectedKey ? yearMonthFromNaiveDateKey(selectedKey) : null
    if (ym && !isSameMonth(ym, cursor)) setCursor(ym)
  }, [cursor, selectedKey, showYearView])

  const canGoPrev = monthCompare(addMonths(cursor, -1), range.min) >= 0
  const canGoNext = monthCompare(addMonths(cursor, 1), range.max) <= 0
  const weekdayLabels = useMemo(() => {
    try {
      const fmt = new Intl.DateTimeFormat(i18n.language, { weekday: 'narrow' })
      const base = new Date(2020, 5, 1, 12) // 2020-06-01 is Monday
      return Array.from({ length: 7 }, (_, idx) => fmt.format(new Date(base.getFullYear(), base.getMonth(), base.getDate() + idx, 12)))
    } catch {
      return ['', '', '', '', '', '', '']
    }
  }, [i18n.language])

  const monthDays = useMemo(() => {
    const first = startOfMonth(cursor)
    const totalDays = daysInMonth(cursor)
    const weekStart = 1 // Monday
    const firstDow = first.getDay()
    const leading = (firstDow - weekStart + 7) % 7
    const cells: Array<{ key: string; day: number } | null> = []
    for (let i = 0; i < leading; i++) cells.push(null)
    for (let day = 1; day <= totalDays; day++) {
      const key = formatNaiveDateKey({ year: cursor.year, month: cursor.month, day })
      cells.push({ key, day })
    }
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [cursor])

  const monthTotals = useMemo(() => {
    const totals: number[] = []
    for (const cell of monthDays) {
      if (!cell) continue
      totals.push(byDateKey.get(cell.key)?.total ?? 0)
    }
    const maxTotal = totals.reduce((acc, v) => Math.max(acc, v), 0)
    return { maxTotal, thresholds: computeHeatThresholds(totals, heatLevelsCount) }
  }, [byDateKey, heatLevelsCount, monthDays])

  useEffect(() => {
    if (showYearView) return
    const todayYm = todayKey ? yearMonthFromNaiveDateKey(todayKey) : null
    const monthHasToday = Boolean(todayYm && isSameMonth(todayYm, cursor))

    if (!selectedKey) {
      if (monthHasToday && todayKey) {
        setSelectedKey(todayKey)
        return
      }
      const firstSelectable = monthDays.find((c) => c !== null)?.key ?? null
      setSelectedKey(firstSelectable)
      return
    }

    const selectedYm = yearMonthFromNaiveDateKey(selectedKey)
    if (!selectedYm || !isSameMonth(selectedYm, cursor)) {
      if (monthHasToday && todayKey) {
        setSelectedKey(todayKey)
        return
      }
      const firstSelectable = monthDays.find((c) => c !== null)?.key ?? null
      setSelectedKey(firstSelectable)
    }
  }, [cursor, monthDays, selectedKey, showYearView, todayKey])

  useEffect(() => {
    if (!showYearView) return
    const todayY = todayKey ? yearFromDateKey(todayKey) : null
    const yearHasToday = Boolean(todayY && todayY === cursorYear)

    if (!selectedKey) {
      if (yearHasToday && todayKey) {
        setSelectedKey(todayKey)
        return
      }
      setSelectedKey(formatNaiveDateKey({ year: cursorYear, month: 1, day: 1 }))
      return
    }

    const selectedY = yearFromDateKey(selectedKey)
    if (!selectedY || selectedY !== cursorYear) {
      if (yearHasToday && todayKey) {
        setSelectedKey(todayKey)
        return
      }
      setSelectedKey(formatNaiveDateKey({ year: cursorYear, month: 1, day: 1 }))
    }
  }, [cursorYear, selectedKey, showYearView, todayKey])

  return (
    <div className="grid grid-cols-1 gap-4">
      {showYearView ? (
        <YearlyHistoryHeatmap
          byDateKey={byDateKey}
          selectedKey={selectedKey}
          todayKey={todayKey}
          heatLevelCount={heatLevelsCount}
          year={cursorYear}
          minYear={range.min.year}
          maxYear={range.max.year}
          onYearChange={setCursorYear}
          onSelectKey={(key) => setSelectedKey(key)}
        />
      ) : (
        <Card className="p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 tracking-wide">{formatMonthLabelForLocale(cursor, i18n.language)}</div>
              <div className="text-[11px] text-slate-500">
                <span className="sr-only">{t('statistics.calendar.yearSr', { year: cursor.year })}</span>
                {t('statistics.calendar.clickToSelectDate')}
              </div>
            </div>

            <div className="flex items-center gap-2" data-no-drag>
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={!canGoPrev}
                onClick={() => setCursor((c) => addMonths(c, -1))}
                aria-label={t('statistics.calendar.prevMonth')}
                title={t('statistics.calendar.prevMonthTitle', { year: cursor.year, month: cursor.month })}
                data-no-drag
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={!canGoNext}
                onClick={() => setCursor((c) => addMonths(c, 1))}
                aria-label={t('statistics.calendar.nextMonth')}
                title={t('statistics.calendar.nextMonthTitle', { year: cursor.year, month: cursor.month })}
                data-no-drag
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  const ym = todayKey ? yearMonthFromNaiveDateKey(todayKey) : null
                  if (ym) setCursor(ym)
                  if (todayKey) setSelectedKey(todayKey)
                }}
                disabled={!todayKey}
                data-no-drag
              >
                {t('statistics.calendar.today')}
              </Button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-2">
            {weekdayLabels.map((w, idx) => (
              <div key={`${w}-${idx}`} className="text-[11px] text-slate-500 text-center">
                {w}
              </div>
            ))}
            {monthDays.map((cell, idx) => {
              if (!cell) {
                return <div key={`empty-${idx}`} className="aspect-square" aria-hidden="true" />
              }
              const total = byDateKey.get(cell.key)?.total ?? 0
              const level = heatLevelForValue(total, monthTotals.maxTotal, monthTotals.thresholds, heatLevelsCount)
              const isSelected = selectedKey === cell.key
              const isToday = todayKey === cell.key
              const dateLabel = formatDateLabelForLocale(cell.key, i18n.language)
              return (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => setSelectedKey(cell.key)}
                  className={cn(
                    'aspect-square rounded-lg border text-left px-1.5 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
                    heatClass(level, heatLevelsCount),
                    isSelected && 'ring-2 ring-blue-500 ring-offset-2',
                    isToday && 'outline outline-1 outline-blue-600/60'
                  )}
                  aria-pressed={isSelected}
                  aria-label={t('statistics.tooltips.dayTotal', { date: dateLabel, total: total.toLocaleString() })}
                  title={t('statistics.tooltips.dayTotal', { date: cell.key, total: total.toLocaleString() })}
                  data-no-drag
                >
                  <div className={cn('text-[11px] font-medium leading-none', isHeatDark(level, heatLevelsCount) ? 'text-white' : 'text-slate-700')}>
                    {cell.day}
                  </div>
                  <div
                    className={cn(
                      'mt-1 text-[10px] tabular-nums leading-none',
                      isHeatDark(level, heatLevelsCount) ? 'text-white/90' : 'text-slate-500'
                    )}
                  >
                    {total > 0 ? total.toLocaleString() : ''}
                  </div>
                </button>
              )
            })}
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
            <div className="min-w-0 truncate" title={t('statistics.calendar.monthTitle', { year: cursor.year, month: cursor.month })}>
              <span className="sr-only">{t('statistics.calendar.yearSr', { year: cursor.year })}</span>
              {t('statistics.calendar.monthHeat', { month: cursor.month })}
            </div>
            <div className="flex items-center gap-2">
              <span>{t('statistics.heat.low')}</span>
              {heatLevels(heatLevelsCount).map((lv) => (
                <span key={lv} className={cn('h-3 w-3 rounded border', heatClass(lv, heatLevelsCount))} aria-hidden="true" />
              ))}
              <span>{t('statistics.heat.high')}</span>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

function MonthlyHistoryCalendarFull({
  days,
  todayKey,
  heatLevelCount,
  keyboardLayoutId,
  onSelectedKeyChange,
}: Pick<Props, 'days' | 'todayKey' | 'heatLevelCount' | 'keyboardLayoutId' | 'onSelectedKeyChange'>) {
  const { t, i18n } = useTranslation()
  const showYearView = useMediaQuery(YEAR_VIEW_QUERY)
  const heatLevelsCount = useMemo(() => normalizeHeatLevelCount(heatLevelCount), [heatLevelCount])
  const byDateKey = useMemo(() => {
    const map = new Map<string, DailyStats>()
    for (const day of days) {
      const key = day.date
      const existing = map.get(key)
      if (!existing || (existing.total ?? 0) < (day.total ?? 0)) {
        map.set(key, day)
      }
    }
    return map
  }, [days])

  const range = useMemo(() => pickRange(days, todayKey), [days, todayKey])
  const initialCursor = useMemo(() => {
    const todayYm = todayKey ? yearMonthFromNaiveDateKey(todayKey) : null
    return todayYm ?? range.max
  }, [range.max, todayKey])
  const initialCursorYear = useMemo(() => {
    const y = todayKey ? yearFromDateKey(todayKey) : null
    return y ?? range.max.year
  }, [range.max.year, todayKey])

  const [cursor, setCursor] = useState<YearMonth>(initialCursor)
  const [cursorYear, setCursorYear] = useState<number>(initialCursorYear)
  const [selectedKey, setSelectedKey] = useState<string | null>(todayKey ?? null)
  const [keyHeatMode, setKeyHeatMode] = useState<'day' | 'total'>('day')
  const [compareMode, setCompareMode] = useState<'yesterday' | 'last_week'>('yesterday')
  const prevTodayKeyRef = useRef<string | undefined>(todayKey)

  useEffect(() => {
    // Expose selected day to parent (used by custom statistics window).
    // Optional and does not change the internal calendar behavior.
    onSelectedKeyChange?.(selectedKey)
  }, [onSelectedKeyChange, selectedKey])

  useEffect(() => {
    setCursor((current) => clampYearMonth(current, range.min, range.max))
    setCursorYear((current) => Math.min(range.max.year, Math.max(range.min.year, current)))
  }, [range.max.year, range.max.month, range.min.year, range.min.month])

  useEffect(() => {
    const prev = prevTodayKeyRef.current
    if (todayKey === prev) return
    prevTodayKeyRef.current = todayKey
    if (!todayKey) return
    setSelectedKey((current) => {
      if (!current || current === prev) return todayKey
      return current
    })
  }, [todayKey])

  useEffect(() => {
    if (!showYearView) return
    const y = selectedKey ? yearFromDateKey(selectedKey) : null
    if (y && y !== cursorYear) setCursorYear(y)
  }, [cursorYear, selectedKey, showYearView])

  useEffect(() => {
    if (showYearView) return
    const ym = selectedKey ? yearMonthFromNaiveDateKey(selectedKey) : null
    if (ym && !isSameMonth(ym, cursor)) setCursor(ym)
  }, [cursor, selectedKey, showYearView])

  const canGoPrev = monthCompare(addMonths(cursor, -1), range.min) >= 0
  const canGoNext = monthCompare(addMonths(cursor, 1), range.max) <= 0
  const weekdayLabels = useMemo(() => {
    try {
      const fmt = new Intl.DateTimeFormat(i18n.language, { weekday: 'narrow' })
      const base = new Date(2020, 5, 1, 12) // 2020-06-01 is Monday
      return Array.from({ length: 7 }, (_, idx) => fmt.format(new Date(base.getFullYear(), base.getMonth(), base.getDate() + idx, 12)))
    } catch {
      return ['', '', '', '', '', '', '']
    }
  }, [i18n.language])

  const monthDays = useMemo(() => {
    const first = startOfMonth(cursor)
    const totalDays = daysInMonth(cursor)
    const weekStart = 1 // Monday
    const firstDow = first.getDay()
    const leading = (firstDow - weekStart + 7) % 7
    const cells: Array<{ key: string; day: number } | null> = []
    for (let i = 0; i < leading; i++) cells.push(null)
    for (let day = 1; day <= totalDays; day++) {
      const key = formatNaiveDateKey({ year: cursor.year, month: cursor.month, day })
      cells.push({ key, day })
    }
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [cursor])

  const monthTotals = useMemo(() => {
    const totals: number[] = []
    for (const cell of monthDays) {
      if (!cell) continue
      totals.push(byDateKey.get(cell.key)?.total ?? 0)
    }
    const maxTotal = totals.reduce((acc, v) => Math.max(acc, v), 0)
    return { maxTotal, thresholds: computeHeatThresholds(totals, heatLevelsCount) }
  }, [byDateKey, heatLevelsCount, monthDays])

  useEffect(() => {
    if (showYearView) return
    const todayYm = todayKey ? yearMonthFromNaiveDateKey(todayKey) : null
    const monthHasToday = Boolean(todayYm && isSameMonth(todayYm, cursor))

    if (!selectedKey) {
      if (monthHasToday && todayKey) {
        setSelectedKey(todayKey)
        return
      }
      const firstSelectable = monthDays.find((c) => c !== null)?.key ?? null
      setSelectedKey(firstSelectable)
      return
    }

    const selectedYm = yearMonthFromNaiveDateKey(selectedKey)
    if (!selectedYm || !isSameMonth(selectedYm, cursor)) {
      if (monthHasToday && todayKey) {
        setSelectedKey(todayKey)
        return
      }
      const firstSelectable = monthDays.find((c) => c !== null)?.key ?? null
      setSelectedKey(firstSelectable)
    }
  }, [cursor, monthDays, selectedKey, showYearView, todayKey])

  useEffect(() => {
    if (!showYearView) return
    const todayY = todayKey ? yearFromDateKey(todayKey) : null
    const yearHasToday = Boolean(todayY && todayY === cursorYear)

    if (!selectedKey) {
      if (yearHasToday && todayKey) {
        setSelectedKey(todayKey)
        return
      }
      setSelectedKey(formatNaiveDateKey({ year: cursorYear, month: 1, day: 1 }))
      return
    }

    const selectedY = yearFromDateKey(selectedKey)
    if (!selectedY || selectedY !== cursorYear) {
      if (yearHasToday && todayKey) {
        setSelectedKey(todayKey)
        return
      }
      setSelectedKey(formatNaiveDateKey({ year: cursorYear, month: 1, day: 1 }))
    }
  }, [cursorYear, selectedKey, showYearView, todayKey])

  const selectedDay = selectedKey ? byDateKey.get(selectedKey) : undefined

  const platform = useMemo(() => {
    if (isMac()) return 'mac'
    if (isWindows()) return 'windows'
    if (isLinux()) return 'linux'
    return 'windows'
  }, [])

  const compareKeys = useMemo(() => {
    if (!selectedKey) return { yesterday: null, lastWeek: null }
    return {
      yesterday: addDaysToNaiveDateKey(selectedKey, -1),
      lastWeek: addDaysToNaiveDateKey(selectedKey, -7),
    }
  }, [selectedKey])

  const compareReferenceDay = useMemo(() => {
    const key = compareMode === 'yesterday' ? compareKeys.yesterday : compareKeys.lastWeek
    if (!key) return undefined
    return byDateKey.get(key)
  }, [byDateKey, compareKeys.lastWeek, compareKeys.yesterday, compareMode])
  const keyCountsUnshifted: KeyCounts = useMemo(() => {
    if (keyHeatMode === 'total') {
      return sumKeyCounts(days.map((d) => d.key_counts_unshifted ?? d.key_counts))
    }
    return selectedDay?.key_counts_unshifted ?? selectedDay?.key_counts ?? {}
  }, [days, keyHeatMode, selectedDay?.key_counts, selectedDay?.key_counts_unshifted])

  const keyCountsShifted: KeyCounts = useMemo(() => {
    if (keyHeatMode === 'total') {
      return sumKeyCounts(days.map((d) => d.key_counts_shifted))
    }
    return selectedDay?.key_counts_shifted ?? {}
  }, [days, keyHeatMode, selectedDay?.key_counts_shifted])

  const keyCountsAll: KeyCounts = useMemo(() => {
    if (keyHeatMode === 'total') {
      return sumKeyCounts(days.map((d) => d.key_counts))
    }
    return selectedDay?.key_counts ?? {}
  }, [days, keyHeatMode, selectedDay?.key_counts])

  const shareMeritValue = useMemo(() => {
    if (keyHeatMode === 'total') {
      const sum = days.reduce((acc, d) => acc + (d.total ?? 0), 0)
      return sum > 0 ? sum : null
    }
    const v = selectedDay?.total ?? 0
    return v > 0 ? v : null
  }, [days, keyHeatMode, selectedDay?.total])

  const shortcutCounts: Record<string, number> = useMemo(() => {
    if (keyHeatMode === 'total') {
      const merged: Record<string, number> = {}
      for (const day of days) {
        const map = day.shortcut_counts
        if (!map) continue
        for (const [k, v] of Object.entries(map)) {
          if (!v) continue
          merged[k] = (merged[k] ?? 0) + v
        }
      }
      return merged
    }
    return selectedDay?.shortcut_counts ?? {}
  }, [days, keyHeatMode, selectedDay?.shortcut_counts])

  const mouseButtonCounts: Record<string, number> = useMemo(() => {
    if (keyHeatMode === 'total') {
      const merged: Record<string, number> = {}
      for (const day of days) {
        const map = day.mouse_button_counts
        if (!map) continue
        for (const [k, v] of Object.entries(map)) {
          if (!v) continue
          merged[k] = (merged[k] ?? 0) + v
        }
      }
      return merged
    }
    return selectedDay?.mouse_button_counts ?? {}
  }, [days, keyHeatMode, selectedDay?.mouse_button_counts])

  return (
    <div className="grid grid-cols-1 gap-4">
      {showYearView ? (
        <YearlyHistoryHeatmap
          byDateKey={byDateKey}
          selectedKey={selectedKey}
          todayKey={todayKey}
          heatLevelCount={heatLevelsCount}
          year={cursorYear}
          minYear={range.min.year}
          maxYear={range.max.year}
          onYearChange={setCursorYear}
          onSelectKey={(key) => setSelectedKey(key)}
        />
      ) : (
        <Card className="p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 tracking-wide">{formatMonthLabelForLocale(cursor, i18n.language)}</div>
              <div className="text-[11px] text-slate-500">
                <span className="sr-only">{t('statistics.calendar.yearSr', { year: cursor.year })}</span>
                {t('statistics.calendar.clickToViewDetails')}
              </div>
            </div>

            <div className="flex items-center gap-2" data-no-drag>
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={!canGoPrev}
                onClick={() => setCursor((c) => addMonths(c, -1))}
                aria-label={t('statistics.calendar.prevMonth')}
                title={t('statistics.calendar.prevMonthTitle', { year: cursor.year, month: cursor.month })}
                data-no-drag
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={!canGoNext}
                onClick={() => setCursor((c) => addMonths(c, 1))}
                aria-label={t('statistics.calendar.nextMonth')}
                title={t('statistics.calendar.nextMonthTitle', { year: cursor.year, month: cursor.month })}
                data-no-drag
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  const ym = todayKey ? yearMonthFromNaiveDateKey(todayKey) : null
                  if (ym) setCursor(ym)
                  if (todayKey) setSelectedKey(todayKey)
                }}
                disabled={!todayKey}
                data-no-drag
              >
                {t('statistics.calendar.today')}
              </Button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-2">
            {weekdayLabels.map((w, idx) => (
              <div key={`${w}-${idx}`} className="text-[11px] text-slate-500 text-center">
                {w}
              </div>
            ))}
            {monthDays.map((cell, idx) => {
              if (!cell) {
                return <div key={`empty-${idx}`} className="aspect-square" aria-hidden="true" />
              }
              const total = byDateKey.get(cell.key)?.total ?? 0
              const level = heatLevelForValue(total, monthTotals.maxTotal, monthTotals.thresholds, heatLevelsCount)
              const isSelected = selectedKey === cell.key
              const isToday = todayKey === cell.key
              const dateLabel = formatDateLabelForLocale(cell.key, i18n.language)
              return (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => setSelectedKey(cell.key)}
                  className={cn(
                    'aspect-square rounded-lg border text-left px-1.5 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
                    heatClass(level, heatLevelsCount),
                    isSelected && 'ring-2 ring-blue-500 ring-offset-2',
                    isToday && 'outline outline-1 outline-blue-600/60'
                  )}
                  aria-pressed={isSelected}
                  aria-label={t('statistics.tooltips.dayTotal', { date: dateLabel, total: total.toLocaleString() })}
                  title={t('statistics.tooltips.dayTotal', { date: cell.key, total: total.toLocaleString() })}
                  data-no-drag
                >
                  <div className={cn('text-[11px] font-medium leading-none', isHeatDark(level, heatLevelsCount) ? 'text-white' : 'text-slate-700')}>
                    {cell.day}
                  </div>
                  <div
                    className={cn(
                      'mt-1 text-[10px] tabular-nums leading-none',
                      isHeatDark(level, heatLevelsCount) ? 'text-white/90' : 'text-slate-500'
                    )}
                  >
                    {total > 0 ? total.toLocaleString() : ''}
                  </div>
                </button>
              )
            })}
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
            <div className="min-w-0 truncate" title={t('statistics.calendar.monthTitle', { year: cursor.year, month: cursor.month })}>
              <span className="sr-only">{t('statistics.calendar.yearSr', { year: cursor.year })}</span>
              {t('statistics.calendar.monthHeat', { month: cursor.month })}
            </div>
            <div className="flex items-center gap-2">
              <span>{t('statistics.heat.low')}</span>
              {heatLevels(heatLevelsCount).map((lv) => (
                <span key={lv} className={cn('h-3 w-3 rounded border', heatClass(lv, heatLevelsCount))} aria-hidden="true" />
              ))}
              <span>{t('statistics.heat.high')}</span>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900 tracking-wide">{t('statistics.calendar.dayDetails')}</div>
            <div className="mt-1 text-xs text-slate-500">
              {selectedKey ? formatDateLabelForLocale(selectedKey, i18n.language) : t('statistics.calendar.pickADay')}
            </div>
          </div>
          <div className="flex items-center gap-2" data-no-drag>
            <Button
              type="button"
              variant={keyHeatMode === 'day' ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setKeyHeatMode('day')}
              data-no-drag
            >
              {t('customStatistics.mode.daily')}
            </Button>
            <Button
              type="button"
              variant={keyHeatMode === 'total' ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setKeyHeatMode('total')}
              data-no-drag
            >
              {t('customStatistics.mode.cumulative')}
            </Button>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200/60 bg-white p-4">
          <div className="text-xs text-slate-500">{t('statistics.calendar.count')}</div>
          <div className="mt-2 text-3xl font-bold text-slate-900 tabular-nums">
            {(selectedDay?.total ?? 0).toLocaleString()}
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200/60 bg-white p-4">
          <div className="text-xs text-slate-500">{t('statistics.calendar.source')}</div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-slate-50 border border-slate-200/60 p-3">
              <div className="text-xs text-slate-500">{t('customStatistics.keyboard')}</div>
              <div className="text-xl font-bold text-slate-900 mt-1 tabular-nums">
                {(selectedDay?.keyboard ?? 0).toLocaleString()}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-200/60 p-3">
              <div className="text-xs text-slate-500">{t('customStatistics.click')}</div>
              <div className="text-xl font-bold text-slate-900 mt-1 tabular-nums">
                {(selectedDay?.mouse_single ?? 0).toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {keyHeatMode === 'day' && (
          <div className="mt-4 rounded-lg border border-slate-200/60 bg-white p-4">
            <div className="text-xs text-slate-500">{t('statistics.calendar.hourlyDistribution')}</div>
            <div className="mt-3">
              <HourlyDistribution hourly={selectedDay?.hourly ?? null} />
            </div>
          </div>
        )}

        {keyHeatMode === 'day' && (
          <div className="mt-4 rounded-lg border border-slate-200/60 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-slate-500">{t('statistics.calendar.comparison')}</div>
              <div className="flex items-center gap-2" data-no-drag>
                <Button
                  type="button"
                  variant={compareMode === 'yesterday' ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setCompareMode('yesterday')}
                  data-no-drag
                >
                  {t('statistics.calendar.vsYesterday')}
                </Button>
                <Button
                  type="button"
                  variant={compareMode === 'last_week' ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setCompareMode('last_week')}
                  data-no-drag
                >
                  {t('statistics.calendar.vsLastWeek')}
                </Button>
              </div>
            </div>
            <div className="mt-4">
              <DayComparison
                title={
                  compareMode === 'yesterday'
                    ? t('statistics.calendar.compareTitleYesterday', {
                      day: selectedKey ?? t('customStatistics.mode.daily'),
                      other: compareKeys.yesterday ?? 'N/A',
                    })
                    : t('statistics.calendar.compareTitleLastWeek', {
                      day: selectedKey ?? t('customStatistics.mode.daily'),
                      other: compareKeys.lastWeek ?? 'N/A',
                    })
                }
                base={selectedDay}
                reference={compareReferenceDay}
                platform={platform}
              />
            </div>
          </div>
        )}

        <div className="mt-4 rounded-lg border border-slate-200/60 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-slate-500">{t('statistics.calendar.keyboardHeatmap')}</div>
            <div className="flex items-center gap-2" data-no-drag>
              <div className="text-xs text-slate-500">{keyHeatMode === 'day' ? t('customStatistics.mode.daily') : t('customStatistics.mode.cumulative')}</div>
              <KeyboardHeatmapShareDialog
                unshiftedCounts={keyCountsUnshifted}
                shiftedCounts={keyCountsShifted}
                heatLevelCount={heatLevelsCount}
                layoutId={keyboardLayoutId}
                platform={platform}
                dateKey={selectedKey ?? todayKey ?? null}
                modeLabel={keyHeatMode === 'day' ? t('customStatistics.mode.daily') : t('customStatistics.mode.cumulative')}
                meritValue={shareMeritValue}
                meritLabel={
                  keyHeatMode === 'total'
                    ? t('customStatistics.meritLabel.cumulative')
                    : selectedKey && todayKey && selectedKey === todayKey
                      ? t('customStatistics.meritLabel.today')
                      : t('statistics.calendar.meritLabel.day')
                }
              />
            </div>
          </div>
          <div className="mt-3">
            <KeyboardHeatmap
              unshiftedCounts={keyCountsUnshifted}
              shiftedCounts={keyCountsShifted}
              heatLevelCount={heatLevelsCount}
              layoutId={keyboardLayoutId}
            />
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200/60 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-slate-500">{t('statistics.calendar.keyRanking')}</div>
            <div className="text-xs text-slate-500">{keyHeatMode === 'day' ? t('customStatistics.mode.daily') : t('customStatistics.mode.cumulative')}</div>
          </div>
          <div className="mt-3">
            <KeyRanking counts={keyCountsAll} platform={platform} keyboardLayoutId={keyboardLayoutId} />
          </div>
        </div>

        <div className="mt-4">
          <ShortcutList counts={shortcutCounts} modeLabel={keyHeatMode === 'day' ? t('customStatistics.mode.daily') : t('customStatistics.mode.cumulative')} />
        </div>

        <div className="mt-4 rounded-lg border border-slate-200/60 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-slate-500">{t('statistics.calendar.mouseHeatmap')}</div>
            <div className="text-xs text-slate-500">{keyHeatMode === 'day' ? t('customStatistics.mode.daily') : t('customStatistics.mode.cumulative')}</div>
          </div>
          <div className="mt-3">
            <MouseButtonsHeatmap counts={mouseButtonCounts} heatLevelCount={heatLevelsCount} />
          </div>
        </div>
      </Card>
    </div>
  )
}

export function MonthlyHistoryCalendar(props: Props) {
  if (props.variant === 'calendar_only') {
    return (
      <MonthlyHistoryCalendarOnly
        days={props.days}
        todayKey={props.todayKey}
        heatLevelCount={props.heatLevelCount}
        onSelectedKeyChange={props.onSelectedKeyChange}
      />
    )
  }
  return (
    <MonthlyHistoryCalendarFull
      days={props.days}
      todayKey={props.todayKey}
      heatLevelCount={props.heatLevelCount}
      keyboardLayoutId={props.keyboardLayoutId}
      onSelectedKeyChange={props.onSelectedKeyChange}
    />
  )
}
