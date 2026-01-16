import { useMeritStore } from '../../stores/useMeritStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { MonthlyHistoryCalendar } from './MonthlyHistoryCalendar'
import { useEffect, useMemo, useState } from 'react'
import { Card } from '../ui/card'
import { TrendPanel } from './TrendPanel'
import { AppInputRanking } from './AppInputRanking'
import { appInputCountsForDay, mergeAppInputCounts } from '@/lib/statisticsAggregates'
import { Button } from '@/components/ui/button'

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
  const [appRankingMode, setAppRankingMode] = useState<'day' | 'total'>('day')
  const appRankingModeLabel = useMemo(() => {
    if (appRankingMode === 'total') return '累计'
    return selectedDayKey ? `当日 ${selectedDayKey}` : '当日'
  }, [appRankingMode, selectedDayKey])
  const appRankingCounts = appRankingMode === 'total' ? appCounts : appCountsDay

  return (
    <div className="space-y-2">
      <h3 className="text-slate-600 text-sm mb-2">统计增强</h3>
      {stats ? (
        <div className="space-y-4">
          <Card className="p-4">
            <TrendPanel days={trendDays} defaultRange={7} />
          </Card>

          <Card className="p-4">
            <AppInputRanking
              counts={appRankingCounts}
              limit={20}
              title="应用输入排行"
              headerRight={
                <div className="flex items-center gap-2" data-no-drag>
                  <div className="text-[11px] text-slate-500 tabular-nums">{appRankingModeLabel}</div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant={appRankingMode === 'day' ? 'secondary' : 'outline'}
                      size="sm"
                      onClick={() => setAppRankingMode('day')}
                      data-no-drag
                    >
                      当日
                    </Button>
                    <Button
                      type="button"
                      variant={appRankingMode === 'total' ? 'secondary' : 'outline'}
                      size="sm"
                      onClick={() => setAppRankingMode('total')}
                      data-no-drag
                    >
                      累计
                    </Button>
                  </div>
                </div>
              }
            />
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
