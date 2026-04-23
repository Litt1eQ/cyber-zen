import { useEffect, useMemo, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useWindowDragGesture } from '@/hooks/useWindowDragGesture'
import { useLive2DStore } from '@/stores/useLive2DStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import type { Live2DSkinId } from '@/components/WoodenFish/skins'
import type { Live2DActionEvent } from '@/types/live2d'
import { EVENTS } from '@/types/events'
import { useLive2DRenderer } from './useLive2DRenderer'
import { useLive2DInput } from './useLive2DInput'
import { useLive2DResources } from './useLive2DResources'

type Live2DCanvasProps = {
  skinId: Live2DSkinId
  onHit: () => void | Promise<void>
  dragEnabled?: boolean
  dragHoldMs?: number
}

export function Live2DCanvas({
  skinId,
  onHit,
  dragEnabled = true,
  dragHoldMs = 0,
}: Live2DCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hitCooldownRef = useRef(false)
  const models = useLive2DStore((state) => state.models)
  const loadModels = useLive2DStore((state) => state.loadModels)
  const isReady = useLive2DStore((state) => state.isReady)
  const isLoading = useLive2DStore((state) => state.isLoading)
  const error = useLive2DStore((state) => state.error)
  const settings = useSettingsStore((state) => state.settings)
  const { load, triggerTapMotion, triggerMotion, getParamRange, setParam, setExpression } = useLive2DRenderer(canvasRef)
  const dragGesture = useWindowDragGesture({
    enabled: dragEnabled,
    holdMs: dragHoldMs,
  })
  const paramOverridesRef = useRef<Record<string, number | null>>({})

  const uuid = skinId.slice('live2d:'.length)
  const model = useMemo(() => models.find((entry) => entry.uuid === uuid) ?? null, [models, uuid])
  const [isRefreshingMissingModel, setIsRefreshingMissingModel] = useState(() => model == null)
  const speedConfig = useMemo(() => settings?.live2d_speed_configs?.[uuid] ?? null, [settings, uuid])
  const { backgroundSrc, overlaySrcs } = useLive2DResources(model?.uuid ?? null, isReady)

  useEffect(() => {
    if (!model) return
    void load(model.uuid, model.model_path)
  }, [load, model])

  useEffect(() => {
    let cancelled = false

    if (model) {
      setIsRefreshingMissingModel(false)
      return () => {
        cancelled = true
      }
    }

    setIsRefreshingMissingModel(true)
    void loadModels()
      .catch(() => {})
      .finally(() => {
        if (cancelled) return
        setIsRefreshingMissingModel(false)
      })

    return () => {
      cancelled = true
    }
  }, [loadModels, model, uuid])

  useEffect(() => {
    paramOverridesRef.current = {}
  }, [uuid])

  useEffect(() => {
    const unlistenPromise = listen<Live2DActionEvent>(EVENTS.LIVE2D_ACTION_EVENT, (event) => {
      const action = event.payload
      if (action.kind === 'trigger_motion') {
        void triggerMotion(action.group, action.no).catch(() => {})
        return
      }

      if (action.kind === 'set_expression') {
        setExpression(action.index)
        return
      }

      paramOverridesRef.current[action.id] = action.value
      if (action.value !== null) {
        setParam(action.id, action.value)
      }
    })

    return () => {
      void unlistenPromise.then((fn) => fn()).catch(() => {})
    }
  }, [setExpression, setParam, triggerMotion])

  useLive2DInput({
    enabled: isReady,
    modelUuid: uuid,
    speedConfig,
    getParamRange,
    setParam,
    paramOverridesRef,
    triggerTapMotion,
    triggerMotion,
    setExpression,
  })

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <div
        className="relative w-full h-full cursor-pointer select-none"
        onPointerDown={dragGesture.onPointerDown}
        onPointerMove={dragGesture.onPointerMove}
        onPointerUp={(event) => {
          dragGesture.onPointerUp()
          if (event.button !== 0) return
          if (dragGesture.consumeIgnoreClick()) return
          if (hitCooldownRef.current) return

          hitCooldownRef.current = true
          queueMicrotask(() => {
            hitCooldownRef.current = false
          })

          void triggerTapMotion().catch(() => {})
          void Promise.resolve(onHit()).catch(() => {})
        }}
        onPointerCancel={dragGesture.onPointerCancel}
        onPointerLeave={dragGesture.onPointerLeave}
      >
        {backgroundSrc ? (
          <img
            src={backgroundSrc}
            alt=""
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
            draggable={false}
          />
        ) : null}

        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          style={{ display: 'block' }}
        />

        {overlaySrcs.map((src) => (
          <img
            key={src}
            src={src}
            alt=""
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
            draggable={false}
          />
        ))}

        {!model && !isLoading && !isRefreshingMissingModel ? (
          <Live2DStatusOverlay text="当前 Live2D 模型不存在，请重新选择或导入。" tone="error" />
        ) : null}
        {(isLoading && models.length === 0) || isRefreshingMissingModel ? (
          <Live2DStatusOverlay text="正在加载 Live2D 模型列表…" tone="muted" />
        ) : null}
        {error ? <Live2DStatusOverlay text={error} tone="error" /> : null}
      </div>
    </div>
  )
}

function Live2DStatusOverlay({
  text,
  tone,
}: {
  text: string
  tone: 'muted' | 'error'
}) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-end justify-center p-4">
      <div
        className={[
          'max-w-[260px] rounded-xl border px-3 py-2 text-center text-xs shadow-sm backdrop-blur-sm',
          tone === 'error'
            ? 'border-red-200 bg-white/90 text-red-700'
            : 'border-slate-200 bg-white/85 text-slate-600',
        ].join(' ')}
      >
        {text}
      </div>
    </div>
  )
}
