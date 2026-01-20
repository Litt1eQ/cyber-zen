import type { DailyStats, MeritStats, Settings } from '@/types/merit'
import { addDaysToNaiveDateKey } from '@/lib/date'
import { buildDayIndex, computeStreaks, monthToDate, peakHour, weekToDate, yearToDate } from '@/lib/statisticsInsights'
import type { MonitorInfo } from '@/types/clickHeatmap'
import { effectivePpiForDisplay, pixelsToCentimeters } from '@/lib/mouseDistance'
import type { AchievementCadence, AchievementComputed, AchievementDefinition, AchievementMetrics, AchievementSummary } from './types'

function sumDailyEarlyTotal(day: DailyStats | null | undefined, endHourExclusive: number): number {
  const hourly = day?.hourly ?? null
  if (!hourly) return 0
  let sum = 0
  for (let h = 0; h < Math.min(endHourExclusive, hourly.length); h++) {
    sum += hourly[h]?.total ?? 0
  }
  return sum
}

function countActiveDaysInRange(index: Map<string, DailyStats>, startKey: string, endKey: string, maxDays: number): number {
  if (!startKey || !endKey) return 0
  if (startKey > endKey) return 0
  if (!Number.isFinite(maxDays) || maxDays <= 0) return 0

  let count = 0
  for (let i = 0; i < maxDays; i++) {
    const key = addDaysToNaiveDateKey(endKey, -i)
    if (!key) break
    if (key < startKey) break
    const day = index.get(key)
    if ((day?.total ?? 0) > 0) count++
  }
  return count
}

function sumMouseMoveCmInRange(
  index: Map<string, DailyStats>,
  startKey: string,
  endKey: string,
  maxDays: number,
  opts: { settings?: Settings | null; monitors?: MonitorInfo[] | null } | undefined
): number {
  if (!startKey || !endKey) return 0
  if (startKey > endKey) return 0
  if (!Number.isFinite(maxDays) || maxDays <= 0) return 0

  const monitorsById = new Map<string, { width: number; height: number }>()
  for (const m of opts?.monitors ?? []) {
    monitorsById.set(m.id, { width: m.size[0], height: m.size[1] })
  }

  const cmForDay = (day: DailyStats | null | undefined): number => {
    const byDisplay = day?.mouse_move_distance_px_by_display ?? null
    const entries = byDisplay ? Object.entries(byDisplay) : []
    if (entries.length) {
      return entries.reduce((acc, [id, px]) => {
        const size = monitorsById.get(id)
        const ppi = effectivePpiForDisplay(opts?.settings ?? null, id, size ?? null)
        return acc + pixelsToCentimeters(px, ppi)
      }, 0)
    }
    const px = day?.mouse_move_distance_px ?? 0
    const ppi = effectivePpiForDisplay(opts?.settings ?? null, 'unknown', null)
    return pixelsToCentimeters(px, ppi)
  }

  let sum = 0
  for (let i = 0; i < maxDays; i++) {
    const key = addDaysToNaiveDateKey(endKey, -i)
    if (!key) break
    if (key < startKey) break
    sum += cmForDay(index.get(key))
  }
  return sum
}

export function computeAchievementMetrics(
  stats: MeritStats,
  opts?: { settings?: Settings | null; monitors?: MonitorInfo[] | null }
): AchievementMetrics {
  const todayKey = stats.today?.date ?? ''
  const allDays = [stats.today, ...stats.history].filter(Boolean)
  const index = buildDayIndex(allDays)

  const moveIndex = (() => {
    const map = new Map<string, DailyStats>()
    const movePx = (day: DailyStats): number => {
      const byDisplay = day.mouse_move_distance_px_by_display ?? null
      if (byDisplay) return Object.values(byDisplay).reduce((acc, v) => acc + (v ?? 0), 0)
      return day.mouse_move_distance_px ?? 0
    }
    for (const day of allDays) {
      const key = day?.date
      if (!key) continue
      const existing = map.get(key)
      if (!existing || movePx(existing) < movePx(day)) map.set(key, day)
    }
    return map
  })()

  const streak = computeStreaks(index, todayKey)
  const week = weekToDate(index, todayKey)
  const month = monthToDate(index, todayKey)
  const year = yearToDate(index, todayKey)
  const peak7 = peakHour(index, todayKey, 7)

  const today = stats.today
  const weekStartKey = week?.startKey ?? todayKey
  const monthStartKey = month?.startKey ?? todayKey
  const yearStartKey = year?.startKey ?? todayKey

  const todayMouseMoveCm = sumMouseMoveCmInRange(moveIndex, todayKey, todayKey, 1, opts)
  const weekMouseMoveCm = sumMouseMoveCmInRange(moveIndex, weekStartKey, todayKey, 14, opts)
  const monthMouseMoveCm = sumMouseMoveCmInRange(moveIndex, monthStartKey, todayKey, 370, opts)
  const yearMouseMoveCm = sumMouseMoveCmInRange(moveIndex, yearStartKey, todayKey, 400, opts)

  return {
    todayKey,
    weekStartKey,
    monthStartKey,
    yearStartKey,
    todayTotal: today?.total ?? 0,
    todayKeyboard: today?.keyboard ?? 0,
    todayMouse: today?.mouse_single ?? 0,
    todayEarlyTotal: sumDailyEarlyTotal(today, 10),
    todayMouseMoveCm,
    weekTotal: week?.sum.total ?? 0,
    weekKeyboard: week?.sum.keyboard ?? 0,
    weekMouse: week?.sum.mouse_single ?? 0,
    weekActiveDays: countActiveDaysInRange(index, weekStartKey, todayKey, 14),
    weekPeakHourTotal: peak7?.sum.total ?? 0,
    weekMouseMoveCm,
    monthTotal: month?.sum.total ?? 0,
    monthKeyboard: month?.sum.keyboard ?? 0,
    monthMouse: month?.sum.mouse_single ?? 0,
    monthActiveDays: countActiveDaysInRange(index, monthStartKey, todayKey, 370),
    monthMouseMoveCm,
    yearTotal: year?.sum.total ?? 0,
    yearKeyboard: year?.sum.keyboard ?? 0,
    yearMouse: year?.sum.mouse_single ?? 0,
    yearActiveDays: countActiveDaysInRange(index, yearStartKey, todayKey, 400),
    yearMouseMoveCm,
    allTimeTotal: stats.total_merit ?? 0,
    currentStreakDays: streak.current,
  }
}

export function computeAchievementSummary(m: AchievementMetrics): AchievementSummary {
  return {
    todayKey: m.todayKey,
    todayTotal: m.todayTotal,
    weekTotal: m.weekTotal,
    monthTotal: m.monthTotal,
    currentStreakDays: m.currentStreakDays,
  }
}

export function periodKeyForCadence(cadence: AchievementCadence, m: AchievementMetrics): string {
  switch (cadence) {
    case 'daily':
      return m.todayKey
    case 'weekly':
      return m.weekStartKey
    case 'monthly':
      return m.monthStartKey
    case 'yearly':
      return m.yearStartKey
    case 'total':
      return 'all_time'
  }
}

export function computeAchievementsByCadence(
  defs: AchievementDefinition[],
  metrics: AchievementMetrics
): Record<AchievementCadence, AchievementComputed[]> {
  const out: Record<AchievementCadence, AchievementComputed[]> = { daily: [], weekly: [], monthly: [], yearly: [], total: [] }
  for (const def of defs) {
    out[def.cadence].push({ ...def, progress: def.compute(metrics) })
  }

  for (const cadence of Object.keys(out) as AchievementCadence[]) {
    out[cadence].sort((a, b) => Number(a.progress.completed) - Number(b.progress.completed))
  }
  return out
}
