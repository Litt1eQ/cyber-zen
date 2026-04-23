import { useEffect, useRef } from 'react'
import { listen } from '@tauri-apps/api/event'
import { EVENTS } from '@/types/events'
import type { Live2DInputEvent, ModelSpeedConfig, SpeedTierConfig } from '@/types/live2d'
import {
  LIVE2D_IDLE_RESET_MS,
  LIVE2D_TAP_THROTTLE_MS,
  nextSpeedTier,
  type SpeedTier,
} from './live2dInputSpeed'

const LEFT_KEYS = new Set([
  'Backquote',
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Digit5',
  'Tab',
  'KeyQ',
  'KeyW',
  'KeyE',
  'KeyR',
  'KeyT',
  'CapsLock',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyF',
  'KeyG',
  'ShiftLeft',
  'KeyZ',
  'KeyX',
  'KeyC',
  'KeyV',
  'KeyB',
  'ControlLeft',
  'AltLeft',
  'MetaLeft',
])

type UseLive2DInputOptions = {
  enabled: boolean
  modelUuid: string | null
  speedConfig: ModelSpeedConfig | null
  getParamRange: (id: string) => { min: number; max: number } | null
  setParam: (id: string, value: number) => void
  paramOverridesRef: React.RefObject<Record<string, number | null>>
  triggerTapMotion: () => Promise<void>
  triggerMotion: (group: string, no: number) => Promise<void>
  setExpression: (index: number | null) => void
}

function pickItem(
  config: SpeedTierConfig,
  tier: SpeedTier,
  tierIndexRef: React.MutableRefObject<Record<SpeedTier, number>>,
) {
  if (config.items.length === 0) return null
  if (config.mode === 'random') {
    return config.items[Math.floor(Math.random() * config.items.length)]
  }

  const currentIndex = tierIndexRef.current[tier] % config.items.length
  const item = config.items[currentIndex]
  tierIndexRef.current = {
    ...tierIndexRef.current,
    [tier]: tierIndexRef.current[tier] + 1,
  }
  return item
}

export function useLive2DInput({
  enabled,
  modelUuid,
  speedConfig,
  getParamRange,
  setParam,
  paramOverridesRef,
  triggerTapMotion,
  triggerMotion,
  setExpression,
}: UseLive2DInputOptions) {
  const pressedLeftRef = useRef<Set<string>>(new Set())
  const pressedRightRef = useRef<Set<string>>(new Set())
  const keyTimestampsRef = useRef<number[]>([])
  const currentTierRef = useRef<SpeedTier | null>(null)
  const tapThrottleRef = useRef(false)
  const tapThrottleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tierIndexRef = useRef<Record<SpeedTier, number>>({
    slow: 0,
    medium: 0,
    fast: 0,
    very_fast: 0,
  })

  const setHandDown = (isLeft: boolean, value: number) => {
    setParam(isLeft ? 'ParamHandL' : 'ParamHandR', value)
    setParam(isLeft ? 'CatParamLeftHandDown' : 'CatParamRightHandDown', value)
  }

  useEffect(() => {
    if (!enabled) {
      pressedLeftRef.current.clear()
      pressedRightRef.current.clear()
      keyTimestampsRef.current = []
      currentTierRef.current = null
      tapThrottleRef.current = false
      if (tapThrottleTimerRef.current !== null) {
        clearTimeout(tapThrottleTimerRef.current)
        tapThrottleTimerRef.current = null
      }
      if (idleTimerRef.current !== null) {
        clearTimeout(idleTimerRef.current)
        idleTimerRef.current = null
      }
      setHandDown(true, 0)
      setHandDown(false, 0)
      tierIndexRef.current = { slow: 0, medium: 0, fast: 0, very_fast: 0 }
      setParam('ParamMouseX', 0)
      setParam('ParamMouseY', 0)
      setParam('ParamAngleZ', 0)
      setParam('ParamMouseLeftDown', 0)
      setParam('ParamMouseRightDown', 0)
      setExpression(null)
      return
    }

    const unlistenPromise = listen<Live2DInputEvent>(EVENTS.LIVE2D_INPUT_EVENT, (event) => {
      const payload = event.payload
      if (payload.kind === 'mouse_move') {
        const overrides = paramOverridesRef.current ?? {}
        const xRatio = (payload.x + 1) / 2
        const yRatio = (1 - payload.y) / 2

        const setMappedParam = (id: string) => {
          if (overrides[id] != null) return

          const range = getParamRange(id)
          if (!range) return

          const isXAxis = id.endsWith('X')
          const isZAxis = id.endsWith('Z')

          let value: number

          if (isZAxis) {
            const dragX = -payload.x
            const dragY = payload.y
            value = dragX * dragY * range.min
          } else {
            const ratio = isXAxis ? xRatio : yRatio
            value = range.max - ratio * (range.max - range.min)
          }

          setParam(id, value)
        }

        for (const id of [
          'ParamMouseX',
          'ParamMouseY',
          'ParamAngleX',
          'ParamAngleY',
          'ParamAngleZ',
          'ParamEyeBallX',
          'ParamEyeBallY',
        ]) {
          setMappedParam(id)
        }
        return
      }

      if (payload.kind === 'mouse_button_down') {
        setParam(payload.button === 'Left' ? 'ParamMouseLeftDown' : 'ParamMouseRightDown', 1)
        return
      }

      if (payload.kind === 'mouse_button_up') {
        setParam(payload.button === 'Left' ? 'ParamMouseLeftDown' : 'ParamMouseRightDown', 0)
        return
      }

      const isLeft = LEFT_KEYS.has(payload.code)
      const pressedRef = isLeft ? pressedLeftRef : pressedRightRef
      if (payload.kind === 'key_down') {
        pressedRef.current.add(payload.code)
        setHandDown(isLeft, 1)

        const nextState = nextSpeedTier(keyTimestampsRef.current, Date.now())
        keyTimestampsRef.current = nextState.timestamps
        if (nextState.tier !== currentTierRef.current) {
          currentTierRef.current = nextState.tier
          if (speedConfig) {
            const tierConfig = speedConfig[nextState.tier]
            const item = pickItem(tierConfig, nextState.tier, tierIndexRef)
            if (item?.type === 'expression') {
              setExpression(item.index)
            } else if (item?.type === 'motion') {
              void triggerMotion(item.group, item.no).catch(() => {})
            }
          }
        }

        if (!tapThrottleRef.current) {
          tapThrottleRef.current = true
          void triggerTapMotion().catch(() => {})
          tapThrottleTimerRef.current = setTimeout(() => {
            tapThrottleRef.current = false
            tapThrottleTimerRef.current = null
          }, LIVE2D_TAP_THROTTLE_MS)
        }

        if (idleTimerRef.current !== null) {
          clearTimeout(idleTimerRef.current)
        }
        idleTimerRef.current = setTimeout(() => {
          currentTierRef.current = null
          keyTimestampsRef.current = []
          tierIndexRef.current = { slow: 0, medium: 0, fast: 0, very_fast: 0 }
          setExpression(null)
          idleTimerRef.current = null
        }, LIVE2D_IDLE_RESET_MS)
        return
      }

      pressedRef.current.delete(payload.code)
      setHandDown(isLeft, pressedRef.current.size > 0 ? 1 : 0)
    })

    return () => {
      pressedLeftRef.current.clear()
      pressedRightRef.current.clear()
      keyTimestampsRef.current = []
      currentTierRef.current = null
      tapThrottleRef.current = false
      if (tapThrottleTimerRef.current !== null) {
        clearTimeout(tapThrottleTimerRef.current)
        tapThrottleTimerRef.current = null
      }
      if (idleTimerRef.current !== null) {
        clearTimeout(idleTimerRef.current)
        idleTimerRef.current = null
      }
      setHandDown(true, 0)
      setHandDown(false, 0)
      tierIndexRef.current = { slow: 0, medium: 0, fast: 0, very_fast: 0 }
      setParam('ParamMouseX', 0)
      setParam('ParamMouseY', 0)
      setParam('ParamAngleZ', 0)
      setParam('ParamMouseLeftDown', 0)
      setParam('ParamMouseRightDown', 0)
      setExpression(null)
      void unlistenPromise.then((fn) => fn()).catch(() => {})
    }
  }, [enabled, getParamRange, modelUuid, paramOverridesRef, setExpression, setParam, speedConfig, triggerMotion, triggerTapMotion])
}
