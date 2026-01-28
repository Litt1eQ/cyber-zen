import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChromaKeyAlgorithm, ChromaKeyOptions, CustomMood } from '@/sprites/spriteCore'
import { buildProcessedSheetFromSrc, drawFrameToCanvas, moodToFrameIntervalMs } from '@/sprites/spriteAnimation'

export function SpriteSheetCanvas({
  src,
  size,
  columns,
  rows,
  mood,
  speed = 1,
  rowIndex,
  animate,
  frameIntervalMs,
  chromaKey = true,
  chromaKeyAlgorithm = 'classic',
  chromaKeyOptions,
  imageSmoothingEnabled = true,
  removeGridLines = true,
  className,
  idleBreathe = true,
  onError,
  effect = 'none',
}: {
  src: string
  size: number
  columns?: number
  rows?: number
  mood: CustomMood
  speed?: number
  rowIndex?: number
  animate?: boolean
  frameIntervalMs?: number
  chromaKey?: boolean
  chromaKeyAlgorithm?: ChromaKeyAlgorithm
  chromaKeyOptions?: ChromaKeyOptions
  imageSmoothingEnabled?: boolean
  removeGridLines?: boolean
  className?: string
  idleBreathe?: boolean
  onError?: (err: Error) => void
  effect?: 'none' | 'glow'
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const frameIndexRef = useRef(0)
  const intervalRef = useRef<number | null>(null)
  const [sheetState, setSheetState] = useState<{
    sheet: HTMLCanvasElement
    frameWidth: number
    frameHeight: number
    columns: number
  } | null>(null)

  const intervalMs = useMemo(() => frameIntervalMs ?? moodToFrameIntervalMs(mood, speed), [frameIntervalMs, mood, speed])
  const shouldAnimate = animate ?? mood !== 'idle'

  useEffect(() => {
    let cancelled = false
    setSheetState(null)
    frameIndexRef.current = 0
    if (intervalRef.current != null) window.clearInterval(intervalRef.current)
    intervalRef.current = null

    void (async () => {
      try {
        const processed = await buildProcessedSheetFromSrc({
          src,
          columns,
          rows,
          chromaKey,
          chromaKeyAlgorithm,
          chromaKeyOptions,
          imageSmoothingEnabled,
          removeGridLines,
        })
        if (cancelled) return
        setSheetState({
          sheet: processed.sheet,
          frameWidth: processed.frameWidth,
          frameHeight: processed.frameHeight,
          columns: processed.columns,
        })
      } catch (e) {
        if (cancelled) return
        onError?.(e instanceof Error ? e : new Error(String(e)))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [chromaKey, chromaKeyAlgorithm, chromaKeyOptions, columns, imageSmoothingEnabled, onError, removeGridLines, rows, src])

  const draw = useMemo(() => {
    if (!sheetState) return null
    return () => {
      const canvas = canvasRef.current
      if (!canvas) return
      drawFrameToCanvas({
        canvas,
        sheet: sheetState.sheet,
        frameWidth: sheetState.frameWidth,
        frameHeight: sheetState.frameHeight,
        frameIndex: frameIndexRef.current,
        mood,
        rowIndex,
        size,
        columns: sheetState.columns,
        imageSmoothingEnabled,
      })
    }
  }, [imageSmoothingEnabled, mood, rowIndex, sheetState, size])

  useEffect(() => {
    if (!draw) return
    frameIndexRef.current = 0
    draw()
  }, [draw, mood, size])

  useEffect(() => {
    if (!draw) return

    const stop = () => {
      if (intervalRef.current != null) window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    const start = () => {
      stop()
      const hidden = typeof document !== 'undefined' && typeof document.hidden === 'boolean' ? document.hidden : false
      if (!shouldAnimate || hidden) return

      const frameCount = sheetState?.columns ?? 8
      intervalRef.current = window.setInterval(() => {
        frameIndexRef.current = (frameIndexRef.current + 1) % frameCount
        draw()
      }, intervalMs)
    }

    const hidden = typeof document !== 'undefined' && typeof document.hidden === 'boolean' ? document.hidden : false
    if (!shouldAnimate || hidden) {
      stop()
      frameIndexRef.current = 0
      draw()
    } else {
      start()
    }

    const onVisibility = () => {
      frameIndexRef.current = 0
      draw()
      start()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      stop()
    }
  }, [draw, intervalMs, sheetState?.columns, shouldAnimate])

  return (
    <div
      className={[
        'select-none',
        className ?? '',
        idleBreathe && mood === 'idle' ? 'cz-sprite-idle-breathe' : '',
        effect === 'glow' && mood !== 'idle' ? 'cz-sprite-hit-glow' : '',
      ].join(' ')}
      style={{ width: size, height: 'auto' }}
    >
      <canvas ref={canvasRef} className="block select-none" />
    </div>
  )
}
