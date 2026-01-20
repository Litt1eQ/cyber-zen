import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type { AchievementState, AchievementUnlockRecord } from '@/types/achievements'
import { COMMANDS } from '@/types/events'

interface AchievementStoreState {
  state: AchievementState | null
  isLoading: boolean
  error: string | null
  fetchState: () => Promise<void>
  applyState: (next: AchievementState) => void
  appendUnlocks: (records: AchievementUnlockRecord[]) => Promise<AchievementUnlockRecord[]>
  clearHistory: () => Promise<void>
}

export const useAchievementStore = create<AchievementStoreState>((set, get) => ({
  state: null,
  isLoading: false,
  error: null,

  fetchState: async () => {
    set({ isLoading: true, error: null })
    try {
      const state = await invoke<AchievementState>(COMMANDS.GET_ACHIEVEMENT_STATE)
      set({ state, isLoading: false })
    } catch (error) {
      set({ isLoading: false, error: String(error) })
    }
  },

  applyState: (next) => {
    set({ state: next })
  },

  appendUnlocks: async (records) => {
    if (!records.length) return []
    try {
      const inserted = await invoke<AchievementUnlockRecord[]>(COMMANDS.APPEND_ACHIEVEMENT_UNLOCKS, { records })
      if (inserted.length) {
        const cur = get().state
        if (cur) {
          const next = [...inserted, ...(cur.unlock_history ?? [])]
          next.sort((a, b) => (b.unlocked_at_ms ?? 0) - (a.unlocked_at_ms ?? 0))
          set({ state: { unlock_history: next.slice(0, 800) } })
        }
      }
      return inserted
    } catch (error) {
      set({ error: String(error) })
      return []
    }
  },

  clearHistory: async () => {
    try {
      await invoke(COMMANDS.CLEAR_ACHIEVEMENT_HISTORY)
      const cur = get().state
      set({ state: { unlock_history: [], unlock_index: cur?.unlock_index ?? [] } })
    } catch (error) {
      set({ error: String(error) })
    }
  },
}))
