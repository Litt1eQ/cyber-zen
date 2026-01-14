import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type UseAutoFadeParams = {
  enabled: boolean
  activeOpacity: number
  idleOpacity: number
  delayMs: number
  durationMs: number
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

export function useAutoFade(params: UseAutoFadeParams) {
  const enabled = params.enabled
  const activeOpacity = clamp(params.activeOpacity, 0, 1)
  const idleOpacity = clamp(params.idleOpacity, 0, 1)
  const delayMs = Math.max(0, Math.round(params.delayMs))
  const durationMs = Math.max(0, Math.round(params.durationMs))

  const [hovered, setHovered] = useState(false)
  const [opacity, setOpacity] = useState(activeOpacity)
  const timerRef = useRef<number | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current == null) return
    window.clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  useEffect(() => {
    if (!enabled) {
      clearTimer()
      setOpacity(activeOpacity)
      return
    }

    if (hovered) {
      clearTimer()
      setOpacity(activeOpacity)
      return
    }

    clearTimer()
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      setOpacity(Math.min(idleOpacity, activeOpacity))
    }, delayMs)

    return clearTimer
  }, [activeOpacity, clearTimer, delayMs, enabled, hovered, idleOpacity])

  useEffect(() => clearTimer, [clearTimer])

  const bind = useMemo(
    () => ({
      onPointerEnter: () => setHovered(true),
      onPointerLeave: () => setHovered(false),
    }),
    []
  )

  const style = useMemo(
    () => ({
      opacity,
      transition: `opacity ${durationMs}ms ease`,
    }),
    [durationMs, opacity]
  )

  return { opacity, style, bind, hovered }
}

