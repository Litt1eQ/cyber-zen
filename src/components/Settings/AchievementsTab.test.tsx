import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AchievementsTab } from './AchievementsTab'

const settingsState = {
  settings: {
    achievement_custom_names: { daily_108: '11111' },
  },
}

const achievementStoreState = {
  state: {
    unlock_history: [],
    unlock_index: [],
  },
  fetchState: vi.fn(),
  clearHistory: vi.fn(),
}

const meritDaysLiteState = {
  today: null,
  history: [],
  fetchRecentDaysLite: vi.fn(),
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, args?: Record<string, unknown>) => {
      if (key === 'settings.achievements.items.daily_108.title') return '一念一敲'
      if (key === 'settings.achievements.items.daily_108.description') return `今日累计功德达到 ${args?.target ?? ''}`.trim()
      if (key === 'settings.achievements.headerTitle') return '成就系统'
      if (key === 'settings.achievements.headerSubtitle') return 'headerSubtitle'
      if (key === 'settings.achievements.summary.today') return '今日'
      if (key === 'settings.achievements.summary.week') return '本周'
      if (key === 'settings.achievements.summary.month') return '本月'
      if (key === 'settings.achievements.summary.streak') return '连续'
      if (key === 'settings.achievements.summary.days') return '天'
      if (key === 'settings.achievements.cadence.daily') return '每日'
      if (key === 'settings.achievements.cadence.weekly') return '每周'
      if (key === 'settings.achievements.cadence.monthly') return '每月'
      if (key === 'settings.achievements.cadence.yearly') return '每年'
      if (key === 'settings.achievements.cadence.total') return '总计'
      if (key === 'settings.achievements.resetHint.daily') return '每日 0 点刷新'
      if (key === 'settings.achievements.state.completed') return '已完成'
      if (key === 'settings.achievements.state.inProgress') return '进行中'
      if (key === 'settings.achievements.history.title') return '解锁记录'
      if (key === 'settings.achievements.history.empty') return '暂无解锁记录'
      if (key === 'settings.achievements.history.clear') return '清空记录'
      if (key === 'settings.achievements.customNames.button') return '自定义名称'
      return key
    },
    i18n: { resolvedLanguage: 'zh-CN' },
  }),
}))

vi.mock('@/hooks/useAchievementsSync', () => ({
  useAchievementsSync: () => {},
}))

vi.mock('@/hooks/useDisplayMonitors', () => ({
  useDisplayMonitors: () => ({ monitors: [] }),
}))

vi.mock('@/stores/useSettingsStore', () => ({
  useSettingsStore: (selector: (state: typeof settingsState) => unknown) => selector(settingsState),
}))

vi.mock('@/stores/useAchievementStore', () => ({
  useAchievementStore: (selector: (state: typeof achievementStoreState) => unknown) => selector(achievementStoreState),
}))

vi.mock('@/stores/useMeritDaysLiteStore', () => ({
  useMeritDaysLiteStore: () => meritDaysLiteState,
}))

vi.mock('@/lib/achievements', () => ({
  ACHIEVEMENT_DEFINITIONS: [
    {
      id: 'daily_108',
      cadence: 'daily',
      icon: 'sparkles',
      titleKey: 'settings.achievements.items.daily_108.title',
      descriptionKey: 'settings.achievements.items.daily_108.description',
      titleArgs: { target: 108 },
      descriptionArgs: { target: 108 },
    },
  ],
  computeAchievementMetrics: () => ({}),
  computeAchievementSummary: () => ({
    todayTotal: 108,
    weekTotal: 108,
    monthTotal: 108,
    currentStreakDays: 1,
  }),
  computeAchievementsByCadence: () => ({
    daily: [
      {
        id: 'daily_108',
        cadence: 'daily',
        icon: 'sparkles',
        titleKey: 'settings.achievements.items.daily_108.title',
        descriptionKey: 'settings.achievements.items.daily_108.description',
        titleArgs: { target: 108 },
        descriptionArgs: { target: 108 },
        progress: {
          current: 108,
          target: 108,
          completed: true,
        },
      },
    ],
    weekly: [],
    monthly: [],
    yearly: [],
    total: [],
  }),
  resolveAchievementTitle: (_id: string, titleKey: string, _titleArgs: Record<string, unknown>, _fmtArgs: Record<string, unknown>, customNames: Record<string, string>, t: (key: string, args?: Record<string, unknown>) => string) => {
    return customNames.daily_108 || t(titleKey)
  },
}))

describe('AchievementsTab', () => {
  beforeEach(() => {
    achievementStoreState.fetchState.mockReset()
    achievementStoreState.clearHistory.mockReset()
    meritDaysLiteState.fetchRecentDaysLite.mockReset()
    settingsState.settings.achievement_custom_names = { daily_108: '11111' }
  })

  it('does not show a custom-name badge on achievement cards', () => {
    render(<AchievementsTab stats={{ total_merit: 108, today: { date: '2026-04-24', total: 108, keyboard: 0, mouse_single: 0 } }} />)

    expect(screen.getByText('11111')).toBeInTheDocument()
    expect(screen.queryByText('✏')).not.toBeInTheDocument()
  })
})
