import type { ReactNode } from 'react'
import type { Settings, MeritStats } from '@/types/merit'
import { Card } from '@/components/ui/card'
import { TrendPanel } from '@/components/Statistics/TrendPanel'
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
import { isLinux, isMac, isWindows } from '@/utils/platform'
import type { StatisticsAggregates } from '@/lib/statisticsAggregates'

export type CustomStatisticsWidgetId =
  | 'insights'
  | 'trend'
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
  | 'calendar'
  | 'keyboard_heatmap_total'
  | 'key_ranking_total'
  | 'mouse_buttons_total'
  | 'shortcut_list_total'
  | 'hourly_total'
  | 'app_ranking_total'

export const DEFAULT_CUSTOM_STATISTICS_WIDGETS: CustomStatisticsWidgetId[] = ['trend', 'calendar']

export type WidgetRenderContext = {
  stats: MeritStats
  settings: Settings
  allDays: MeritStats['history'][number][]
  aggregates: StatisticsAggregates
}

type WidgetDefinition = {
  id: CustomStatisticsWidgetId
  title: string
  description?: string
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
    title: '统计摘要',
    description: '连续/本周本月/环比/高峰',
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
    title: '7/30 天趋势',
    description: '总计/键盘/单击',
    render: ({ allDays }) => (
      <Card className="p-4">
        <TrendPanel days={allDays} />
      </Card>
    ),
  },
  {
    id: 'weekday_distribution',
    title: '周几分布',
    description: '平均/天 · 7/30/1年',
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
    title: '输入来源占比',
    description: '键盘 vs 单击 · 当日/7天/30天/累计',
    render: ({ stats, settings, allDays }) => (
      <Card className="p-4">
        <InputSourceShare days={settings.custom_statistics_range === 'all' ? allDays : [stats.today]} endKey={stats.today.date} defaultRange="30" />
      </Card>
    ),
  },
  {
    id: 'daily_source_bars',
    title: '按天堆叠（键盘/单击）',
    description: '7/30 天 · 直观看构成与峰值',
    render: ({ stats, settings, allDays }) => (
      <Card className="p-4">
        <DailySourceBars days={settings.custom_statistics_range === 'all' ? allDays : [stats.today]} endKey={stats.today.date} defaultRangeDays={30} />
      </Card>
    ),
  },
  {
    id: 'hourly_weekday_heatmap',
    title: '周几 × 小时热力',
    description: '平均/天（总计/键盘/单击）· 7/30/1年',
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
    title: '按键多样性',
    description: '每天不同按键数（>0）· 7/30 天',
    render: ({ stats, settings, allDays }) => (
      <Card className="p-4">
        <KeyDiversityBars days={settings.custom_statistics_range === 'all' ? allDays : [stats.today]} endKey={stats.today.date} defaultRangeDays={30} />
      </Card>
    ),
  },
  {
    id: 'shortcut_trend',
    title: '快捷键使用趋势',
    description: '按天快捷键次数 + Top 占比（7/30 天）',
    render: ({ stats, allDays }) => (
      <Card className="p-4">
        <ShortcutUsageTrend days={allDays} endKey={stats.today.date} defaultRangeDays={30} />
      </Card>
    ),
  },
  {
    id: 'app_concentration',
    title: '应用集中度',
    description: 'Top1/3/5 占比 + HHI',
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
    title: 'Shift 使用率',
    description: 'Shifted vs Unshifted（支持趋势）',
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
    title: '按键集中度（Pareto）',
    description: 'Top10 占比 + 长尾占比',
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
    title: '鼠标按键结构',
    description: '左/右/其他占比 + 趋势',
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
    id: 'calendar',
    title: '按天统计',
    description: '全部：月历热力（可点选日期） · 当天：今日概览',
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
    title: '键盘热力图',
    description: '当日/累计 · 区分 Shift',
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
    title: '按键排行（累计）',
    description: 'Top/Bottom 10（>0）',
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
    title: '鼠标按键热力图（累计）',
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
    title: '快捷键统计（累计）',
    render: ({ aggregates }) => (
      <Card className="p-4">
        <ShortcutList counts={aggregates.shortcutCounts} modeLabel="累计" />
      </Card>
    ),
  },
  {
    id: 'hourly_total',
    title: '小时分布（累计）',
    description: '仅新版本开始记录',
    render: ({ aggregates }) => (
      <Card className="p-4">
        <HourlyDistribution hourly={aggregates.hourly} />
      </Card>
    ),
  },
  {
    id: 'app_ranking_total',
    title: '应用输入排行',
    description: '按前台应用归因（Top 20）',
    render: ({ settings, aggregates }) => (
      <Card className="p-4">
        <AppInputRanking
          counts={aggregates.appInputCounts}
          limit={20}
          modeLabel={settings.custom_statistics_range === 'all' ? '累计' : '当日'}
        />
      </Card>
    ),
  },
]

export function widgetTitle(id: string): string {
  return CUSTOM_STATISTICS_WIDGETS.find((w) => w.id === id)?.title ?? id
}

export function isKnownWidgetId(id: string): id is CustomStatisticsWidgetId {
  return CUSTOM_STATISTICS_WIDGETS.some((w) => w.id === id)
}
