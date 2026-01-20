import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import type { AchievementState } from '@/types/achievements'
import { EVENTS } from '@/types/events'
import { useAchievementStore } from '@/stores/useAchievementStore'

export function useAchievementsSync() {
  const applyState = useAchievementStore((s) => s.applyState)

  useEffect(() => {
    const unlisten = listen<AchievementState>(EVENTS.ACHIEVEMENTS_UPDATED, (event) => {
      applyState(event.payload)
    })

    return () => {
      unlisten.then((fn) => fn())
    }
  }, [applyState])
}

