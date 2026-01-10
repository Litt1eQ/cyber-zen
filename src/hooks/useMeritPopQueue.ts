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

export function useMeritPopQueue(getOrigin?: () => { x: number; y: number }) {
  const [active, setActive] = useState<MeritPopItem[]>([])
  const getOriginRef = useRef(getOrigin)
  const queueRef = useRef<Array<{ value: number; source?: InputEvent['source'] }>>([])
  const overflowRef = useRef(0)
  const activeRef = useRef<MeritPopItem | null>(null)
  const pumpTimerRef = useRef<number | null>(null)
  const runningRef = useRef(false)
  const cleanupTimersRef = useRef<number[]>([])

  useEffect(() => {
    getOriginRef.current = getOrigin
  }, [getOrigin])

  const stop = useCallback(() => {
    runningRef.current = false
    if (pumpTimerRef.current != null) {
      window.clearTimeout(pumpTimerRef.current)
      pumpTimerRef.current = null
    }
  }, [])

  const pump = useCallback(() => {
    if (runningRef.current) return
    runningRef.current = true

    const step = () => {
      if (!runningRef.current) return

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
      const id = `${Date.now()}-${Math.random()}`

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

      const cleanupId = window.setTimeout(() => {
        if (activeRef.current?.id === id) activeRef.current = null
        setActive((prev) => prev.filter((p) => p.id !== id))
        pumpTimerRef.current = window.setTimeout(step, POP_GAP_MS)
      }, POP_LIFETIME_MS)

      cleanupTimersRef.current.push(cleanupId)
    }

    step()
  }, [getOrigin, stop])

  const enqueue = useCallback(
    (value: number, source?: InputEvent['source']) => {
      if (value <= 0) return

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

      pump()
    },
    [pump]
  )

  useEffect(() => {
    return () => {
      stop()
      for (const id of cleanupTimersRef.current) window.clearTimeout(id)
      cleanupTimersRef.current = []
      queueRef.current = []
      overflowRef.current = 0
      activeRef.current = null
    }
  }, [stop])

  return { active, enqueue }
}
