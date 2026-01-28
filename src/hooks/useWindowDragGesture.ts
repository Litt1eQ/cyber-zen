import { useCallback, useMemo, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'

export type WindowDragGestureOptions = {
  enabled?: boolean
  thresholdPx?: number
  holdMs?: number
  shouldTrack?: (event: ReactPointerEvent) => boolean
  onDragStateChange?: (dragging: boolean) => void
}

export function useWindowDragGesture(options: WindowDragGestureOptions = {}) {
  const enabled = options.enabled ?? true
  const thresholdPx = options.thresholdPx ?? 8
  const holdMs = Math.max(0, Math.round(options.holdMs ?? 0))
  const onDragStateChange = options.onDragStateChange
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
  const pointerDownRef = useRef(false)
  const pointerCaptureTargetRef = useRef<HTMLElement | null>(null)
  const pointerIdRef = useRef<number | null>(null)

  const reset = useCallback(() => {
    dragOriginRef.current = null
    if (dragStartedRef.current) onDragStateChange?.(false)
    dragStartedRef.current = false
    pointerDownAtRef.current = null
    pointerDownRef.current = false
    const target = pointerCaptureTargetRef.current
    const pointerId = pointerIdRef.current
    pointerCaptureTargetRef.current = null
    pointerIdRef.current = null
    if (target && pointerId != null) {
      try {
        target.releasePointerCapture(pointerId)
      } catch {
        // ignore
      }
    }
  }, [onDragStateChange])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      if (!enabled) return
      if (!shouldTrack(event)) return

      dragStartedRef.current = false
      onDragStateChange?.(false)
      ignoreClickRef.current = false
      dragOriginRef.current = { x: event.clientX, y: event.clientY }
      pointerDownAtRef.current = performance.now()
      pointerDownRef.current = true

      // Keep receiving pointermove even if the cursor leaves the element quickly.
      const target = event.currentTarget as unknown as HTMLElement | null
      if (target && typeof (target as any).setPointerCapture === 'function') {
        try {
          target.setPointerCapture(event.pointerId)
          pointerCaptureTargetRef.current = target
          pointerIdRef.current = event.pointerId
        } catch {
          // ignore
        }
      }
    },
    [enabled, onDragStateChange, shouldTrack]
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

      // Some WebView environments may report `buttons=0` during pointermove.
      // Rely on our own pointer-down tracking instead of `event.buttons`.
      if (event.pointerType === 'mouse' && !pointerDownRef.current) return

      const dx = event.clientX - origin.x
      const dy = event.clientY - origin.y
      if (dx * dx + dy * dy < thresholdPx * thresholdPx) return

      // In Tauri, calling `startDragging()` on pointer-down can swallow the click.
      // Start dragging only after the pointer actually moves.
      dragStartedRef.current = true
      onDragStateChange?.(true)
      ignoreClickRef.current = true
      void getCurrentWindow()
        .startDragging()
        .catch(() => {
          // ignore
        })
    },
    [enabled, holdMs, onDragStateChange, thresholdPx]
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
