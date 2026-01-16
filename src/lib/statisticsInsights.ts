import type { DailyStats } from '@/types/merit'
import {
  addDaysToNaiveDateKey,
  startOfMonthFromNaiveDateKey,
  startOfWeekFromNaiveDateKey,
  weekdayIndexMon0FromNaiveDateKey,
} from '@/lib/date'

export type PeriodCounters = {
  total: number
  keyboard: number
  mouse_single: number
}

export type PeriodComparison = {
  days: number
  current: PeriodCounters
  previous: PeriodCounters
  delta: PeriodCounters
  pct: {
    total: number | null
    keyboard: number | null
    mouse_single: number | null
  }
}

export type StreakSummary = {
  current: number
  longest: number
  longestRange: { startKey: string; endKey: string } | null
}

export type WeekdayBucket = {
  weekdayIndexMon0: number
  daysCount: number
  sum: PeriodCounters
  avg: PeriodCounters
}

export type PeakHour = {
  hour: number
  sum: PeriodCounters
}

export type BestDay = {
  dateKey: string
  total: number
  keyboard: number
  mouse_single: number
}

function countersForDay(day: DailyStats | undefined | null): PeriodCounters {
  return {
    total: day?.total ?? 0,
    keyboard: day?.keyboard ?? 0,
    mouse_single: day?.mouse_single ?? 0,
  }
}

function addCounters(a: PeriodCounters, b: PeriodCounters): PeriodCounters {
  return {
    total: a.total + b.total,
    keyboard: a.keyboard + b.keyboard,
    mouse_single: a.mouse_single + b.mouse_single,
  }
}

function subCounters(a: PeriodCounters, b: PeriodCounters): PeriodCounters {
  return {
    total: a.total - b.total,
    keyboard: a.keyboard - b.keyboard,
    mouse_single: a.mouse_single - b.mouse_single,
  }
}

function pctDelta(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null
  if (previous <= 0) return null
  return (current - previous) / previous
}

export function buildDayIndex(days: DailyStats[]): Map<string, DailyStats> {
  const map = new Map<string, DailyStats>()
  for (const day of days) {
    const key = day?.date
    if (!key) continue
    const existing = map.get(key)
    if (!existing || (existing.total ?? 0) < (day.total ?? 0)) map.set(key, day)
  }
  return map
}

export function keysInWindow(endKey: string, days: number): string[] {
  const out: string[] = []
  if (!endKey) return out
  if (!Number.isFinite(days) || days <= 0) return out
  for (let i = 0; i < days; i++) {
    const k = addDaysToNaiveDateKey(endKey, -i)
    if (!k) break
    out.push(k)
  }
  return out
}

export function daysInWindow(index: Map<string, DailyStats>, endKey: string, days: number): DailyStats[] {
  const keys = keysInWindow(endKey, days)
  const out: DailyStats[] = []
  for (const key of keys) {
    const day = index.get(key)
    if (day) out.push(day)
  }
  return out
}

export function sumPeriod(index: Map<string, DailyStats>, endKey: string, days: number): PeriodCounters {
  let acc: PeriodCounters = { total: 0, keyboard: 0, mouse_single: 0 }
  for (const key of keysInWindow(endKey, days)) {
    acc = addCounters(acc, countersForDay(index.get(key)))
  }
  return acc
}

export function comparePeriods(index: Map<string, DailyStats>, endKey: string, days: number): PeriodComparison {
  const current = sumPeriod(index, endKey, days)
  const prevEnd = addDaysToNaiveDateKey(endKey, -days)
  const previous = prevEnd ? sumPeriod(index, prevEnd, days) : { total: 0, keyboard: 0, mouse_single: 0 }
  const delta = subCounters(current, previous)
  return {
    days,
    current,
    previous,
    delta,
    pct: {
      total: pctDelta(current.total, previous.total),
      keyboard: pctDelta(current.keyboard, previous.keyboard),
      mouse_single: pctDelta(current.mouse_single, previous.mouse_single),
    },
  }
}

export function computeStreaks(index: Map<string, DailyStats>, endKey: string): StreakSummary {
  const activeKeys = [...index.entries()]
    .filter(([, day]) => (day?.total ?? 0) > 0)
    .map(([k]) => k)
    .sort()

  const activeSet = new Set(activeKeys)

  let current = 0
  for (let i = 0; i < 800; i++) {
    const key = addDaysToNaiveDateKey(endKey, -i)
    if (!key) break
    const day = index.get(key)
    if (!day || (day.total ?? 0) <= 0) break
    current++
  }

  let longest = 0
  let longestRange: { startKey: string; endKey: string } | null = null

  for (const key of activeKeys) {
    const prev = addDaysToNaiveDateKey(key, -1)
    if (prev && activeSet.has(prev)) continue

    let startKey = key
    let end = key
    let len = 0
    for (let i = 0; i < 2000; i++) {
      const cur = addDaysToNaiveDateKey(key, i)
      if (!cur) break
      if (!activeSet.has(cur)) break
      len++
      end = cur
    }
    if (len > longest) {
      longest = len
      longestRange = { startKey, endKey: end }
    }
  }

  return { current, longest, longestRange }
}

export function weekToDate(index: Map<string, DailyStats>, endKey: string): { startKey: string; sum: PeriodCounters } | null {
  const startKey = startOfWeekFromNaiveDateKey(endKey, 1)
  if (!startKey) return null

  let acc: PeriodCounters = { total: 0, keyboard: 0, mouse_single: 0 }
  for (let i = 0; i < 14; i++) {
    const key = addDaysToNaiveDateKey(endKey, -i)
    if (!key) break
    if (key < startKey) break
    acc = addCounters(acc, countersForDay(index.get(key)))
  }
  return { startKey, sum: acc }
}

export function monthToDate(index: Map<string, DailyStats>, endKey: string): { startKey: string; sum: PeriodCounters } | null {
  const startKey = startOfMonthFromNaiveDateKey(endKey)
  if (!startKey) return null

  let acc: PeriodCounters = { total: 0, keyboard: 0, mouse_single: 0 }
  for (let i = 0; i < 370; i++) {
    const key = addDaysToNaiveDateKey(endKey, -i)
    if (!key) break
    if (key < startKey) break
    acc = addCounters(acc, countersForDay(index.get(key)))
  }
  return { startKey, sum: acc }
}

export function weekdayDistribution(index: Map<string, DailyStats>, endKey: string, days: number): WeekdayBucket[] {
  const buckets: WeekdayBucket[] = Array.from({ length: 7 }, (_, weekdayIndexMon0) => ({
    weekdayIndexMon0,
    daysCount: 0,
    sum: { total: 0, keyboard: 0, mouse_single: 0 },
    avg: { total: 0, keyboard: 0, mouse_single: 0 },
  }))

  for (const key of keysInWindow(endKey, days)) {
    const weekday = weekdayIndexMon0FromNaiveDateKey(key)
    if (weekday == null) continue
    const day = index.get(key)
    if (!day) continue

    const b = buckets[weekday]
    if (!b) continue
    b.daysCount += 1
    b.sum = addCounters(b.sum, countersForDay(day))
  }

  for (const b of buckets) {
    const denom = b.daysCount > 0 ? b.daysCount : 1
    b.avg = {
      total: b.sum.total / denom,
      keyboard: b.sum.keyboard / denom,
      mouse_single: b.sum.mouse_single / denom,
    }
  }
  return buckets
}

export function peakHour(index: Map<string, DailyStats>, endKey: string, days: number): PeakHour | null {
  const sums: PeriodCounters[] = Array.from({ length: 24 }, () => ({ total: 0, keyboard: 0, mouse_single: 0 }))
  let hasAny = false

  for (const key of keysInWindow(endKey, days)) {
    const day = index.get(key)
    const hourly = day?.hourly ?? null
    if (!hourly) continue
    for (let hour = 0; hour < Math.min(24, hourly.length); hour++) {
      const bucket = hourly[hour]
      if (!bucket) continue
      sums[hour] = addCounters(sums[hour]!, {
        total: bucket.total ?? 0,
        keyboard: bucket.keyboard ?? 0,
        mouse_single: bucket.mouse_single ?? 0,
      })
      if ((bucket.total ?? 0) > 0) hasAny = true
    }
  }

  if (!hasAny) return null

  let bestHour = 0
  let bestTotal = -1
  for (let hour = 0; hour < 24; hour++) {
    const total = sums[hour]!.total
    if (total > bestTotal) {
      bestTotal = total
      bestHour = hour
    }
  }
  return { hour: bestHour, sum: sums[bestHour]! }
}

export function bestDay(index: Map<string, DailyStats>, endKey: string, days: number | 'all'): BestDay | null {
  const keys = days === 'all' ? [...index.keys()].sort().reverse() : keysInWindow(endKey, days)
  let best: BestDay | null = null
  for (const key of keys) {
    const day = index.get(key)
    if (!day) continue
    const total = day.total ?? 0
    if (!best || total > best.total) {
      best = { dateKey: key, total, keyboard: day.keyboard ?? 0, mouse_single: day.mouse_single ?? 0 }
    }
  }
  return best
}

