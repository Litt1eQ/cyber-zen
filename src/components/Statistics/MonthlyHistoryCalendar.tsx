import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { DailyStats } from '../../types/merit'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { cn } from '@/lib/utils'
import { sumKeyCounts, type KeyCounts } from '@/lib/keyboard'
import { KeyboardHeatmap } from './KeyboardHeatmap'
import { MouseButtonsHeatmap } from './MouseButtonsHeatmap'
import { ShortcutList } from './ShortcutList'
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
  formatMonthLabel,
  formatNaiveDateKey,
  formatWeekdayZh,
  isSameMonth,
  monthCompare,
  naiveDateToLocalDate,
  parseNaiveDate,
  startOfMonth,
  type YearMonth,
  yearMonthFromNaiveDateKey,
} from '@/lib/date'

const WEEKDAYS_ZH = ['一', '二', '三', '四', '五', '六', '日'] as const

type Props = {
  days: DailyStats[]
  todayKey?: string
  heatLevelCount?: number
}

function safeLocalDateFromKey(dateKey: string): Date | null {
  const parts = parseNaiveDate(dateKey)
  if (!parts) return null
  return naiveDateToLocalDate(parts)
}

function formatDateLabelZh(dateKey: string): string {
  const date = safeLocalDateFromKey(dateKey)
  if (!date) return dateKey
  return `${date.getMonth() + 1}月${date.getDate()}日（${formatWeekdayZh(date)}）`
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

export function MonthlyHistoryCalendar({ days, todayKey, heatLevelCount }: Props) {
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

  const [cursor, setCursor] = useState<YearMonth>(initialCursor)
  const [selectedKey, setSelectedKey] = useState<string | null>(todayKey ?? null)
  const [keyHeatMode, setKeyHeatMode] = useState<'day' | 'total'>('day')

  useEffect(() => {
    setCursor(initialCursor)
    setSelectedKey(todayKey ?? null)
  }, [initialCursor, todayKey])

  const canGoPrev = monthCompare(addMonths(cursor, -1), range.min) >= 0
  const canGoNext = monthCompare(addMonths(cursor, 1), range.max) <= 0

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
  }, [cursor, monthDays, selectedKey, todayKey])

  const selectedDay = selectedKey ? byDateKey.get(selectedKey) : undefined
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
    <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_1fr] gap-4">
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900 tracking-wide">{formatMonthLabel(cursor)}</div>
            <div className="text-xs text-slate-500">
              <span className="sr-only">{cursor.year}年</span>
              点击日期查看详情
            </div>
          </div>

          <div className="flex items-center gap-2" data-no-drag>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={!canGoPrev}
              onClick={() => setCursor((c) => addMonths(c, -1))}
              aria-label="上个月"
              title={`${cursor.year}年${cursor.month}月 上个月`}
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
              aria-label="下个月"
              title={`${cursor.year}年${cursor.month}月 下个月`}
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
              今天
            </Button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-2">
          {WEEKDAYS_ZH.map((w) => (
            <div key={w} className="text-xs text-slate-500 text-center">
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
            return (
              <button
                key={cell.key}
                type="button"
                onClick={() => setSelectedKey(cell.key)}
                className={cn(
                  'aspect-square rounded-lg border text-left px-2 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
                  heatClass(level, heatLevelsCount),
                  isSelected && 'ring-2 ring-blue-500 ring-offset-2',
                  isToday && 'outline outline-1 outline-blue-600/60'
                )}
                aria-pressed={isSelected}
                aria-label={`${formatDateLabelZh(cell.key)}，总计 ${total}`}
                title={`${cell.key}  总计 ${total}`}
                data-no-drag
              >
                <div className={cn('text-xs font-medium', isHeatDark(level, heatLevelsCount) ? 'text-white' : 'text-slate-700')}>
                  {cell.day}
                </div>
                <div
                  className={cn(
                    'mt-1 text-[11px] tabular-nums',
                    isHeatDark(level, heatLevelsCount) ? 'text-white/90' : 'text-slate-500'
                  )}
                >
                  {total > 0 ? total.toLocaleString() : ''}
                </div>
              </button>
            )
          })}
        </div>

        <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
          <div className="min-w-0 truncate" title={`${cursor.year}年${cursor.month}月`}>
            <span className="sr-only">{cursor.year}年</span>
            {cursor.month}月热力
          </div>
          <div className="flex items-center gap-2">
            <span>少</span>
            {heatLevels(heatLevelsCount).map((lv) => (
              <span key={lv} className={cn('h-3 w-3 rounded border', heatClass(lv, heatLevelsCount))} aria-hidden="true" />
            ))}
            <span>多</span>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900 tracking-wide">当日详情</div>
            <div className="mt-1 text-xs text-slate-500">{selectedKey ? formatDateLabelZh(selectedKey) : '请选择一天'}</div>
          </div>
          <div className="flex items-center gap-2" data-no-drag>
            <Button
              type="button"
              variant={keyHeatMode === 'day' ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setKeyHeatMode('day')}
              data-no-drag
            >
              当日
            </Button>
            <Button
              type="button"
              variant={keyHeatMode === 'total' ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setKeyHeatMode('total')}
              data-no-drag
            >
              累计
            </Button>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200/60 bg-white p-4">
          <div className="text-xs text-slate-500">数量</div>
          <div className="mt-2 text-3xl font-bold text-slate-900 tabular-nums">
            {(selectedDay?.total ?? 0).toLocaleString()}
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200/60 bg-white p-4">
          <div className="text-xs text-slate-500">来源</div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-slate-50 border border-slate-200/60 p-3">
              <div className="text-xs text-slate-500">键盘</div>
              <div className="text-xl font-bold text-slate-900 mt-1 tabular-nums">
                {(selectedDay?.keyboard ?? 0).toLocaleString()}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-200/60 p-3">
              <div className="text-xs text-slate-500">单击</div>
              <div className="text-xl font-bold text-slate-900 mt-1 tabular-nums">
                {(selectedDay?.mouse_single ?? 0).toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200/60 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-slate-500">键盘热力图</div>
            <div className="text-xs text-slate-500">{keyHeatMode === 'day' ? '当日' : '累计'}</div>
          </div>
          <div className="mt-3">
            <KeyboardHeatmap
              unshiftedCounts={keyCountsUnshifted}
              shiftedCounts={keyCountsShifted}
              heatLevelCount={heatLevelsCount}
            />
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200/60 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-slate-500">快捷键排行</div>
            <div className="text-xs text-slate-500">{keyHeatMode === 'day' ? '当日' : '累计'}</div>
          </div>
          <div className="mt-3">
            <ShortcutList counts={shortcutCounts} />
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200/60 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-slate-500">鼠标热力图</div>
            <div className="text-xs text-slate-500">{keyHeatMode === 'day' ? '当日' : '累计'}</div>
          </div>
          <div className="mt-3">
            <MouseButtonsHeatmap counts={mouseButtonCounts} heatLevelCount={heatLevelsCount} />
          </div>
        </div>
      </Card>
    </div>
  )
}
