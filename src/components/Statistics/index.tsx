import { useMeritStore } from '../../stores/useMeritStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useMeritDaysStore } from '@/stores/useMeritDaysStore'
import { MonthlyHistoryCalendar } from './MonthlyHistoryCalendar'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Card } from '../ui/card'
import { TrendPanel } from './TrendPanel'
import { AppInputRanking } from './AppInputRanking'
import { appInputCountsForDay, mergeAppInputCounts, mergeAppInputCountsMaps } from '@/lib/statisticsAggregates'
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
import { PeriodSummaryPanel } from './PeriodSummaryPanel'
import { historyAggregatesCacheKey, useHistoryAggregatesStore } from '@/stores/useHistoryAggregatesStore'
import { isLinux, isMac, isWindows } from '@/utils/platform'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DEFAULT_STATISTICS_BLOCKS, normalizeStatisticsBlocks, type StatisticsBlockId } from './registry'

function platformForKeyboard(): 'mac' | 'windows' | 'linux' {
  if (isMac()) return 'mac'
  if (isWindows()) return 'windows'
  if (isLinux()) return 'linux'
  return 'windows'
}

function StatisticsBlockShell({
  id,
  title,
  collapsed,
  index,
  total,
  onMove,
  onToggleCollapsed,
  children,
}: {
  id: StatisticsBlockId
  title: string
  collapsed: boolean
  index: number
  total: number
  onMove: (from: number, to: number) => Promise<void>
  onToggleCollapsed: (id: StatisticsBlockId) => Promise<void>
  children: ReactNode
}) {
  const { t } = useTranslation()
  const canMoveUp = index > 0
  const canMoveDown = index < total - 1

  return (
    <div className="relative group">
      <div
        className={cn(
          'absolute -top-3 -right-3 z-10 flex items-center gap-1 rounded-lg border border-slate-200/60 bg-white/80 backdrop-blur px-1 py-1 shadow-sm',
          'opacity-0 pointer-events-none group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity',
        )}
        data-no-drag
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 px-0 pointer-events-auto"
          disabled={!canMoveUp}
          onClick={() => void onMove(index, index - 1)}
          title={t('statistics.layout.moveUp')}
          aria-label={t('statistics.layout.moveUp')}
          data-no-drag
        >
          <ArrowUp className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 px-0 pointer-events-auto"
          disabled={!canMoveDown}
          onClick={() => void onMove(index, index + 1)}
          title={t('statistics.layout.moveDown')}
          aria-label={t('statistics.layout.moveDown')}
          data-no-drag
        >
          <ArrowDown className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 px-0 pointer-events-auto"
          onClick={() => void onToggleCollapsed(id)}
          title={collapsed ? t('statistics.layout.expand') : t('statistics.layout.collapse')}
          aria-label={collapsed ? t('statistics.layout.expand') : t('statistics.layout.collapse')}
          data-no-drag
        >
          {collapsed ? <ChevronRight className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
        </Button>
      </div>

      {collapsed ? (
        <Card className="p-4 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => void onToggleCollapsed(id)} data-no-drag>
          <div className="text-sm font-semibold text-slate-900 tracking-wide">{title}</div>
          <div className="mt-1 text-xs text-slate-500">{t('statistics.layout.collapsed')}</div>
        </Card>
      ) : (
        children
      )}
    </div>
  )
}

export function Statistics() {
  const { t } = useTranslation()
  const stats = useMeritStore((state) => state.stats)
  const settings = useSettingsStore((state) => state.settings)
  const updateSettings = useSettingsStore((state) => state.updateSettings)
  const heatLevelCount = useSettingsStore((state) => state.settings?.heatmap_levels)
  const keyboardLayoutId = useSettingsStore((state) => state.settings?.keyboard_layout)
  const { today: todayFull, history: historyDays, fetchRecentDays, refreshTodayFull } = useMeritDaysStore()

  useEffect(() => {
    fetchRecentDays(400)
  }, [fetchRecentDays])

  useEffect(() => {
    if (!todayFull) return
    const id = window.setInterval(() => {
      void refreshTodayFull()
    }, 2500)
    return () => window.clearInterval(id)
  }, [refreshTodayFull, todayFull?.date])

  const todayMerged = useMemo(() => {
    if (!todayFull) return null
    const lite = stats?.today
    if (!lite || lite.date !== todayFull.date) return todayFull
    return {
      ...todayFull,
      total: lite.total ?? todayFull.total,
      keyboard: lite.keyboard ?? todayFull.keyboard,
      mouse_single: lite.mouse_single ?? todayFull.mouse_single,
      first_event_at_ms: lite.first_event_at_ms ?? todayFull.first_event_at_ms,
      last_event_at_ms: lite.last_event_at_ms ?? todayFull.last_event_at_ms,
      mouse_move_distance_px: lite.mouse_move_distance_px ?? todayFull.mouse_move_distance_px,
      mouse_move_distance_px_by_display: lite.mouse_move_distance_px_by_display ?? todayFull.mouse_move_distance_px_by_display,
      hourly: lite.hourly ?? todayFull.hourly,
    }
  }, [stats?.today, todayFull])

  const allDays = useMemo(
    () => (todayMerged ? [todayMerged, ...historyDays] : todayFull ? [todayFull, ...historyDays] : historyDays),
    [historyDays, todayFull, todayMerged],
  )
  const trendDays = useMemo(() => allDays, [allDays])

  const blocks = useMemo(() => normalizeStatisticsBlocks(settings?.statistics_blocks), [settings?.statistics_blocks])

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

  const appRankingAggregatesQueryKey = useMemo(() => historyAggregatesCacheKey({ endKey: anchorKey ?? null }), [anchorKey])
  const appRankingAggregates = useHistoryAggregatesStore((s) => s.cache[appRankingAggregatesQueryKey] ?? null)
  const fetchAppRankingAggregates = useHistoryAggregatesStore((s) => s.fetchAggregates)

  useEffect(() => {
    if (!anchorKey) return
    if (appRankingRange !== 'all') return
    void fetchAppRankingAggregates({ endKey: anchorKey })
  }, [anchorKey, appRankingRange, fetchAppRankingAggregates])

  const selectedDay = useMemo(() => {
    if (selectedDayKey) return byDateKey.get(selectedDayKey)
    return todayMerged ?? todayFull ?? undefined
  }, [byDateKey, selectedDayKey, todayFull, todayMerged])

  const appCountsDay = useMemo(() => appInputCountsForDay(selectedDay), [selectedDay])

  const appRankingCounts = useMemo(() => {
    if (!anchorKey) return {}
    if (appRankingRange === 'day') return appCountsDay
    if (appRankingRange === 'all') {
      const todayKey = stats?.today?.date
      const base = appRankingAggregates?.appInputCounts ?? {}
      if (todayKey && anchorKey === todayKey) {
        return mergeAppInputCountsMaps(base, appCountsDay)
      }
      return base
    }

    const daysWindow = appRankingRange === '7' ? 7 : 30
    const out: Array<(typeof allDays)[number]> = []
    for (let i = 0; i < daysWindow; i++) {
      const key = addDaysToNaiveDateKey(anchorKey, -i)
      if (!key) break
      const day = byDateKey.get(key)
      if (day) out.push(day)
    }
    return mergeAppInputCounts(out)
  }, [anchorKey, appCountsDay, appRankingAggregates?.appInputCounts, appRankingRange, byDateKey, stats?.today?.date])

  const setBlocks = useCallback(
    async (next: ReturnType<typeof normalizeStatisticsBlocks>) => {
      await updateSettings({ statistics_blocks: next })
    },
    [updateSettings],
  )

  const toggleCollapsed = useCallback(
    async (id: StatisticsBlockId) => {
      const next = blocks.map((b) => (b.id === id ? { ...b, collapsed: !b.collapsed } : b))
      await setBlocks(next)
    },
    [blocks, setBlocks],
  )

  const move = useCallback(
    async (from: number, to: number) => {
      if (from === to) return
      if (from < 0 || from >= blocks.length) return
      if (to < 0 || to >= blocks.length) return
      const next = [...blocks]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item!)
      await setBlocks(next)
    },
    [blocks, setBlocks],
  )

  const resetLayout = useCallback(async () => {
    await setBlocks(DEFAULT_STATISTICS_BLOCKS.map((b) => ({ ...b, collapsed: false })))
  }, [setBlocks])

  const allCollapsed = useMemo(() => blocks.length > 0 && blocks.every((b) => !!b.collapsed), [blocks])
  const allExpanded = useMemo(() => blocks.length > 0 && blocks.every((b) => !b.collapsed), [blocks])

  const collapseAll = useCallback(async () => {
    if (allCollapsed) return
    await setBlocks(blocks.map((b) => ({ ...b, collapsed: true })))
  }, [allCollapsed, blocks, setBlocks])

  const expandAll = useCallback(async () => {
    if (allExpanded) return
    await setBlocks(blocks.map((b) => ({ ...b, collapsed: false })))
  }, [allExpanded, blocks, setBlocks])

  const renderBlock = useCallback(
    (id: StatisticsBlockId) => {
      if (!stats) return null
      switch (id) {
        case 'period_summary':
          return (
            <PeriodSummaryPanel
              allDays={allDays}
              todayKey={stats.today.date}
              heatLevelCount={heatLevelCount}
              layoutId={keyboardLayoutId}
              platform={platformForKeyboard()}
            />
          )
        case 'insights':
          return (
            <Card className="p-4">
              <InsightsPanel days={allDays} endKey={anchorKey ?? stats.today.date} />
            </Card>
          )
        case 'weekday_distribution':
          return (
            <Card className="p-4">
              <WeekdayDistribution days={allDays} endKey={anchorKey ?? stats.today.date} defaultRangeDays={30} />
            </Card>
          )
        case 'hourly_weekday_heatmap':
          return (
            <Card className="p-4">
              <HourlyWeekdayHeatmap
                days={allDays}
                endKey={anchorKey ?? stats.today.date}
                heatLevelCount={heatLevelCount}
                defaultRangeDays={30}
              />
            </Card>
          )
        case 'input_source_share':
          return (
            <Card className="p-4">
              <InputSourceShare days={allDays} endKey={anchorKey ?? stats.today.date} defaultRange="30" />
            </Card>
          )
        case 'trend':
          return (
            <Card className="p-4">
              <TrendPanel days={trendDays} defaultRange={7} />
            </Card>
          )
        case 'mouse_distance':
          return settings ? (
            <MouseDistanceStatistics
              allDays={allDays}
              anchorKey={anchorKey ?? stats.today.date}
              selectedDay={selectedDay}
              settings={settings}
            />
          ) : (
            <Card className="p-4 text-slate-500">{t('common.loading')}</Card>
          )
        case 'daily_source_bars':
          return (
            <Card className="p-4">
              <DailySourceBars days={allDays} endKey={anchorKey ?? stats.today.date} defaultRangeDays={30} />
            </Card>
          )
        case 'shortcut_usage_trend':
          return (
            <Card className="p-4">
              <ShortcutUsageTrend days={allDays} endKey={anchorKey ?? stats.today.date} defaultRangeDays={30} />
            </Card>
          )
        case 'key_diversity_bars':
          return (
            <Card className="p-4">
              <KeyDiversityBars days={allDays} endKey={anchorKey ?? stats.today.date} defaultRangeDays={30} />
            </Card>
          )
        case 'shift_usage':
          return (
            <Card className="p-4">
              <ShiftUsage days={allDays} endKey={anchorKey ?? stats.today.date} defaultRange="30" />
            </Card>
          )
        case 'key_pareto':
          return (
            <Card className="p-4">
              <KeyPareto
                days={allDays}
                endKey={anchorKey ?? stats.today.date}
                keyboardLayoutId={keyboardLayoutId}
                defaultRange="30"
              />
            </Card>
          )
        case 'mouse_button_structure':
          return (
            <Card className="p-4">
              <MouseButtonStructure days={allDays} endKey={anchorKey ?? stats.today.date} defaultRange="30" />
            </Card>
          )
        case 'click_position_heatmap':
          return settings ? (
            <ClickPositionHeatmap settings={settings} todayKey={stats.today.date} />
          ) : (
            <Card className="p-4 text-slate-500">{t('common.loading')}</Card>
          )
        case 'app_concentration':
          return (
            <Card className="p-4">
              <AppConcentration days={allDays} endKey={anchorKey ?? stats.today.date} defaultRange="30" />
            </Card>
          )
        case 'app_input_ranking':
          return (
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
          )
        case 'monthly_calendar':
          return (
            <MonthlyHistoryCalendar
              days={allDays}
              todayKey={stats.today.date}
              heatLevelCount={heatLevelCount}
              keyboardLayoutId={keyboardLayoutId}
              onSelectedKeyChange={setSelectedDayKey}
            />
          )
        default:
          return null
      }
    },
    [
      allDays,
      anchorKey,
      appRankingCounts,
      appRankingRange,
      appRankingRangeLabel,
      heatLevelCount,
      keyboardLayoutId,
      selectedDay,
      settings,
      stats,
      t,
      trendDays,
    ],
  )

  const titleKeyForBlock = useCallback(
    (id: StatisticsBlockId) => {
      switch (id) {
        case 'period_summary':
          return 'statistics.periodSummary.title'
        case 'insights':
          return 'statistics.insights.title'
        case 'weekday_distribution':
          return 'customStatistics.widgets.weekday_distribution.title'
        case 'hourly_weekday_heatmap':
          return 'customStatistics.widgets.hourly_weekday_heatmap.title'
        case 'input_source_share':
          return 'customStatistics.widgets.source_share.title'
        case 'trend':
          return 'customStatistics.widgets.trend.title'
        case 'mouse_distance':
          return 'statistics.mouseDistance.title'
        case 'daily_source_bars':
          return 'customStatistics.widgets.daily_source_bars.title'
        case 'shortcut_usage_trend':
          return 'customStatistics.widgets.shortcut_trend.title'
        case 'key_diversity_bars':
          return 'customStatistics.widgets.key_diversity.title'
        case 'shift_usage':
          return 'customStatistics.widgets.shift_usage.title'
        case 'key_pareto':
          return 'customStatistics.widgets.key_pareto.title'
        case 'mouse_button_structure':
          return 'customStatistics.widgets.mouse_button_structure.title'
        case 'click_position_heatmap':
          return 'statistics.clickHeatmap.title'
        case 'app_concentration':
          return 'customStatistics.widgets.app_concentration.title'
        case 'app_input_ranking':
          return 'customStatistics.widgets.app_ranking_total.title'
        case 'monthly_calendar':
          return 'customStatistics.widgets.calendar.title'
        default:
          return 'statistics.title'
      }
    },
    [],
  )

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-slate-600 text-sm">{t('statistics.title')}</h3>
        <div className="flex items-center gap-2" data-no-drag>
          <Button type="button" size="sm" variant="outline" disabled={allCollapsed} onClick={() => void collapseAll()} data-no-drag>
            {t('statistics.layout.collapseAll')}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={allExpanded} onClick={() => void expandAll()} data-no-drag>
            {t('statistics.layout.expandAll')}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void resetLayout()} data-no-drag>
            {t('statistics.layout.reset')}
          </Button>
        </div>
      </div>
      {stats ? (
        <div className="space-y-4">
          {blocks.map((b, idx) => (
            <StatisticsBlockShell
              key={b.id}
              id={b.id}
              title={t(titleKeyForBlock(b.id))}
              collapsed={!!b.collapsed}
              index={idx}
              total={blocks.length}
              onMove={move}
              onToggleCollapsed={toggleCollapsed}
            >
              {renderBlock(b.id)}
            </StatisticsBlockShell>
          ))}
        </div>
      ) : (
        <div className="rounded-xl p-5 border border-slate-200 bg-white shadow-sm text-slate-500">
          {t('common.loading')}
        </div>
      )}
    </div>
  )
}
