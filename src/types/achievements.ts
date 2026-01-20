export type AchievementCadence = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'total'

export type AchievementUnlockRecord = {
  achievement_id: string
  cadence: AchievementCadence
  period_key: string
  unlocked_at_ms: number
}

export type AchievementState = {
  unlock_index?: AchievementUnlockRecord[]
  unlock_history: AchievementUnlockRecord[]
}
