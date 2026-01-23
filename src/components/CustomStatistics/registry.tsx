import type { ReactNode } from 'react'
import type { Settings, MeritStats } from '@/types/merit'
import { Card } from '@/components/ui/card'
import { TrendPanel } from '@/components/Statistics/TrendPanel'
import { MouseDistancePanel } from '@/components/Statistics/MouseDistancePanel'
import { MonthlyHistoryCalendar } from '@/components/Statistics/MonthlyHistoryCalendar'
import { KeyboardHeatmap } from '@/components/Statistics/KeyboardHeatmap'
import { MouseButtonsHeatmap } from '@/components/Statistics/MouseButtonsHeatmap'
import { KeyRanking } from '@/components/Statistics/KeyRanking'
import { ShortcutList } from '@/components/Statistics/ShortcutList'
import { HourlyDistribution } from '@/components/Statistics/HourlyDistribution'
import { AppInputRanking } from '@/components/Statistics/AppInputRanking'
import { InsightsPanel } from '@/components/Statistics/InsightsPanel'
import { WeekdayDistribution } from '@/components/Statistics/WeekdayDistribution'
import { InputSourceShare } from '@/components/Statistics/InputSourceShare'
import { DailySourceBars } from '@/components/Statistics/DailySourceBars'
import { HourlyWeekdayHeatmap } from '@/components/Statistics/HourlyWeekdayHeatmap'
import { KeyDiversityBars } from '@/components/Statistics/KeyDiversityBars'
import { ShortcutUsageTrend } from '@/components/Statistics/ShortcutUsageTrend'
import { AppConcentration } from '@/components/Statistics/AppConcentration'
import { ShiftUsage } from '@/components/Statistics/ShiftUsage'
import { KeyPareto } from '@/components/Statistics/KeyPareto'
import { MouseButtonStructure } from '@/components/Statistics/MouseButtonStructure'
import { ClickPositionHeatmap } from '@/components/Statistics/ClickPositionHeatmap'
import { isLinux, isMac, isWindows } from '@/utils/platform'
import type { StatisticsAggregates } from '@/lib/statisticsAggregates'
import i18n from '@/i18n'

export type BuiltinCustomStatisticsWidgetId =
  | 'insights'
  | 'trend'
  | 'mouse_distance'
  | 'weekday_distribution'
  | 'source_share'
  | 'daily_source_bars'
  | 'hourly_weekday_heatmap'
  | 'key_diversity'
  | 'shortcut_trend'
  | 'app_concentration'
  | 'shift_usage'
  | 'key_pareto'
  | 'mouse_button_structure'
  | 'click_heatmap'
  | 'calendar'
  | 'keyboard_heatmap_total'
  | 'key_ranking_total'
  | 'mouse_buttons_total'
  | 'shortcut_list_total'
  | 'hourly_total'
  | 'app_ranking_total'

export type CustomStatisticsWidgetId = BuiltinCustomStatisticsWidgetId | `custom:${string}`

export const DEFAULT_CUSTOM_STATISTICS_WIDGETS: BuiltinCustomStatisticsWidgetId[] = ['trend', 'calendar']

export type WidgetRenderContext = {
  stats: MeritStats
  settings: Settings
  allDays: MeritStats['history'][number][]
  aggregates: StatisticsAggregates
}

type WidgetDefinition = {
  id: BuiltinCustomStatisticsWidgetId
  titleKey: string
  descriptionKey?: string
  render: (ctx: WidgetRenderContext) => ReactNode
}

function platformForKeyboard() {
  if (isMac()) return 'mac'
  if (isWindows()) return 'windows'
  if (isLinux()) return 'linux'
  return 'windows'
}

export const CUSTOM_STATISTICS_WIDGETS: WidgetDefinition[] = [
  {
    id: 'insights',
    titleKey: 'customStatistics.widgets.insights.title',
    descriptionKey: 'customStatistics.widgets.insights.description',
    render: ({ stats, settings, allDays }) => (
      <Card className="p-4">
        <InsightsPanel
          days={settings.custom_statistics_range === 'all' ? allDays : [stats.today]}
          endKey={stats.today.date}
        />
      </Card>
    ),
  },
  {
    id: 'trend',
    titleKey: 'customStatistics.widgets.trend.title',
    descriptionKey: 'customStatistics.widgets.trend.description',
    render: ({ allDays }) => (
      <Card className="p-4">
        <TrendPanel days={allDays} />
      </Card>
    ),
  },
  {
    id: 'mouse_distance',
    titleKey: 'customStatistics.widgets.mouse_distance.title',
    descriptionKey: 'customStatistics.widgets.mouse_distance.description',
    render: ({ stats, settings, allDays }) => (
      <Card className="p-4">
        <MouseDistancePanel
          days={settings.custom_statistics_range === 'all' ? allDays : [stats.today]}
          settings={settings}
        />
      </Card>
    ),
  },
  {
    id: 'weekday_distribution',
    titleKey: 'customStatistics.widgets.weekday_distribution.title',
    descriptionKey: 'customStatistics.widgets.weekday_distribution.description',
    render: ({ stats, settings, allDays }) => (
      <Card className="p-4">
        <WeekdayDistribution
          days={settings.custom_statistics_range === 'all' ? allDays : [stats.today]}
          endKey={stats.today.date}
          defaultRangeDays={30}
        />
      </Card>
    ),
  },
  {
    id: 'source_share',
    titleKey: 'customStatistics.widgets.source_share.title',
    descriptionKey: 'customStatistics.widgets.source_share.description',
    render: ({ stats, settings, allDays }) => (
      <Card className="p-4">
        <InputSourceShare days={settings.custom_statistics_range === 'all' ? allDays : [stats.today]} endKey={stats.today.date} defaultRange="30" />
      </Card>
    ),
  },
  {
    id: 'daily_source_bars',
    titleKey: 'customStatistics.widgets.daily_source_bars.title',
    descriptionKey: 'customStatistics.widgets.daily_source_bars.description',
    render: ({ stats, settings, allDays }) => (
      <Card className="p-4">
        <DailySourceBars days={settings.custom_statistics_range === 'all' ? allDays : [stats.today]} endKey={stats.today.date} defaultRangeDays={30} />
      </Card>
    ),
  },
  {
    id: 'hourly_weekday_heatmap',
    titleKey: 'customStatistics.widgets.hourly_weekday_heatmap.title',
    descriptionKey: 'customStatistics.widgets.hourly_weekday_heatmap.description',
    render: ({ stats, settings, allDays }) => (
      <Card className="p-4">
        <HourlyWeekdayHeatmap
          days={settings.custom_statistics_range === 'all' ? allDays : [stats.today]}
          endKey={stats.today.date}
          heatLevelCount={settings.heatmap_levels}
          defaultRangeDays={30}
        />
      </Card>
    ),
  },
  {
    id: 'key_diversity',
    titleKey: 'customStatistics.widgets.key_diversity.title',
    descriptionKey: 'customStatistics.widgets.key_diversity.description',
    render: ({ stats, settings, allDays }) => (
      <Card className="p-4">
        <KeyDiversityBars days={settings.custom_statistics_range === 'all' ? allDays : [stats.today]} endKey={stats.today.date} defaultRangeDays={30} />
      </Card>
    ),
  },
  {
    id: 'shortcut_trend',
    titleKey: 'customStatistics.widgets.shortcut_trend.title',
    descriptionKey: 'customStatistics.widgets.shortcut_trend.description',
    render: ({ stats, allDays }) => (
      <Card className="p-4">
        <ShortcutUsageTrend days={allDays} endKey={stats.today.date} defaultRangeDays={30} />
      </Card>
    ),
  },
  {
    id: 'app_concentration',
    titleKey: 'customStatistics.widgets.app_concentration.title',
    descriptionKey: 'customStatistics.widgets.app_concentration.description',
    render: ({ stats, settings, allDays }) => (
      <Card className="p-4">
        <AppConcentration
          days={settings.custom_statistics_range === 'all' ? allDays : [stats.today]}
          endKey={stats.today.date}
          defaultRange={settings.custom_statistics_range === 'all' ? '30' : 'day'}
        />
      </Card>
    ),
  },
  {
    id: 'shift_usage',
    titleKey: 'customStatistics.widgets.shift_usage.title',
    descriptionKey: 'customStatistics.widgets.shift_usage.description',
    render: ({ stats, settings, allDays }) => (
      <Card className="p-4">
        <ShiftUsage
          days={settings.custom_statistics_range === 'all' ? allDays : [stats.today]}
          endKey={stats.today.date}
          defaultRange={settings.custom_statistics_range === 'all' ? '30' : 'day'}
        />
      </Card>
    ),
  },
  {
    id: 'key_pareto',
    titleKey: 'customStatistics.widgets.key_pareto.title',
    descriptionKey: 'customStatistics.widgets.key_pareto.description',
    render: ({ stats, settings, allDays }) => (
      <Card className="p-4">
        <KeyPareto
          days={settings.custom_statistics_range === 'all' ? allDays : [stats.today]}
          endKey={stats.today.date}
          keyboardLayoutId={settings.keyboard_layout}
          defaultRange={settings.custom_statistics_range === 'all' ? '30' : 'day'}
        />
      </Card>
    ),
  },
  {
    id: 'mouse_button_structure',
    titleKey: 'customStatistics.widgets.mouse_button_structure.title',
    descriptionKey: 'customStatistics.widgets.mouse_button_structure.description',
    render: ({ stats, settings, allDays }) => (
      <Card className="p-4">
        <MouseButtonStructure
          days={settings.custom_statistics_range === 'all' ? allDays : [stats.today]}
          endKey={stats.today.date}
          defaultRange={settings.custom_statistics_range === 'all' ? '30' : 'day'}
        />
      </Card>
    ),
  },
  {
    id: 'click_heatmap',
    titleKey: 'customStatistics.widgets.click_heatmap.title',
    descriptionKey: 'customStatistics.widgets.click_heatmap.description',
    render: ({ stats, settings }) => (
      <ClickPositionHeatmap
        settings={settings}
        todayKey={stats.today.date}
        defaultMode={settings.custom_statistics_range === 'all' ? 'total' : 'day'}
      />
    ),
  },
  {
    id: 'calendar',
    titleKey: 'customStatistics.widgets.calendar.title',
    descriptionKey: 'customStatistics.widgets.calendar.description',
    render: ({ stats, settings, allDays }) => (
      <MonthlyHistoryCalendar
        days={allDays}
        todayKey={stats.today.date}
        heatLevelCount={settings.heatmap_levels}
        keyboardLayoutId={settings.keyboard_layout}
      />
    ),
  },
  {
    id: 'keyboard_heatmap_total',
    titleKey: 'customStatistics.widgets.keyboard_heatmap_total.title',
    descriptionKey: 'customStatistics.widgets.keyboard_heatmap_total.description',
    render: ({ settings, aggregates }) => (
      <Card className="p-4">
        <KeyboardHeatmap
          unshiftedCounts={aggregates.keyCountsUnshifted}
          shiftedCounts={aggregates.keyCountsShifted}
          heatLevelCount={settings.heatmap_levels}
          layoutId={settings.keyboard_layout}
        />
      </Card>
    ),
  },
  {
    id: 'key_ranking_total',
    titleKey: 'customStatistics.widgets.key_ranking_total.title',
    descriptionKey: 'customStatistics.widgets.key_ranking_total.description',
    render: ({ settings, aggregates }) => (
      <Card className="p-4">
        <KeyRanking
          counts={aggregates.keyCountsAll}
          platform={platformForKeyboard()}
          keyboardLayoutId={settings.keyboard_layout}
        />
      </Card>
    ),
  },
  {
    id: 'mouse_buttons_total',
    titleKey: 'customStatistics.widgets.mouse_buttons_total.title',
    descriptionKey: 'customStatistics.widgets.mouse_buttons_total.description',
    render: ({ settings, aggregates }) => (
      <Card className="p-4">
        <MouseButtonsHeatmap
          counts={aggregates.mouseButtonCounts}
          heatLevelCount={settings.heatmap_levels}
        />
      </Card>
    ),
  },
  {
    id: 'shortcut_list_total',
    titleKey: 'customStatistics.widgets.shortcut_list_total.title',
    descriptionKey: 'customStatistics.widgets.shortcut_list_total.description',
    render: ({ aggregates }) => (
      <Card className="p-4">
        <ShortcutList counts={aggregates.shortcutCounts} modeLabel={i18n.t('customStatistics.mode.cumulative') as string} />
      </Card>
    ),
  },
  {
    id: 'hourly_total',
    titleKey: 'customStatistics.widgets.hourly_total.title',
    descriptionKey: 'customStatistics.widgets.hourly_total.description',
    render: ({ aggregates }) => (
      <Card className="p-4">
        <HourlyDistribution hourly={aggregates.hourly} />
      </Card>
    ),
  },
  {
    id: 'app_ranking_total',
    titleKey: 'customStatistics.widgets.app_ranking_total.title',
    descriptionKey: 'customStatistics.widgets.app_ranking_total.description',
    render: ({ settings, aggregates }) => (
      <Card className="p-4">
        <AppInputRanking
          counts={aggregates.appInputCounts}
          limit={20}
          modeLabel={
            i18n.t(
              settings.custom_statistics_range === 'all'
                ? 'customStatistics.mode.cumulative'
                : 'customStatistics.mode.daily',
            ) as string
          }
        />
      </Card>
    ),
  },
]

export function widgetTitle(id: string): string {
  const widget = CUSTOM_STATISTICS_WIDGETS.find((w) => w.id === id)
  if (!widget) return id
  return i18n.t(widget.titleKey) as string
}

export function isBuiltinWidgetId(id: string): id is BuiltinCustomStatisticsWidgetId {
  return CUSTOM_STATISTICS_WIDGETS.some((w) => w.id === id)
}

export function isCustomTemplateWidgetId(id: string): id is `custom:${string}` {
  return id.startsWith('custom:') && id.length > 'custom:'.length
}

export function customTemplateIdFromWidgetId(id: `custom:${string}`): string {
  return id.slice('custom:'.length)
}
