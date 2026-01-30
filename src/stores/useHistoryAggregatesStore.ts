import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { COMMANDS } from '@/types/events'
import type { StatisticsAggregates } from '@/lib/statisticsAggregates'

export type HistoryAggregatesQuery = {
  startKey?: string | null
  endKey?: string | null
}

export function historyAggregatesCacheKey(query: HistoryAggregatesQuery): string {
  const start = (query.startKey ?? '').trim()
  const end = (query.endKey ?? '').trim()
  return `${start}..${end}`
}

interface HistoryAggregatesState {
  cache: Record<string, StatisticsAggregates>
  isLoading: boolean
  error: string | null
  inflightKey: string | null
  fetchAggregates: (query: HistoryAggregatesQuery) => Promise<void>
  clear: () => void
}

export const useHistoryAggregatesStore = create<HistoryAggregatesState>((set, get) => ({
  cache: {},
  isLoading: false,
  error: null,
  inflightKey: null,

  fetchAggregates: async (query: HistoryAggregatesQuery) => {
    const key = historyAggregatesCacheKey(query)
    if (get().cache[key]) return
    if (get().inflightKey === key) return

    set({ isLoading: true, error: null, inflightKey: key })
    try {
      const aggregates = await invoke<StatisticsAggregates>(COMMANDS.GET_HISTORY_AGGREGATES, {
        startKey: query.startKey ?? null,
        endKey: query.endKey ?? null,
      })
      set((s) => ({
        cache: { ...s.cache, [key]: aggregates },
        isLoading: false,
        error: null,
        inflightKey: null,
      }))
    } catch (e) {
      set({ isLoading: false, error: String(e), inflightKey: null })
    }
  },

  clear: () => set({ cache: {}, isLoading: false, error: null, inflightKey: null }),
}))

