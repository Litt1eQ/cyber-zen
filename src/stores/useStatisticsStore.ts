import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type { DailyStats } from '../types/merit'
import { COMMANDS } from '../types/events'

interface StatisticsState {
  recentDays: DailyStats[]
  isLoading: boolean
  error: string | null
  fetchRecentDays: (days: number) => Promise<void>
}

export const useStatisticsStore = create<StatisticsState>((set) => ({
  recentDays: [],
  isLoading: false,
  error: null,

  fetchRecentDays: async (days: number) => {
    set({ isLoading: true, error: null })
    try {
      const recentDays = await invoke<DailyStats[]>(COMMANDS.GET_RECENT_DAYS, { days })
      set({ recentDays, isLoading: false })
    } catch (error) {
      set({ error: String(error), isLoading: false })
    }
  },
}))
