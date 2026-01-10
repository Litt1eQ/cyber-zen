import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type { MeritStats } from '../types/merit'
import { COMMANDS } from '../types/events'

interface MeritState {
  stats: MeritStats | null
  isLoading: boolean
  error: string | null
  fetchStats: () => Promise<void>
  updateStats: (stats: MeritStats) => void
  clearHistory: () => Promise<void>
  resetAll: () => Promise<void>
}

export const useMeritStore = create<MeritState>((set) => ({
  stats: null,
  isLoading: false,
  error: null,

  fetchStats: async () => {
    set({ isLoading: true, error: null })
    try {
      const stats = await invoke<MeritStats>(COMMANDS.GET_MERIT_STATS)
      set({ stats, isLoading: false })
    } catch (error) {
      set({ error: String(error), isLoading: false })
    }
  },

  updateStats: (stats: MeritStats) => {
    set({ stats })
  },

  clearHistory: async () => {
    try {
      await invoke(COMMANDS.CLEAR_HISTORY)
      const stats = await invoke<MeritStats>(COMMANDS.GET_MERIT_STATS)
      set({ stats })
    } catch (error) {
      set({ error: String(error) })
    }
  },

  resetAll: async () => {
    try {
      await invoke(COMMANDS.RESET_ALL_MERIT)
      const stats = await invoke<MeritStats>(COMMANDS.GET_MERIT_STATS)
      set({ stats })
    } catch (error) {
      set({ error: String(error) })
    }
  },
}))
