import { useCallback, useEffect, useRef, useState } from 'react'
import type { InputEvent } from '../types/merit'

export interface MeritPopItem {
  id: string
  x: number
  y: number
  value: number
  source?: InputEvent['source']
  createdAt: number
}

const POP_LIFETIME_MS = 1100
const MAX_QUEUE = 80
const POP_GAP_MS = 40
const COALESCE_WINDOW_MS = 1000
const MAX_DIGIT = 9
const POP_STALE_TTL_MS = POP_LIFETIME_MS * 2
const POP_RECOVERY_GRACE_MS = 250

export function useMeritPopQueue(getOrigin?: () => { x: number; y: number }) {
  const [active, setActive] = useState<MeritPopItem[]>([])
  const getOriginRef = useRef(getOrigin)
  const queueRef = useRef<Array<{ value: number; source?: InputEvent['source'] }>>([])
  const overflowRef = useRef(0)
  const activeRef = useRef<MeritPopItem | null>(null)
  const pumpTimerRef = useRef<number | null>(null)
  const activeCleanupTimerRef = useRef<number | null>(null)
  const runningRef = useRef(false)

  useEffect(() => {
    getOriginRef.current = getOrigin
  }, [getOrigin])

  const clearPumpTimer = useCallback(() => {
    if (pumpTimerRef.current != null) {
      window.clearTimeout(pumpTimerRef.current)
      pumpTimerRef.current = null
    }
  }, [])

  const clearActiveCleanupTimer = useCallback(() => {
    if (activeCleanupTimerRef.current != null) {
      window.clearTimeout(activeCleanupTimerRef.current)
      activeCleanupTimerRef.current = null
    }
  }, [])

  const stop = useCallback(() => {
    runningRef.current = false
    clearPumpTimer()
  }, [clearPumpTimer])

  const pruneStaleActive = useCallback(() => {
    const current = activeRef.current
    if (!current) return false

    const age = Date.now() - current.createdAt
    if (age <= POP_STALE_TTL_MS) return false

    clearActiveCleanupTimer()
    clearPumpTimer()
    runningRef.current = false
    activeRef.current = null
    setActive((prev) => prev.filter((p) => p.id !== current.id))
    return true
  }, [clearActiveCleanupTimer, clearPumpTimer])

  const recoverIfStalled = useCallback(() => {
    const current = activeRef.current
    const now = Date.now()

    if (current) {
      const age = now - current.createdAt
      if (activeCleanupTimerRef.current == null && age > POP_LIFETIME_MS + POP_RECOVERY_GRACE_MS) {
        clearActiveCleanupTimer()
        clearPumpTimer()
        runningRef.current = false
        activeRef.current = null
        setActive((prev) => prev.filter((p) => p.id !== current.id))
        return true
      }
    }

    if (
      runningRef.current &&
      current == null &&
      pumpTimerRef.current == null &&
      activeCleanupTimerRef.current == null
    ) {
      runningRef.current = false
      return true
    }

    return false
  }, [clearActiveCleanupTimer, clearPumpTimer])

  // Watchdog: ensure pops don't get stuck on screen even if timers get clamped/paused
  // (e.g. when the event loop is blocked or the app is backgrounded).
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!activeRef.current) return
      recoverIfStalled()
      pruneStaleActive()
    }, 500)
    return () => window.clearInterval(id)
  }, [pruneStaleActive, recoverIfStalled])

  const pump = useCallback(() => {
    if (runningRef.current) return
    runningRef.current = true

    const step = () => {
      if (!runningRef.current) return
      recoverIfStalled()
      pruneStaleActive()

      let next = queueRef.current.shift()
      if (!next && overflowRef.current > 0) {
        const chunk = Math.min(MAX_DIGIT, overflowRef.current)
        overflowRef.current -= chunk
        next = { value: chunk }
      }
      if (!next) {
        stop()
        return
      }

      const origin = getOriginRef.current?.() ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 }
      const id = createPopId()

      const item: MeritPopItem = {
        id,
        x: origin.x,
        y: origin.y,
        value: next.value,
        source: next.source,
        createdAt: Date.now(),
      }

      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.debug('[cz] pop', {
          x: item.x,
          y: item.y,
          w: window.innerWidth,
          h: window.innerHeight,
          queued: queueRef.current.length,
        })
      }

      activeRef.current = item
      setActive([item])

      clearActiveCleanupTimer()
      activeCleanupTimerRef.current = window.setTimeout(() => {
        if (activeRef.current?.id === id) activeRef.current = null
        setActive((prev) => prev.filter((p) => p.id !== id))
        clearPumpTimer()
        pumpTimerRef.current = window.setTimeout(step, POP_GAP_MS)
      }, POP_LIFETIME_MS)
    }

    step()
  }, [clearActiveCleanupTimer, clearPumpTimer, pruneStaleActive, recoverIfStalled, stop])

  const enqueue = useCallback(
    (value: number, source?: InputEvent['source']) => {
      if (value <= 0) return
      recoverIfStalled()
      pruneStaleActive()

      let remaining = value
      const current = activeRef.current
      if (current && Date.now() - current.createdAt <= COALESCE_WINDOW_MS && current.value < MAX_DIGIT) {
        const addable = Math.min(MAX_DIGIT - current.value, remaining)
        if (addable > 0) {
          remaining -= addable
          const updated = { ...current, value: current.value + addable }
          activeRef.current = updated
          setActive((prev) => {
            const existing = prev[0]
            if (existing?.id === current.id) return [{ ...existing, value: updated.value }]
            return [updated]
          })
        }
      }

      if (remaining <= 0) {
        return
      }

      const queue = queueRef.current
      if (queue.length >= MAX_QUEUE) {
        overflowRef.current += remaining
      } else {
        // Keep each pop a single digit; split if needed.
        while (remaining > 0 && queue.length < MAX_QUEUE) {
          const chunk = remaining > MAX_DIGIT
            ? Math.min(MAX_DIGIT, 1 + Math.floor(Math.random() * MAX_DIGIT))
            : remaining
          queue.push({ value: chunk, source })
          remaining -= chunk
        }

        if (remaining > 0) {
          overflowRef.current += remaining
        }
      }

      if (
        runningRef.current &&
        activeRef.current == null &&
        pumpTimerRef.current == null &&
        activeCleanupTimerRef.current == null
      ) {
        runningRef.current = false
      }

      pump()
    },
    [pump, pruneStaleActive, recoverIfStalled]
  )

  useEffect(() => {
    return () => {
      stop()
      clearActiveCleanupTimer()
      queueRef.current = []
      overflowRef.current = 0
      activeRef.current = null
    }
  }, [clearActiveCleanupTimer, stop])

  useEffect(() => {
    const maybeRecover = () => {
      if (document.visibilityState === 'hidden') return
      const recovered = recoverIfStalled()
      const cleared = pruneStaleActive()
      if (cleared || recovered) {
        if (queueRef.current.length > 0 || overflowRef.current > 0) pump()
      }
    }

    document.addEventListener('visibilitychange', maybeRecover)
    window.addEventListener('focus', maybeRecover)
    return () => {
      document.removeEventListener('visibilitychange', maybeRecover)
      window.removeEventListener('focus', maybeRecover)
    }
  }, [pump, pruneStaleActive, recoverIfStalled])

  return { active, enqueue }
}

function createPopId() {
  try {
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
  } catch {
    return `${Date.now()}-${Math.random()}`
  }
}
