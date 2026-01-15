import { useMeritStore } from '../../stores/useMeritStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { MonthlyHistoryCalendar } from './MonthlyHistoryCalendar'
import { useEffect, useMemo, useState } from 'react'
import { Card } from '../ui/card'
import { TrendPanel } from './TrendPanel'
import { AppInputRanking } from './AppInputRanking'
import { appInputCountsForDay, mergeAppInputCounts } from '@/lib/statisticsAggregates'

export function Statistics() {
  const stats = useMeritStore((state) => state.stats)
  const heatLevelCount = useSettingsStore((state) => state.settings?.heatmap_levels)
  const keyboardLayoutId = useSettingsStore((state) => state.settings?.keyboard_layout)
  const allDays = stats ? [stats.today, ...stats.history] : []
  const trendDays = useMemo(() => allDays, [allDays])
  const appCounts = useMemo(() => mergeAppInputCounts(allDays), [allDays])

  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null)
  useEffect(() => {
    if (!selectedDayKey && stats?.today?.date) {
      setSelectedDayKey(stats.today.date)
    }
  }, [selectedDayKey, stats?.today?.date])

  const byDateKey = useMemo(() => {
    const map = new Map<string, (typeof allDays)[number]>()
    for (const day of allDays) {
      const key = day?.date
      if (!key) continue
      const existing = map.get(key)
      if (!existing || (existing.total ?? 0) < (day.total ?? 0)) map.set(key, day)
    }
    return map
  }, [allDays])

  const selectedDay = useMemo(() => {
    if (selectedDayKey) return byDateKey.get(selectedDayKey)
    return stats?.today
  }, [byDateKey, selectedDayKey, stats?.today])

  const appCountsDay = useMemo(() => appInputCountsForDay(selectedDay), [selectedDay])

  return (
    <div className="space-y-2">
      <h3 className="text-slate-600 text-sm mb-2">统计增强</h3>
      {stats ? (
        <div className="space-y-4">
          <Card className="p-4">
            <TrendPanel days={trendDays} defaultRange={7} />
          </Card>

          <Card className="p-4">
            <AppInputRanking counts={appCountsDay} limit={20} modeLabel={selectedDayKey ? `当日 ${selectedDayKey}` : '当日'} title="应用输入排行（按天）" />
          </Card>

          <Card className="p-4">
            <AppInputRanking counts={appCounts} limit={20} modeLabel="累计" title="应用输入排行（累计）" />
          </Card>

          <MonthlyHistoryCalendar
            days={allDays}
            todayKey={stats.today.date}
            heatLevelCount={heatLevelCount}
            keyboardLayoutId={keyboardLayoutId}
            onSelectedKeyChange={setSelectedDayKey}
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
