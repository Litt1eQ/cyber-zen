import type { AchievementDefinition } from './types'

function milestone(opts: {
  id: string
  cadence: AchievementDefinition['cadence']
  icon: AchievementDefinition['icon']
  titleKey: string
  descriptionKey: string
  target: number
  current: (m: Parameters<AchievementDefinition['compute']>[0]) => number
}): AchievementDefinition {
  return {
    id: opts.id,
    cadence: opts.cadence,
    icon: opts.icon,
    titleKey: opts.titleKey,
    descriptionKey: opts.descriptionKey,
    titleArgs: { target: opts.target },
    descriptionArgs: { target: opts.target },
    compute: (m) => {
      const cur = opts.current(m)
      return { current: cur, target: opts.target, completed: cur >= opts.target }
    },
  }
}

export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  {
    id: 'daily_108',
    cadence: 'daily',
    icon: 'sparkles',
    titleKey: 'settings.achievements.items.daily_108.title',
    descriptionKey: 'settings.achievements.items.daily_108.description',
    compute: (m) => {
      const target = 108
      return { current: m.todayTotal, target, completed: m.todayTotal >= target }
    },
  },
  milestone({
    id: 'daily_total_666',
    cadence: 'daily',
    icon: 'sparkles',
    titleKey: 'settings.achievements.items.daily_total_666.title',
    descriptionKey: 'settings.achievements.items.daily_total_666.description',
    target: 666,
    current: (m) => m.todayTotal,
  }),
  milestone({
    id: 'daily_total_888',
    cadence: 'daily',
    icon: 'sparkles',
    titleKey: 'settings.achievements.items.daily_total_888.title',
    descriptionKey: 'settings.achievements.items.daily_total_888.description',
    target: 888,
    current: (m) => m.todayTotal,
  }),
  milestone({
    id: 'daily_total_1666',
    cadence: 'daily',
    icon: 'sparkles',
    titleKey: 'settings.achievements.items.daily_total_1666.title',
    descriptionKey: 'settings.achievements.items.daily_total_1666.description',
    target: 1666,
    current: (m) => m.todayTotal,
  }),
  milestone({
    id: 'daily_total_1888',
    cadence: 'daily',
    icon: 'sparkles',
    titleKey: 'settings.achievements.items.daily_total_1888.title',
    descriptionKey: 'settings.achievements.items.daily_total_1888.description',
    target: 1888,
    current: (m) => m.todayTotal,
  }),
  {
    id: 'daily_keyboard_300',
    cadence: 'daily',
    icon: 'keyboard',
    titleKey: 'settings.achievements.items.daily_keyboard_300.title',
    descriptionKey: 'settings.achievements.items.daily_keyboard_300.description',
    compute: (m) => {
      const target = 300
      return { current: m.todayKeyboard, target, completed: m.todayKeyboard >= target }
    },
  },
  milestone({
    id: 'daily_keyboard_666',
    cadence: 'daily',
    icon: 'keyboard',
    titleKey: 'settings.achievements.items.daily_keyboard_666.title',
    descriptionKey: 'settings.achievements.items.daily_keyboard_666.description',
    target: 666,
    current: (m) => m.todayKeyboard,
  }),
  milestone({
    id: 'daily_keyboard_888',
    cadence: 'daily',
    icon: 'keyboard',
    titleKey: 'settings.achievements.items.daily_keyboard_888.title',
    descriptionKey: 'settings.achievements.items.daily_keyboard_888.description',
    target: 888,
    current: (m) => m.todayKeyboard,
  }),
  {
    id: 'daily_mouse_108',
    cadence: 'daily',
    icon: 'mouse',
    titleKey: 'settings.achievements.items.daily_mouse_108.title',
    descriptionKey: 'settings.achievements.items.daily_mouse_108.description',
    compute: (m) => {
      const target = 108
      return { current: m.todayMouse, target, completed: m.todayMouse >= target }
    },
  },
  milestone({
    id: 'daily_mouse_666',
    cadence: 'daily',
    icon: 'mouse',
    titleKey: 'settings.achievements.items.daily_mouse_666.title',
    descriptionKey: 'settings.achievements.items.daily_mouse_666.description',
    target: 666,
    current: (m) => m.todayMouse,
  }),
  {
    id: 'daily_early_54',
    cadence: 'daily',
    icon: 'sunrise',
    titleKey: 'settings.achievements.items.daily_early_54.title',
    descriptionKey: 'settings.achievements.items.daily_early_54.description',
    compute: (m) => {
      const target = 54
      return { current: m.todayEarlyTotal, target, completed: m.todayEarlyTotal >= target }
    },
  },
  {
    id: 'daily_mouse_move_100m',
    cadence: 'daily',
    icon: 'move',
    titleKey: 'settings.achievements.items.daily_mouse_move_100m.title',
    descriptionKey: 'settings.achievements.items.daily_mouse_move_100m.description',
    compute: (m) => {
      const target = 100
      const current = m.todayMouseMoveCm / 100
      return { current, target, completed: current >= target, detail: `${Math.round(m.todayMouseMoveCm).toLocaleString()} cm` }
    },
  },
  {
    id: 'daily_mouse_move_300m',
    cadence: 'daily',
    icon: 'move',
    titleKey: 'settings.achievements.items.daily_mouse_move_300m.title',
    descriptionKey: 'settings.achievements.items.daily_mouse_move_300m.description',
    compute: (m) => {
      const target = 300
      const current = m.todayMouseMoveCm / 100
      return { current, target, completed: current >= target, detail: `${Math.round(m.todayMouseMoveCm).toLocaleString()} cm` }
    },
  },
  {
    id: 'weekly_2000',
    cadence: 'weekly',
    icon: 'calendar',
    titleKey: 'settings.achievements.items.weekly_2000.title',
    descriptionKey: 'settings.achievements.items.weekly_2000.description',
    compute: (m) => {
      const target = 2000
      return { current: m.weekTotal, target, completed: m.weekTotal >= target }
    },
  },
  milestone({
    id: 'weekly_total_6666',
    cadence: 'weekly',
    icon: 'calendar',
    titleKey: 'settings.achievements.items.weekly_total_6666.title',
    descriptionKey: 'settings.achievements.items.weekly_total_6666.description',
    target: 6666,
    current: (m) => m.weekTotal,
  }),
  milestone({
    id: 'weekly_total_8888',
    cadence: 'weekly',
    icon: 'calendar',
    titleKey: 'settings.achievements.items.weekly_total_8888.title',
    descriptionKey: 'settings.achievements.items.weekly_total_8888.description',
    target: 8888,
    current: (m) => m.weekTotal,
  }),
  milestone({
    id: 'weekly_total_16666',
    cadence: 'weekly',
    icon: 'calendar',
    titleKey: 'settings.achievements.items.weekly_total_16666.title',
    descriptionKey: 'settings.achievements.items.weekly_total_16666.description',
    target: 16666,
    current: (m) => m.weekTotal,
  }),
  {
    id: 'weekly_5_days',
    cadence: 'weekly',
    icon: 'flame',
    titleKey: 'settings.achievements.items.weekly_5_days.title',
    descriptionKey: 'settings.achievements.items.weekly_5_days.description',
    compute: (m) => {
      const target = 5
      return { current: m.weekActiveDays, target, completed: m.weekActiveDays >= target }
    },
  },
  milestone({
    id: 'weekly_7_days',
    cadence: 'weekly',
    icon: 'flame',
    titleKey: 'settings.achievements.items.weekly_7_days.title',
    descriptionKey: 'settings.achievements.items.weekly_7_days.description',
    target: 7,
    current: (m) => m.weekActiveDays,
  }),
  {
    id: 'weekly_keyboard_1500',
    cadence: 'weekly',
    icon: 'keyboard',
    titleKey: 'settings.achievements.items.weekly_keyboard_1500.title',
    descriptionKey: 'settings.achievements.items.weekly_keyboard_1500.description',
    compute: (m) => {
      const target = 1500
      return { current: m.weekKeyboard, target, completed: m.weekKeyboard >= target }
    },
  },
  {
    id: 'weekly_peak_hour_300',
    cadence: 'weekly',
    icon: 'sparkles',
    titleKey: 'settings.achievements.items.weekly_peak_hour_300.title',
    descriptionKey: 'settings.achievements.items.weekly_peak_hour_300.description',
    compute: (m) => {
      const target = 300
      return { current: m.weekPeakHourTotal, target, completed: m.weekPeakHourTotal >= target }
    },
  },
  {
    id: 'weekly_mouse_move_2000m',
    cadence: 'weekly',
    icon: 'move',
    titleKey: 'settings.achievements.items.weekly_mouse_move_2000m.title',
    descriptionKey: 'settings.achievements.items.weekly_mouse_move_2000m.description',
    compute: (m) => {
      const target = 2000
      const current = m.weekMouseMoveCm / 100
      return { current, target, completed: current >= target, detail: `${Math.round(m.weekMouseMoveCm).toLocaleString()} cm` }
    },
  },
  {
    id: 'monthly_10000',
    cadence: 'monthly',
    icon: 'trophy',
    titleKey: 'settings.achievements.items.monthly_10000.title',
    descriptionKey: 'settings.achievements.items.monthly_10000.description',
    compute: (m) => {
      const target = 10000
      return { current: m.monthTotal, target, completed: m.monthTotal >= target }
    },
  },
  {
    id: 'monthly_mouse_move_20000m',
    cadence: 'monthly',
    icon: 'move',
    titleKey: 'settings.achievements.items.monthly_mouse_move_20000m.title',
    descriptionKey: 'settings.achievements.items.monthly_mouse_move_20000m.description',
    compute: (m) => {
      const target = 20000
      const current = m.monthMouseMoveCm / 100
      return { current, target, completed: current >= target, detail: `${Math.round(m.monthMouseMoveCm).toLocaleString()} cm` }
    },
  },
  milestone({
    id: 'monthly_total_66666',
    cadence: 'monthly',
    icon: 'trophy',
    titleKey: 'settings.achievements.items.monthly_total_66666.title',
    descriptionKey: 'settings.achievements.items.monthly_total_66666.description',
    target: 66666,
    current: (m) => m.monthTotal,
  }),
  milestone({
    id: 'monthly_total_88888',
    cadence: 'monthly',
    icon: 'trophy',
    titleKey: 'settings.achievements.items.monthly_total_88888.title',
    descriptionKey: 'settings.achievements.items.monthly_total_88888.description',
    target: 88888,
    current: (m) => m.monthTotal,
  }),
  {
    id: 'monthly_20_days',
    cadence: 'monthly',
    icon: 'calendar',
    titleKey: 'settings.achievements.items.monthly_20_days.title',
    descriptionKey: 'settings.achievements.items.monthly_20_days.description',
    compute: (m) => {
      const target = 20
      return { current: m.monthActiveDays, target, completed: m.monthActiveDays >= target }
    },
  },
  {
    id: 'monthly_streak_14',
    cadence: 'monthly',
    icon: 'flame',
    titleKey: 'settings.achievements.items.monthly_streak_14.title',
    descriptionKey: 'settings.achievements.items.monthly_streak_14.description',
    compute: (m) => {
      const target = 14
      return { current: m.currentStreakDays, target, completed: m.currentStreakDays >= target }
    },
  },
  milestone({
    id: 'monthly_streak_30',
    cadence: 'monthly',
    icon: 'flame',
    titleKey: 'settings.achievements.items.monthly_streak_30.title',
    descriptionKey: 'settings.achievements.items.monthly_streak_30.description',
    target: 30,
    current: (m) => m.currentStreakDays,
  }),
  {
    id: 'monthly_balance_2000',
    cadence: 'monthly',
    icon: 'sparkles',
    titleKey: 'settings.achievements.items.monthly_balance_2000.title',
    descriptionKey: 'settings.achievements.items.monthly_balance_2000.description',
    compute: (m) => {
      const target = 2000
      const completed = m.monthKeyboard >= target && m.monthMouse >= target
      const current = Math.min(m.monthKeyboard, m.monthMouse)
      return {
        current,
        target,
        completed,
        parts: [
          { kind: 'keyboard', current: m.monthKeyboard, target },
          { kind: 'mouse', current: m.monthMouse, target },
        ],
      }
    },
  },
]
