import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type { DailyStatsLite } from '@/types/merit'
import { COMMANDS } from '@/types/events'

interface MeritDaysLiteState {
  today: DailyStatsLite | null
  history: DailyStatsLite[]
  isLoading: boolean
  error: string | null
  requestedDays: number
  lastFetchedAt: number | null
  fetchRecentDaysLite: (days: number) => Promise<void>
  mergeTodayLite: (today: DailyStatsLite) => void
  clear: () => void
}

function normalizeDays(days: DailyStatsLite[]): DailyStatsLite[] {
  const out: DailyStatsLite[] = []
  const seen = new Set<string>()
  for (const day of days ?? []) {
    const key = day?.date
    if (!key || seen.has(key)) continue
    out.push(day)
    seen.add(key)
  }
  return out
}

export const useMeritDaysLiteStore = create<MeritDaysLiteState>((set, get) => ({
  today: null,
  history: [],
  isLoading: false,
  error: null,
  requestedDays: 0,
  lastFetchedAt: null,

  fetchRecentDaysLite: async (days: number) => {
    const n = Math.max(0, Math.min(4000, Math.floor(Number(days) || 0)))
    if (n === 0) {
      set({ today: null, history: [], requestedDays: 0, lastFetchedAt: Date.now(), error: null, isLoading: false })
      return
    }
    set({ isLoading: true, error: null })
    try {
      const list = await invoke<DailyStatsLite[]>(COMMANDS.GET_RECENT_DAYS_LITE, { days: n })
      const normalized = normalizeDays(list)
      const [today, ...rest] = normalized
      set({
        today: today ?? null,
        history: rest,
        requestedDays: n,
        lastFetchedAt: Date.now(),
        isLoading: false,
        error: null,
      })
    } catch (e) {
      set({ error: String(e), isLoading: false })
    }
  },

  mergeTodayLite: (today: DailyStatsLite) => {
    const key = today?.date
    if (!key) return
    const cur = get().today
    if (!cur || cur.date !== key) return
    set({ today: { ...cur, ...today } })
  },

  clear: () =>
    set({ today: null, history: [], requestedDays: 0, lastFetchedAt: null, error: null, isLoading: false }),
}))
