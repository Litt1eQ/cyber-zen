import type { DailyStats } from '@/types/merit'
import { addDaysToNaiveDateKey } from '@/lib/date'
import { buildDayIndex, daysInWindow } from '@/lib/statisticsInsights'
import { buildStatisticsAggregates, type StatisticsAggregates } from '@/lib/statisticsAggregates'

export type PeriodSummaryRange = 'today' | 'yesterday' | 'last7' | 'last30'

export type PeriodSummary = {
  range: PeriodSummaryRange
  expectedDays: number
  startKey: string
  endKey: string
  days: DailyStats[]
  totals: { total: number; keyboard: number; mouse_single: number }
  firstEventAtMs: number | null
  lastEventAtMs: number | null
  aggregates: StatisticsAggregates
}

export function periodSummaryExpectedDays(range: PeriodSummaryRange): number {
  if (range === 'today') return 1
  if (range === 'yesterday') return 1
  if (range === 'last7') return 7
  return 30
}

export function computePeriodSummary(
  allDays: DailyStats[],
  todayKey: string,
  range: PeriodSummaryRange,
): PeriodSummary | null {
  if (!todayKey) return null

  const endKey = range === 'today' ? todayKey : addDaysToNaiveDateKey(todayKey, -1)
  if (!endKey) return null

  const expectedDays = periodSummaryExpectedDays(range)
  const index = buildDayIndex(allDays)
  const days = daysInWindow(index, endKey, expectedDays)
  const startKey = addDaysToNaiveDateKey(endKey, -(expectedDays - 1)) ?? endKey

  let total = 0
  let keyboard = 0
  let mouse_single = 0
  let firstEventAtMs: number | null = null
  let lastEventAtMs: number | null = null

  for (const day of days) {
    total += day?.total ?? 0
    keyboard += day?.keyboard ?? 0
    mouse_single += day?.mouse_single ?? 0

    const first = day?.first_event_at_ms ?? null
    if (first && first > 0) firstEventAtMs = firstEventAtMs == null ? first : Math.min(firstEventAtMs, first)
    const last = day?.last_event_at_ms ?? null
    if (last && last > 0) lastEventAtMs = lastEventAtMs == null ? last : Math.max(lastEventAtMs, last)
  }

  return {
    range,
    expectedDays,
    startKey,
    endKey,
    days,
    totals: { total, keyboard, mouse_single },
    firstEventAtMs,
    lastEventAtMs,
    aggregates: buildStatisticsAggregates(days),
  }
}
