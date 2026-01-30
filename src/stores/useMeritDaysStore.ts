import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type { DailyStats, DailyStatsLite } from '@/types/merit'
import { COMMANDS } from '@/types/events'

interface MeritDaysState {
  today: DailyStats | null
  history: DailyStats[]
  isLoading: boolean
  error: string | null
  requestedDays: number
  lastFetchedAt: number | null
  fetchRecentDays: (days: number) => Promise<void>
  refreshTodayFull: () => Promise<void>
  mergeTodayLite: (today: DailyStatsLite) => void
  clear: () => void
}

function normalizeDays(days: DailyStats[]): DailyStats[] {
  const out: DailyStats[] = []
  const seen = new Set<string>()
  for (const day of days ?? []) {
    const key = day?.date
    if (!key || seen.has(key)) continue
    out.push(day)
    seen.add(key)
  }
  return out
}

export const useMeritDaysStore = create<MeritDaysState>((set, get) => ({
  today: null,
  history: [],
  isLoading: false,
  error: null,
  requestedDays: 0,
  lastFetchedAt: null,

  fetchRecentDays: async (days: number) => {
    const n = Math.max(0, Math.min(4000, Math.floor(Number(days) || 0)))
    if (n === 0) {
      set({ today: null, history: [], requestedDays: 0, lastFetchedAt: Date.now(), error: null, isLoading: false })
      return
    }
    set({ isLoading: true, error: null })
    try {
      const list = await invoke<DailyStats[]>(COMMANDS.GET_RECENT_DAYS, { days: n })
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

  refreshTodayFull: async () => {
    try {
      const list = await invoke<DailyStats[]>(COMMANDS.GET_RECENT_DAYS, { days: 1 })
      const today = list?.[0]
      if (!today?.date) return
      const cur = get().today
      if (!cur || cur.date !== today.date) return
      set({ today })
    } catch {
      // ignore
    }
  },

  mergeTodayLite: (today: DailyStatsLite) => {
    const key = today?.date
    if (!key) return
    const prev = get().today
    if (!prev || prev.date !== key) return
    const nextDay: DailyStats = {
      ...prev,
      date: prev.date,
      total: today.total ?? prev.total,
      keyboard: today.keyboard ?? prev.keyboard,
      mouse_single: today.mouse_single ?? prev.mouse_single,
      first_event_at_ms: today.first_event_at_ms ?? prev.first_event_at_ms,
      last_event_at_ms: today.last_event_at_ms ?? prev.last_event_at_ms,
      mouse_move_distance_px: today.mouse_move_distance_px ?? prev.mouse_move_distance_px,
      mouse_move_distance_px_by_display: today.mouse_move_distance_px_by_display ?? prev.mouse_move_distance_px_by_display,
      hourly: today.hourly ?? prev.hourly,
    }
    set({ today: nextDay })
  },

  clear: () =>
    set({ today: null, history: [], requestedDays: 0, lastFetchedAt: null, error: null, isLoading: false }),
}))
