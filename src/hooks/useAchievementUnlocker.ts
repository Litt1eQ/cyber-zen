import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useMeritStore } from '@/stores/useMeritStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useAchievementStore } from '@/stores/useAchievementStore'
import { useMeritDaysLiteStore } from '@/stores/useMeritDaysLiteStore'
import { useAchievementsSync } from '@/hooks/useAchievementsSync'
import { useDisplayMonitors } from '@/hooks/useDisplayMonitors'
import { ACHIEVEMENT_DEFINITIONS, computeAchievementMetrics, computeAchievementsByCadence, periodKeyForCadence } from '@/lib/achievements'
import type { AchievementUnlockRecord } from '@/types/achievements'
import { sendSystemNotification } from '@/lib/notifications'
import type { DailyStats, DailyStatsLite, MeritStats } from '@/types/merit'

export function useAchievementUnlocker() {
  const { t } = useTranslation()
  const stats = useMeritStore((s) => s.stats)
  const settings = useSettingsStore((s) => s.settings)
  const { today: todayLite, history: historyLite, fetchRecentDaysLite } = useMeritDaysLiteStore()
  const monitors = useDisplayMonitors()
  const fetchState = useAchievementStore((s) => s.fetchState)
  const achievementState = useAchievementStore((s) => s.state)
  const appendUnlocks = useAchievementStore((s) => s.appendUnlocks)

  useAchievementsSync()

  useEffect(() => {
    fetchState()
  }, [fetchState])

  useEffect(() => {
    fetchRecentDaysLite(420)
  }, [fetchRecentDaysLite])

  const statsForAchievements = useMemo((): MeritStats | null => {
    if (!stats) return null
    const inflate = (day: DailyStatsLite): DailyStats => ({
      date: day.date,
      total: day.total ?? 0,
      keyboard: day.keyboard ?? 0,
      mouse_single: day.mouse_single ?? 0,
      first_event_at_ms: day.first_event_at_ms ?? null,
      last_event_at_ms: day.last_event_at_ms ?? null,
      mouse_move_distance_px: day.mouse_move_distance_px ?? 0,
      mouse_move_distance_px_by_display: day.mouse_move_distance_px_by_display ?? {},
      hourly: day.hourly ?? [],
      key_counts: {},
      key_counts_unshifted: {},
      key_counts_shifted: {},
      shortcut_counts: {},
      mouse_button_counts: {},
      app_input_counts: {},
    })

    const today = todayLite ? inflate(todayLite) : inflate(stats.today)
    const history = historyLite.map(inflate).filter((d) => d.date !== today.date)
    return { total_merit: stats.total_merit, today, history }
  }, [historyLite, stats, todayLite])

  const historyKeySet = useMemo(() => {
    const set = new Set<string>()
    const source = achievementState?.unlock_index?.length
      ? achievementState.unlock_index
      : achievementState?.unlock_history ?? []
    for (const rec of source) {
      set.add(`${rec.achievement_id}::${rec.cadence}::${rec.period_key}`)
    }
    return set
  }, [achievementState?.unlock_history, achievementState?.unlock_index])

  const defsById = useMemo(() => {
    const map = new Map<string, (typeof ACHIEVEMENT_DEFINITIONS)[number]>()
    for (const d of ACHIEVEMENT_DEFINITIONS) map.set(d.id, d)
    return map
  }, [])

  const hydratedRef = useRef(false)
  const timerRef = useRef<number | null>(null)
  const runSeqRef = useRef(0)

  useEffect(() => {
    if (!statsForAchievements) return
    if (!achievementState) return
    runSeqRef.current += 1
    const seq = runSeqRef.current

    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }

    const delayMs = hydratedRef.current ? 800 : 0
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      if (seq !== runSeqRef.current) return

      const metrics = computeAchievementMetrics(statsForAchievements, { settings, monitors: monitors.monitors })
      const byCadence = computeAchievementsByCadence(ACHIEVEMENT_DEFINITIONS, metrics)
      const all = [...byCadence.daily, ...byCadence.weekly, ...byCadence.monthly, ...byCadence.yearly, ...byCadence.total]

      const now = Date.now()
      const candidates: AchievementUnlockRecord[] = []
      for (const a of all) {
        if (!a.progress.completed) continue
        const periodKey = periodKeyForCadence(a.cadence, metrics)
        if (!periodKey) continue
        const key = `${a.id}::${a.cadence}::${periodKey}`
        if (historyKeySet.has(key)) continue
        candidates.push({
          achievement_id: a.id,
          cadence: a.cadence,
          period_key: periodKey,
          unlocked_at_ms: now,
        })
      }

      if (!candidates.length) {
        hydratedRef.current = true
        return
      }

      void (async () => {
        const inserted = await appendUnlocks(candidates)
        if (seq !== runSeqRef.current) return

        if (!inserted.length) {
          hydratedRef.current = true
          return
        }

        if (!settings) {
          hydratedRef.current = true
          return
        }
        const notificationsEnabled = settings.achievement_notifications_enabled ?? false
        if (!notificationsEnabled) {
          hydratedRef.current = true
          return
        }

        if (!hydratedRef.current) {
          hydratedRef.current = true
          return
        }

        for (const rec of inserted.slice(0, 3)) {
          if (seq !== runSeqRef.current) return

          const def = defsById.get(rec.achievement_id)
          const rawArgs = def?.titleArgs ?? {}
          const titleArgs =
            typeof (rawArgs as { target?: unknown }).target === 'number'
              ? { ...rawArgs, target: ((rawArgs as { target: number }).target).toLocaleString() }
              : rawArgs
          const name = def ? t(def.titleKey, titleArgs) : rec.achievement_id
          await sendSystemNotification({
            title: t('settings.achievements.notifications.unlockedTitle'),
            body: t('settings.achievements.notifications.unlockedBody', { name }),
          })
        }
        hydratedRef.current = true
      })()
    }, delayMs)

    return () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [appendUnlocks, achievementState, defsById, historyKeySet, monitors.monitors, settings, settings?.achievement_notifications_enabled, statsForAchievements, t])
}
