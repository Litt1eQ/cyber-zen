import { useEffect, useMemo, useRef, useState } from 'react'

const DEFAULT_IDLE_ROW = 3
const DEFAULT_HOVER_IDLE_ROW = 0
const DEFAULT_ACTIVE_ROWS = [1, 2, 4, 5] as const
const DEFAULT_DRAG_ROW = 6

type SpeedTier = 'slow' | 'medium' | 'fast' | 'very_fast'

function tierByAvgIntervalMs(avgMs: number): SpeedTier {
  if (!Number.isFinite(avgMs)) return 'slow'
  if (avgMs < 160) return 'very_fast'
  if (avgMs < 320) return 'fast'
  if (avgMs < 640) return 'medium'
  return 'slow'
}

function avgIntervalMs(samples: number[]): number {
  if (samples.length < 2) return Number.POSITIVE_INFINITY
  let sum = 0
  for (let i = 1; i < samples.length; i++) sum += samples[i] - samples[i - 1]
  return sum / Math.max(1, samples.length - 1)
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
  isAnimating: boolean
  isDragging: boolean
  isHovered: boolean
}): SpritePlayback {
  const { enabled, isAnimating, isDragging, isHovered } = opts

  const [playback, setPlayback] = useState<SpritePlayback>({
    rowIndex: DEFAULT_IDLE_ROW,
    frameIntervalMs: 120,
    animate: false,
  })

  const prevAnimatingRef = useRef(false)
  const lastEventAtRef = useRef<number>(0)
  const eventTimesRef = useRef<number[]>([])

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

    const now = Date.now()
    const wasAnimating = prevAnimatingRef.current
    prevAnimatingRef.current = isAnimating
    if (!wasAnimating && isAnimating) {
      lastEventAtRef.current = now
      eventTimesRef.current = keepRecent([...eventTimesRef.current, now], now, config.eventWindowMs, 12)
    }
  }, [config.dragRow, config.eventWindowMs, enabled, isAnimating, isDragging])

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
        const avgMs = avgIntervalMs(samples)
        const tier = tierByAvgIntervalMs(avgMs)
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
