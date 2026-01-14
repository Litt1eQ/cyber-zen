import { useCallback, useMemo, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'

export type WindowDragGestureOptions = {
  enabled?: boolean
  thresholdPx?: number
  holdMs?: number
  shouldTrack?: (event: ReactPointerEvent) => boolean
}

export function useWindowDragGesture(options: WindowDragGestureOptions = {}) {
  const enabled = options.enabled ?? true
  const thresholdPx = options.thresholdPx ?? 8
  const holdMs = Math.max(0, Math.round(options.holdMs ?? 0))
  const shouldTrack = useMemo(
    () =>
      options.shouldTrack ??
      ((event: ReactPointerEvent) => event.button === 0 && event.pointerType !== 'touch'),
    [options.shouldTrack]
  )

  const dragStartedRef = useRef(false)
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null)
  const ignoreClickRef = useRef(false)
  const pointerDownAtRef = useRef<number | null>(null)

  const reset = useCallback(() => {
    dragOriginRef.current = null
    dragStartedRef.current = false
    pointerDownAtRef.current = null
  }, [])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      if (!enabled) return
      if (!shouldTrack(event)) return

      dragStartedRef.current = false
      ignoreClickRef.current = false
      dragOriginRef.current = { x: event.clientX, y: event.clientY }
      pointerDownAtRef.current = performance.now()
    },
    [enabled, shouldTrack]
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent) => {
      if (!enabled) return
      if (dragStartedRef.current) return

      const origin = dragOriginRef.current
      if (!origin) return

      const pointerDownAt = pointerDownAtRef.current
      if (pointerDownAt != null && holdMs > 0 && performance.now() - pointerDownAt < holdMs) {
        return
      }

      // For mouse, left button must remain down while dragging.
      if (event.pointerType === 'mouse' && (event.buttons & 1) !== 1) return

      const dx = event.clientX - origin.x
      const dy = event.clientY - origin.y
      if (dx * dx + dy * dy < thresholdPx * thresholdPx) return

      // In Tauri, calling `startDragging()` on pointer-down can swallow the click.
      // Start dragging only after the pointer actually moves.
      dragStartedRef.current = true
      ignoreClickRef.current = true
      void getCurrentWindow()
        .startDragging()
        .catch(() => {
          // ignore
        })
    },
    [enabled, holdMs, thresholdPx]
  )

  const consumeIgnoreClick = useCallback(() => {
    if (!ignoreClickRef.current) return false
    ignoreClickRef.current = false
    return true
  }, [])

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: reset,
    onPointerCancel: reset,
    onPointerLeave: reset,
    consumeIgnoreClick,
  }
}
