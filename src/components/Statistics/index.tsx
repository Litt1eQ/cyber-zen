import { useMeritStore } from '../../stores/useMeritStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { MonthlyHistoryCalendar } from './MonthlyHistoryCalendar'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card } from '../ui/card'
import { TrendPanel } from './TrendPanel'
import { AppInputRanking } from './AppInputRanking'
import { appInputCountsForDay, mergeAppInputCounts } from '@/lib/statisticsAggregates'
import { Button } from '@/components/ui/button'
import { InsightsPanel } from './InsightsPanel'
import { WeekdayDistribution } from './WeekdayDistribution'
import { addDaysToNaiveDateKey } from '@/lib/date'
import { InputSourceShare } from './InputSourceShare'
import { DailySourceBars } from './DailySourceBars'
import { HourlyWeekdayHeatmap } from './HourlyWeekdayHeatmap'
import { KeyDiversityBars } from './KeyDiversityBars'
import { ShortcutUsageTrend } from './ShortcutUsageTrend'
import { AppConcentration } from './AppConcentration'
import { ShiftUsage } from './ShiftUsage'
import { KeyPareto } from './KeyPareto'
import { MouseButtonStructure } from './MouseButtonStructure'
import { ClickPositionHeatmap } from './ClickPositionHeatmap'
import { MouseDistanceStatistics } from './MouseDistanceStatistics'

export function Statistics() {
  const { t } = useTranslation()
  const stats = useMeritStore((state) => state.stats)
  const settings = useSettingsStore((state) => state.settings)
  const heatLevelCount = useSettingsStore((state) => state.settings?.heatmap_levels)
  const keyboardLayoutId = useSettingsStore((state) => state.settings?.keyboard_layout)
  const allDays = stats ? [stats.today, ...stats.history] : []
  const trendDays = useMemo(() => allDays, [allDays])

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

  const anchorKey = selectedDayKey ?? stats?.today?.date ?? null

  const selectedDay = useMemo(() => {
    if (selectedDayKey) return byDateKey.get(selectedDayKey)
    return stats?.today
  }, [byDateKey, selectedDayKey, stats?.today])

  const appCountsDay = useMemo(() => appInputCountsForDay(selectedDay), [selectedDay])

  const [appRankingRange, setAppRankingRange] = useState<'day' | '7' | '30' | 'all'>('day')
  const appRankingRangeLabel = useMemo(() => {
    if (appRankingRange === 'day') {
      return anchorKey ? t('statistics.range.dayWithDate', { date: anchorKey }) : t('statistics.range.day')
    }
    if (appRankingRange === '7') {
      return anchorKey
        ? t('statistics.range.lastDaysWithEnd', { days: 7, date: anchorKey })
        : t('statistics.range.lastDays', { days: 7 })
    }
    if (appRankingRange === '30') {
      return anchorKey
        ? t('statistics.range.lastDaysWithEnd', { days: 30, date: anchorKey })
        : t('statistics.range.lastDays', { days: 30 })
    }
    return t('customStatistics.mode.cumulative')
  }, [anchorKey, appRankingRange, t])

  const appRankingCounts = useMemo(() => {
    if (!anchorKey) return {}
    if (appRankingRange === 'day') return appCountsDay
    if (appRankingRange === 'all') return mergeAppInputCounts(allDays)

    const daysWindow = appRankingRange === '7' ? 7 : 30
    const out: Array<(typeof allDays)[number]> = []
    for (let i = 0; i < daysWindow; i++) {
      const key = addDaysToNaiveDateKey(anchorKey, -i)
      if (!key) break
      const day = byDateKey.get(key)
      if (day) out.push(day)
    }
    return mergeAppInputCounts(out)
  }, [allDays, anchorKey, appCountsDay, appRankingRange, byDateKey])

  return (
    <div className="space-y-2">
      <h3 className="text-slate-600 text-sm mb-2">{t('statistics.title')}</h3>
      {stats ? (
        <div className="space-y-4">
          <Card className="p-4">
            <InsightsPanel days={allDays} endKey={anchorKey ?? stats.today.date} />
          </Card>

          <Card className="p-4">
            <WeekdayDistribution days={allDays} endKey={anchorKey ?? stats.today.date} defaultRangeDays={30} />
          </Card>

          <Card className="p-4">
            <HourlyWeekdayHeatmap
              days={allDays}
              endKey={anchorKey ?? stats.today.date}
              heatLevelCount={heatLevelCount}
              defaultRangeDays={30}
            />
          </Card>

          <Card className="p-4">
            <InputSourceShare days={allDays} endKey={anchorKey ?? stats.today.date} defaultRange="30" />
          </Card>

          <Card className="p-4">
            <TrendPanel days={trendDays} defaultRange={7} />
          </Card>

          {settings ? (
            <MouseDistanceStatistics
              allDays={allDays}
              anchorKey={anchorKey ?? stats.today.date}
              selectedDay={selectedDay}
              settings={settings}
            />
          ) : null}

          <Card className="p-4">
            <DailySourceBars days={allDays} endKey={anchorKey ?? stats.today.date} defaultRangeDays={30} />
          </Card>

          <Card className="p-4">
            <ShortcutUsageTrend days={allDays} endKey={anchorKey ?? stats.today.date} defaultRangeDays={30} />
          </Card>

          <Card className="p-4">
            <KeyDiversityBars days={allDays} endKey={anchorKey ?? stats.today.date} defaultRangeDays={30} />
          </Card>

          <Card className="p-4">
            <ShiftUsage days={allDays} endKey={anchorKey ?? stats.today.date} defaultRange="30" />
          </Card>

          <Card className="p-4">
            <KeyPareto days={allDays} endKey={anchorKey ?? stats.today.date} keyboardLayoutId={keyboardLayoutId} defaultRange="30" />
          </Card>

          <Card className="p-4">
            <MouseButtonStructure days={allDays} endKey={anchorKey ?? stats.today.date} defaultRange="30" />
          </Card>

          {settings ? <ClickPositionHeatmap settings={settings} /> : null}

          <Card className="p-4">
            <AppConcentration days={allDays} endKey={anchorKey ?? stats.today.date} defaultRange="30" />
          </Card>

          <Card className="p-4">
            <AppInputRanking
              counts={appRankingCounts}
              limit={20}
              title={t('customStatistics.widgets.app_ranking_total.title')}
              interactive
              headerRight={
                <div className="flex items-center gap-2" data-no-drag>
                  <div className="text-[11px] text-slate-500 tabular-nums">{appRankingRangeLabel}</div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant={appRankingRange === 'day' ? 'secondary' : 'outline'}
                      size="sm"
                      onClick={() => setAppRankingRange('day')}
                      data-no-drag
                    >
                      {t('statistics.range.day')}
                    </Button>
                    <Button
                      type="button"
                      variant={appRankingRange === '7' ? 'secondary' : 'outline'}
                      size="sm"
                      onClick={() => setAppRankingRange('7')}
                      data-no-drag
                    >
                      {t('statistics.range.days', { days: 7 })}
                    </Button>
                    <Button
                      type="button"
                      variant={appRankingRange === '30' ? 'secondary' : 'outline'}
                      size="sm"
                      onClick={() => setAppRankingRange('30')}
                      data-no-drag
                    >
                      {t('statistics.range.days', { days: 30 })}
                    </Button>
                    <Button
                      type="button"
                      variant={appRankingRange === 'all' ? 'secondary' : 'outline'}
                      size="sm"
                      onClick={() => setAppRankingRange('all')}
                      data-no-drag
                    >
                      {t('customStatistics.mode.cumulative')}
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
          {t('common.loading')}
        </div>
      )}
    </div>
  )
}
