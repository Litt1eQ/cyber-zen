import { useEffect, useMemo, useRef, useState } from 'react'

const DEFAULT_IDLE_ROW = 3
const DEFAULT_HOVER_IDLE_ROW = 0
const DEFAULT_ACTIVE_ROWS = [1, 2, 4, 5] as const
const DEFAULT_DRAG_ROW = 6

type SpeedTier = 'slow' | 'medium' | 'fast' | 'very_fast'

const TIER_THRESHOLDS_MS: Record<SpeedTier, number> = {
  // Higher tiers were too hard to reach when measuring by average intervals;
  // these thresholds are intentionally more permissive.
  very_fast: 240,
  fast: 440,
  medium: 780,
  slow: Number.POSITIVE_INFINITY,
}

function tierByAvgIntervalMs(avgMs: number): SpeedTier {
  if (!Number.isFinite(avgMs)) return 'slow'
  if (avgMs < TIER_THRESHOLDS_MS.very_fast) return 'very_fast'
  if (avgMs < TIER_THRESHOLDS_MS.fast) return 'fast'
  if (avgMs < TIER_THRESHOLDS_MS.medium) return 'medium'
  return 'slow'
}

function avgRecentIntervalMs(samples: number[], maxIntervals = 5): number {
  if (samples.length < 2) return Number.POSITIVE_INFINITY
  const intervalCount = Math.max(1, Math.min(maxIntervals, samples.length - 1))
  let sum = 0
  for (let i = samples.length - intervalCount; i < samples.length; i++) {
    sum += samples[i] - samples[i - 1]
  }
  return sum / intervalCount
}

function effectiveIntervalMs(samples: number[]): number {
  if (samples.length < 2) return Number.POSITIVE_INFINITY
  const avg = avgRecentIntervalMs(samples, 5)
  const last = samples[samples.length - 1] - samples[samples.length - 2]
  if (!Number.isFinite(last)) return avg
  // React quickly to bursts: let the most recent interval pull the tier upward.
  return Math.min(avg, last * 1.1)
}

function keepRecent(samples: number[], now: number, windowMs: number, maxCount: number) {
  const out = samples.filter((t) => now - t <= windowMs)
  if (out.length > maxCount) return out.slice(out.length - maxCount)
  return out
}

export type SpritePlayback = {
  rowIndex: number
  frameIntervalMs: number
  animate: boolean
}

export function useSpritePlayback(opts: {
  enabled: boolean
  hitSignal?: number
  isDragging: boolean
  isHovered: boolean
}): SpritePlayback {
  const { enabled, hitSignal, isDragging, isHovered } = opts

  const [playback, setPlayback] = useState<SpritePlayback>({
    rowIndex: DEFAULT_IDLE_ROW,
    frameIntervalMs: 120,
    animate: false,
  })

  const lastEventAtRef = useRef<number>(0)
  const eventTimesRef = useRef<number[]>([])
  const lastHitSignalRef = useRef<number>(0)

  const config = useMemo(() => {
    return {
      activeRows: [...DEFAULT_ACTIVE_ROWS],
      dragRow: DEFAULT_DRAG_ROW,
      activeHoldMs: 1600,
      eventWindowMs: 2200,
      tierIntervalsMs: {
        slow: 140,
        medium: 120,
        fast: 95,
        very_fast: 80,
      } satisfies Record<SpeedTier, number>,
      tierRow: {
        slow: 1,
        medium: 2,
        fast: 4,
        very_fast: 5,
      } satisfies Record<SpeedTier, number>,
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      const next = { rowIndex: DEFAULT_IDLE_ROW, frameIntervalMs: 140, animate: false }
      setPlayback((prev) =>
        prev.rowIndex === next.rowIndex && prev.frameIntervalMs === next.frameIntervalMs && prev.animate === next.animate
          ? prev
          : next
      )
      return
    }
    if (isDragging) {
      const next = { rowIndex: config.dragRow, frameIntervalMs: 90, animate: true }
      setPlayback((prev) =>
        prev.rowIndex === next.rowIndex && prev.frameIntervalMs === next.frameIntervalMs && prev.animate === next.animate
          ? prev
          : next
      )
      return
    }

    const signal = Number(hitSignal ?? 0)
    if (!Number.isFinite(signal) || signal <= 0) return
    if (signal === lastHitSignalRef.current) return
    lastHitSignalRef.current = signal

    const now = signal
    lastEventAtRef.current = now
    eventTimesRef.current = keepRecent([...eventTimesRef.current, now], now, config.eventWindowMs, 12)
  }, [config.dragRow, config.eventWindowMs, enabled, hitSignal, isDragging])

  useEffect(() => {
    if (!enabled) return

    const tick = () => {
      const now = Date.now()

      if (isDragging) {
        const next = { rowIndex: config.dragRow, frameIntervalMs: 90, animate: true }
        setPlayback((prev) =>
          prev.rowIndex === next.rowIndex && prev.frameIntervalMs === next.frameIntervalMs && prev.animate === next.animate
            ? prev
            : next
        )
        return
      }

      const since = now - (lastEventAtRef.current || 0)
      const hasRecentEvent = lastEventAtRef.current > 0 && since <= config.activeHoldMs

      if (hasRecentEvent) {
        const samples = keepRecent(eventTimesRef.current, now, config.eventWindowMs, 12)
        eventTimesRef.current = samples
        const intervalMs = effectiveIntervalMs(samples)
        const tier = tierByAvgIntervalMs(intervalMs)
        const next = {
          rowIndex: config.tierRow[tier],
          frameIntervalMs: config.tierIntervalsMs[tier],
          animate: true,
        }
        setPlayback((prev) =>
          prev.rowIndex === next.rowIndex && prev.frameIntervalMs === next.frameIntervalMs && prev.animate === next.animate
            ? prev
            : next
        )
        return
      }

      const rowIndex = isHovered ? DEFAULT_HOVER_IDLE_ROW : DEFAULT_IDLE_ROW
      // Match the reference behavior: idle stays on frame 0 (no frame-advance),
      // with an optional hover-only animation if desired.
      const next = { rowIndex, frameIntervalMs: 140, animate: isHovered }
      setPlayback((prev) =>
        prev.rowIndex === next.rowIndex && prev.frameIntervalMs === next.frameIntervalMs && prev.animate === next.animate
          ? prev
          : next
      )
    }

    tick()
    const id = window.setInterval(tick, 220)
    return () => window.clearInterval(id)
  }, [config, enabled, isDragging, isHovered])

  return playback
}
