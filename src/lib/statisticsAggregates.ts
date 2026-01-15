import type { DailyStats } from '@/types/merit'
import { sumKeyCounts, type KeyCounts } from '@/lib/keyboard'

type HourBucket = { total: number; keyboard: number; mouse_single: number }

export type AppInputStats = {
  name?: string | null
  total: number
  keyboard: number
  mouse_single: number
}

export type StatisticsAggregates = {
  keyCountsAll: KeyCounts
  keyCountsUnshifted: KeyCounts
  keyCountsShifted: KeyCounts
  shortcutCounts: Record<string, number>
  mouseButtonCounts: Record<string, number>
  hourly: HourBucket[]
  appInputCounts: Record<string, AppInputStats>
}

function mergeCounts<T extends Record<string, number>>(maps: Array<T | undefined | null>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const map of maps) {
    if (!map) continue
    for (const [key, value] of Object.entries(map)) {
      if (!value) continue
      out[key] = (out[key] ?? 0) + value
    }
  }
  return out
}

function mergeHourly(days: DailyStats[]): HourBucket[] {
  const out: HourBucket[] = Array.from({ length: 24 }, () => ({ total: 0, keyboard: 0, mouse_single: 0 }))
  for (const day of days) {
    const hourly = day.hourly
    if (!hourly) continue
    for (let i = 0; i < Math.min(24, hourly.length); i++) {
      const b = hourly[i]
      if (!b) continue
      out[i]!.total += b.total ?? 0
      out[i]!.keyboard += b.keyboard ?? 0
      out[i]!.mouse_single += b.mouse_single ?? 0
    }
  }
  return out
}

export function mergeAppInputCounts(days: DailyStats[]): Record<string, AppInputStats> {
  const out: Record<string, AppInputStats> = {}
  for (const day of days) {
    const dayCounts = day.app_input_counts
    if (!dayCounts) continue
    for (const [id, raw] of Object.entries(dayCounts)) {
      if (!id) continue
      if (!raw) continue
      const prev = out[id]
      const next: AppInputStats = prev ?? { name: null, total: 0, keyboard: 0, mouse_single: 0 }
      if (!next.name && raw.name) next.name = raw.name
      next.keyboard += raw.keyboard ?? 0
      next.mouse_single += raw.mouse_single ?? 0
      next.total = next.keyboard + next.mouse_single
      out[id] = next
    }
  }
  return out
}

export function buildStatisticsAggregates(days: DailyStats[]): StatisticsAggregates {
  return {
    keyCountsAll: sumKeyCounts(days.map((d) => d.key_counts)),
    keyCountsUnshifted: sumKeyCounts(days.map((d) => d.key_counts_unshifted ?? d.key_counts)),
    keyCountsShifted: sumKeyCounts(days.map((d) => d.key_counts_shifted)),
    shortcutCounts: mergeCounts(days.map((d) => d.shortcut_counts)),
    mouseButtonCounts: mergeCounts(days.map((d) => d.mouse_button_counts)),
    hourly: mergeHourly(days),
    appInputCounts: mergeAppInputCounts(days),
  }
}

