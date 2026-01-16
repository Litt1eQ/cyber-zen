import { useMemo, useState } from 'react'
import type { DailyStats } from '@/types/merit'
import { buildDayIndex, keysInWindow } from '@/lib/statisticsInsights'
import { weekdayIndexMon0FromNaiveDateKey } from '@/lib/date'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { computeHeatThresholds, heatClass, heatLevelForValue, heatLevels, normalizeHeatLevelCount } from './heatScale'

const WEEKDAYS_ZH = ['一', '二', '三', '四', '五', '六', '日'] as const

type Metric = 'total' | 'keyboard' | 'mouse_single'

function metricLabel(metric: Metric) {
  if (metric === 'keyboard') return '键盘'
  if (metric === 'mouse_single') return '单击'
  return '总计'
}

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}`
}

type RangeDays = 7 | 30 | 365

type Cell = {
  weekdayIndexMon0: number
  hour: number
  avg: number
  sum: number
  daysCount: number
}

export function HourlyWeekdayHeatmap({
  days,
  endKey,
  heatLevelCount,
  defaultRangeDays = 30,
}: {
  days: DailyStats[]
  endKey: string
  heatLevelCount?: number | null
  defaultRangeDays?: RangeDays
}) {
  const [rangeDays, setRangeDays] = useState<RangeDays>(defaultRangeDays)
  const [metric, setMetric] = useState<Metric>('total')

  const heatLevelsCount = useMemo(() => normalizeHeatLevelCount(heatLevelCount), [heatLevelCount])
  const index = useMemo(() => buildDayIndex(days), [days])

  const data = useMemo(() => {
    const sums: number[][] = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
    const counts: number[][] = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
    let anyHourly = false

    for (const key of keysInWindow(endKey, rangeDays)) {
      const weekday = weekdayIndexMon0FromNaiveDateKey(key)
      if (weekday == null) continue
      const day = index.get(key)
      const hourly = day?.hourly ?? null
      if (!hourly) continue
      anyHourly = true

      for (let hour = 0; hour < Math.min(24, hourly.length); hour++) {
        const b = hourly[hour]
        if (!b) continue
        const v =
          metric === 'keyboard'
            ? (b.keyboard ?? 0)
            : metric === 'mouse_single'
              ? (b.mouse_single ?? 0)
              : (b.total ?? 0)
        sums[weekday]![hour]! += v
        counts[weekday]![hour]! += 1
      }
    }

    const values: number[] = []
    let maxAvg = 0
    const avgGrid: number[][] = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
    const cellGrid: Array<Array<Cell | null>> = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => null))
    for (let weekdayIndexMon0 = 0; weekdayIndexMon0 < 7; weekdayIndexMon0++) {
      for (let hour = 0; hour < 24; hour++) {
        const sum = sums[weekdayIndexMon0]![hour]!
        const daysCount = counts[weekdayIndexMon0]![hour]!
        const avg = daysCount > 0 ? sum / daysCount : 0
        avgGrid[weekdayIndexMon0]![hour]! = avg
        maxAvg = Math.max(maxAvg, avg)
        const cell: Cell = { weekdayIndexMon0, hour, avg, sum, daysCount }
        cellGrid[weekdayIndexMon0]![hour] = cell
        values.push(avg)
      }
    }

    const thresholds = computeHeatThresholds(values, heatLevelsCount)
    return { anyHourly, maxAvg, thresholds, avgGrid, cellGrid }
  }, [endKey, heatLevelsCount, index, metric, rangeDays])

  if (!data.anyHourly) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900 tracking-wide">周几 × 小时热力</div>
            <div className="mt-1 text-xs text-slate-500 tabular-nums">近 {rangeDays} 天（截止 {endKey}）</div>
          </div>
          <div className="flex items-center gap-2" data-no-drag>
            <Button type="button" size="sm" variant={rangeDays === 7 ? 'secondary' : 'outline'} onClick={() => setRangeDays(7)} data-no-drag>
              7 天
            </Button>
            <Button type="button" size="sm" variant={rangeDays === 30 ? 'secondary' : 'outline'} onClick={() => setRangeDays(30)} data-no-drag>
              30 天
            </Button>
            <Button type="button" size="sm" variant={rangeDays === 365 ? 'secondary' : 'outline'} onClick={() => setRangeDays(365)} data-no-drag>
              1 年
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-3 py-5 text-center text-sm text-slate-500">
          暂无小时数据（仅新版本开始记录）
        </div>
      </div>
    )
  }

  const cellSize = 12
  const gap = 4
  const labelW = 26
  const gridW = 24 * cellSize + 23 * gap

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 tracking-wide">周几 × 小时热力</div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            {metricLabel(metric)} · 平均/天 · 近 {rangeDays} 天（截止 {endKey}）
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2" data-no-drag>
          <div className="flex items-center gap-1" data-no-drag>
            <Button type="button" size="sm" variant={metric === 'total' ? 'secondary' : 'outline'} onClick={() => setMetric('total')} data-no-drag>
              总计
            </Button>
            <Button type="button" size="sm" variant={metric === 'keyboard' ? 'secondary' : 'outline'} onClick={() => setMetric('keyboard')} data-no-drag>
              键盘
            </Button>
            <Button
              type="button"
              size="sm"
              variant={metric === 'mouse_single' ? 'secondary' : 'outline'}
              onClick={() => setMetric('mouse_single')}
              data-no-drag
            >
              单击
            </Button>
          </div>
          <div className="h-6 w-px bg-slate-200/70" aria-hidden="true" />
          <div className="flex items-center gap-1" data-no-drag>
            <Button type="button" size="sm" variant={rangeDays === 7 ? 'secondary' : 'outline'} onClick={() => setRangeDays(7)} data-no-drag>
              7 天
            </Button>
            <Button type="button" size="sm" variant={rangeDays === 30 ? 'secondary' : 'outline'} onClick={() => setRangeDays(30)} data-no-drag>
              30 天
            </Button>
            <Button type="button" size="sm" variant={rangeDays === 365 ? 'secondary' : 'outline'} onClick={() => setRangeDays(365)} data-no-drag>
              1 年
            </Button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-max">
          <div className="flex gap-1 pl-[26px]">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="text-[10px] leading-3 text-slate-500 tabular-nums" style={{ width: cellSize }}>
                {h % 2 === 0 ? hourLabel(h) : ''}
              </div>
            ))}
          </div>

          <div className="mt-2 flex items-start gap-3" style={{ width: labelW + gridW }}>
            <div className="w-[26px] shrink-0 flex flex-col gap-1 pt-[1px]">
              {WEEKDAYS_ZH.map((label) => (
                <div key={label} className="text-[11px] text-slate-600 tabular-nums" style={{ height: cellSize }}>
                  周{label}
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-1" style={{ width: gridW }}>
              {Array.from({ length: 7 }, (_, weekdayIndexMon0) => (
                <div key={weekdayIndexMon0} className="flex gap-1">
                  {Array.from({ length: 24 }, (_, hour) => {
                    const cell = data.cellGrid[weekdayIndexMon0]![hour]
                    const avg = cell?.avg ?? 0
                    const level = heatLevelForValue(avg, data.maxAvg, data.thresholds, heatLevelsCount)
                    const label = WEEKDAYS_ZH[weekdayIndexMon0] ?? String(weekdayIndexMon0)
                    const title = `周${label} ${hourLabel(hour)}:00  平均 ${Math.round(avg).toLocaleString()}/天（覆盖 ${cell?.daysCount ?? 0} 天）`
                    return (
                      <div
                        key={`${weekdayIndexMon0}-${hour}`}
                        className={cn('rounded-[3px] border', heatClass(level, heatLevelsCount))}
                        title={title}
                        style={{ width: cellSize, height: cellSize }}
                        data-no-drag
                        aria-label={title}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <div className="tabular-nums">颜色：{metricLabel(metric)} 平均/天</div>
        <div className="flex items-center gap-2">
          <span>少</span>
          {heatLevels(heatLevelsCount).map((lv) => (
            <span key={lv} className={cn('h-3 w-3 rounded border', heatClass(lv, heatLevelsCount))} aria-hidden="true" />
          ))}
          <span>多</span>
        </div>
      </div>
    </div>
  )
}
