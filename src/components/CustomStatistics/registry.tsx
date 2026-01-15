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
import { isLinux, isMac, isWindows } from '@/utils/platform'
import type { StatisticsAggregates } from './aggregates'

export type CustomStatisticsWidgetId =
  | 'trend'
  | 'calendar'
  | 'keyboard_heatmap_total'
  | 'key_ranking_total'
  | 'mouse_buttons_total'
  | 'shortcut_list_total'
  | 'hourly_total'

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
]

export function widgetTitle(id: string): string {
  return CUSTOM_STATISTICS_WIDGETS.find((w) => w.id === id)?.title ?? id
}

export function isKnownWidgetId(id: string): id is CustomStatisticsWidgetId {
  return CUSTOM_STATISTICS_WIDGETS.some((w) => w.id === id)
}
