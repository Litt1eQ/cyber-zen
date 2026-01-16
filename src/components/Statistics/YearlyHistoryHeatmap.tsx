import { useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { DailyStats } from '@/types/merit'
import { cn } from '@/lib/utils'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { computeHeatThresholds, heatClass, heatLevelForValue, heatLevels, normalizeHeatLevelCount } from './heatScale'
import { formatNaiveDateKey } from '@/lib/date'

type YearGridCell = {
  key: string
  inYear: boolean
  month: number
}

function buildYearGrid(year: number) {
  const weekStart = 1 // Monday
  const jan1 = new Date(year, 0, 1, 12)
  const dec31 = new Date(year, 11, 31, 12)

  const leading = (jan1.getDay() - weekStart + 7) % 7
  const start = new Date(jan1)
  start.setDate(jan1.getDate() - leading)

  const lastWeekday = 0 // Sunday
  const trailing = (lastWeekday - dec31.getDay() + 7) % 7
  const end = new Date(dec31)
  end.setDate(dec31.getDate() + trailing)

  const weeks: Array<Array<YearGridCell | null>> = []
  let column: Array<YearGridCell | null> = Array.from({ length: 7 }, () => null)
  weeks.push(column)

  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dayIndex = (d.getDay() - weekStart + 7) % 7
    if (dayIndex === 0 && d.getTime() !== start.getTime()) {
      column = Array.from({ length: 7 }, () => null)
      weeks.push(column)
    }

    const inYear = d.getFullYear() === year
    const key = formatNaiveDateKey({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() })
    column[dayIndex] = { key, inYear, month: d.getMonth() + 1 }
  }

  const monthLabels: Array<string | null> = []
  let lastLabeledMonth: number | null = null
  for (const week of weeks) {
    const firstInYear = week.find((c) => c?.inYear)
    const month = firstInYear?.month ?? null
    if (!month) {
      monthLabels.push(null)
      continue
    }
    if (lastLabeledMonth !== month) {
      monthLabels.push(`${month}月`)
      lastLabeledMonth = month
      continue
    }
    monthLabels.push(null)
  }

  return { weeks, monthLabels }
}

export type YearlyHistoryHeatmapProps = {
  byDateKey: Map<string, DailyStats>
  selectedKey: string | null
  todayKey?: string
  heatLevelCount?: number
  year: number
  minYear: number
  maxYear: number
  onYearChange: (year: number) => void
  onSelectKey: (key: string) => void
}

export function YearlyHistoryHeatmap({
  byDateKey,
  selectedKey,
  todayKey,
  heatLevelCount,
  year,
  minYear,
  maxYear,
  onYearChange,
  onSelectKey,
}: YearlyHistoryHeatmapProps) {
  const heatLevelsCount = useMemo(() => normalizeHeatLevelCount(heatLevelCount), [heatLevelCount])
  const { weeks, monthLabels } = useMemo(() => buildYearGrid(year), [year])

  const yearTotals = useMemo(() => {
    const totals: number[] = []
    for (const week of weeks) {
      for (const cell of week) {
        if (!cell?.inYear) continue
        totals.push(byDateKey.get(cell.key)?.total ?? 0)
      }
    }
    const maxTotal = totals.reduce((acc, v) => Math.max(acc, v), 0)
    return { maxTotal, thresholds: computeHeatThresholds(totals, heatLevelsCount) }
  }, [byDateKey, heatLevelsCount, weeks])

  const canGoPrev = year - 1 >= minYear
  const canGoNext = year + 1 <= maxYear
  const dayLabels = ['一', '', '三', '', '五', '', ''] as const

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 tracking-wide">{year}年</div>
          <div className="text-[11px] text-slate-500">贡献热力（按周）</div>
        </div>

        <div className="flex items-center gap-2" data-no-drag>
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={!canGoPrev}
            onClick={() => onYearChange(year - 1)}
            aria-label="上一年"
            title={`${year - 1}年`}
            data-no-drag
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={!canGoNext}
            onClick={() => onYearChange(year + 1)}
            aria-label="下一年"
            title={`${year + 1}年`}
            data-no-drag
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              if (!todayKey) return
              const y = Number(todayKey.slice(0, 4))
              if (Number.isFinite(y)) onYearChange(y)
              onSelectKey(todayKey)
            }}
            disabled={!todayKey}
            data-no-drag
          >
            今天
          </Button>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <div className="min-w-max">
          <div className="flex gap-1 pl-7">
            {monthLabels.map((label, idx) => (
              <div key={`m-${idx}`} className="w-3 text-[10px] leading-3 text-slate-500">
                {label ?? ''}
              </div>
            ))}
          </div>

          <div className="mt-1 flex gap-1">
            <div className="w-7 shrink-0 flex flex-col gap-1">
              {dayLabels.map((label, idx) => (
                <div key={`d-${idx}`} className="h-3 text-[10px] leading-3 text-slate-500">
                  {label}
                </div>
              ))}
            </div>

            <div className="flex gap-1">
              {weeks.map((week, weekIdx) => (
                <div key={`w-${weekIdx}`} className="flex flex-col gap-1">
                  {week.map((cell, rowIdx) => {
                    if (!cell) return <div key={`e-${weekIdx}-${rowIdx}`} className="h-3 w-3" aria-hidden="true" />
                    if (!cell.inYear) return <div key={cell.key} className="h-3 w-3 opacity-0" aria-hidden="true" />

                    const total = byDateKey.get(cell.key)?.total ?? 0
                    const level = heatLevelForValue(total, yearTotals.maxTotal, yearTotals.thresholds, heatLevelsCount)
                    const isSelected = selectedKey === cell.key
                    const isToday = todayKey === cell.key

                    return (
                      <button
                        key={cell.key}
                        type="button"
                        onClick={() => onSelectKey(cell.key)}
                        className={cn(
                          'h-3 w-3 rounded-[3px] border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1',
                          heatClass(level, heatLevelsCount),
                          isSelected && 'ring-2 ring-blue-500 ring-offset-1',
                          isToday && 'outline outline-1 outline-blue-600/60'
                        )}
                        aria-pressed={isSelected}
                        aria-label={`${cell.key} 总计 ${total}`}
                        title={`${cell.key}  总计 ${total}`}
                        data-no-drag
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <div className="min-w-0 truncate" title={`${year}年`}>
          热力
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
  )
}
