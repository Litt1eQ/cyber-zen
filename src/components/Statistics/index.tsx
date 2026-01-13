import { useMeritStore } from '../../stores/useMeritStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { MonthlyHistoryCalendar } from './MonthlyHistoryCalendar'
import { TrendChart } from './TrendChart'
import { useMemo, useState } from 'react'
import { Button } from '../ui/button'
import { Card } from '../ui/card'

export function Statistics() {
  const stats = useMeritStore((state) => state.stats)
  const heatLevelCount = useSettingsStore((state) => state.settings?.heatmap_levels)
  const keyboardLayoutId = useSettingsStore((state) => state.settings?.keyboard_layout)
  const allDays = stats ? [stats.today, ...stats.history] : []
  const [range, setRange] = useState<7 | 30>(7)
  const trendDays = useMemo(() => allDays, [allDays])

  return (
    <div className="space-y-2">
      <h3 className="text-slate-600 text-sm mb-2">统计增强</h3>
      {stats ? (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 tracking-wide">7/30 天趋势</div>
                <div className="text-xs text-slate-500 mt-1">总计/键盘/单击</div>
              </div>
              <div className="flex items-center gap-2" data-no-drag>
                <Button
                  type="button"
                  variant={range === 7 ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setRange(7)}
                  data-no-drag
                >
                  7 天
                </Button>
                <Button
                  type="button"
                  variant={range === 30 ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setRange(30)}
                  data-no-drag
                >
                  30 天
                </Button>
              </div>
            </div>
            <div className="mt-4">
              <TrendChart days={trendDays} rangeDays={range} />
            </div>
          </Card>

          <MonthlyHistoryCalendar
            days={allDays}
            todayKey={stats.today.date}
            heatLevelCount={heatLevelCount}
            keyboardLayoutId={keyboardLayoutId}
          />
        </div>
      ) : (
        <div className="rounded-xl p-5 border border-slate-200 bg-white shadow-sm text-slate-500">
          加载中...
        </div>
      )}
    </div>
  )
}
