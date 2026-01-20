export type AchievementCadence = 'daily' | 'weekly' | 'monthly'

export type AchievementIcon =
  | 'sparkles'
  | 'sunrise'
  | 'keyboard'
  | 'mouse'
  | 'move'
  | 'calendar'
  | 'flame'
  | 'trophy'

export type AchievementProgress = {
  current: number
  target: number
  completed: boolean
  detail?: string
  parts?: Array<{ kind: 'keyboard' | 'mouse' | 'total' | 'days'; current: number; target: number }>
}

export type AchievementDefinition = {
  id: string
  cadence: AchievementCadence
  icon: AchievementIcon
  titleKey: string
  descriptionKey: string
  titleArgs?: Record<string, unknown>
  descriptionArgs?: Record<string, unknown>
  compute: (m: AchievementMetrics) => AchievementProgress
}

export type AchievementComputed = AchievementDefinition & { progress: AchievementProgress }

export type AchievementSummary = {
  todayKey: string
  todayTotal: number
  weekTotal: number
  monthTotal: number
  currentStreakDays: number
}

export type AchievementMetrics = {
  todayKey: string
  weekStartKey: string
  monthStartKey: string
  todayTotal: number
  todayKeyboard: number
  todayMouse: number
  todayEarlyTotal: number
  todayMouseMoveCm: number
  weekTotal: number
  weekKeyboard: number
  weekMouse: number
  weekActiveDays: number
  weekPeakHourTotal: number
  weekMouseMoveCm: number
  monthTotal: number
  monthKeyboard: number
  monthMouse: number
  monthActiveDays: number
  monthMouseMoveCm: number
  currentStreakDays: number
}
