export type SpeedTier = 'slow' | 'medium' | 'fast' | 'very_fast'

export const LIVE2D_TIER_THRESHOLDS_MS = {
  very_fast: 240,
  fast: 440,
  medium: 780,
} as const

export const LIVE2D_TIER_EXPRESSION_INDEX: Record<SpeedTier, number> = {
  slow: 0,
  medium: 1,
  fast: 2,
  very_fast: 3,
}

export const LIVE2D_KEY_WINDOW_MS = 2200
export const LIVE2D_KEY_MAX_COUNT = 12
export const LIVE2D_IDLE_RESET_MS = 2000
export const LIVE2D_TAP_THROTTLE_MS = 300

export function effectiveIntervalMs(timestamps: number[]): number {
  if (timestamps.length < 2) return Number.POSITIVE_INFINITY

  const recent = timestamps.slice(-6)
  const intervalCount = Math.max(1, Math.min(5, recent.length - 1))
  let sum = 0
  for (let i = recent.length - intervalCount; i < recent.length; i++) {
    sum += recent[i] - recent[i - 1]
  }

  const avg = sum / intervalCount
  const last = recent[recent.length - 1] - recent[recent.length - 2]
  if (!Number.isFinite(last)) return avg

  return Math.min(avg, last * 1.1)
}

export function tierByIntervalMs(ms: number): SpeedTier {
  if (!Number.isFinite(ms)) return 'slow'
  if (ms < LIVE2D_TIER_THRESHOLDS_MS.very_fast) return 'very_fast'
  if (ms < LIVE2D_TIER_THRESHOLDS_MS.fast) return 'fast'
  if (ms < LIVE2D_TIER_THRESHOLDS_MS.medium) return 'medium'
  return 'slow'
}

export function keepRecentKeyTimestamps(
  timestamps: number[],
  now: number,
  windowMs: number = LIVE2D_KEY_WINDOW_MS,
  maxCount: number = LIVE2D_KEY_MAX_COUNT,
): number[] {
  const recent = timestamps.filter((timestamp) => now - timestamp <= windowMs)
  if (recent.length <= maxCount) return recent
  return recent.slice(recent.length - maxCount)
}

export function nextSpeedTierState(previousTimestamps: number[], now: number) {
  const timestamps = keepRecentKeyTimestamps([...previousTimestamps, now], now)
  const tier = tierByIntervalMs(effectiveIntervalMs(timestamps))

  return {
    expressionIndex: LIVE2D_TIER_EXPRESSION_INDEX[tier],
    tier,
    timestamps,
  }
}
