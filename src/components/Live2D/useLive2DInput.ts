import { useEffect, useRef } from 'react'
import { listen } from '@tauri-apps/api/event'
import { EVENTS } from '@/types/events'
import type { Live2DInputEvent } from '@/types/live2d'
import {
  findActionByShortcut,
  formatShortcutFromCode,
  isModifierCode,
  type ActiveModifiers,
  type Live2DActionShortcutMap,
} from '@/utils/live2dShortcuts'
import {
  LIVE2D_IDLE_RESET_MS,
  LIVE2D_TAP_THROTTLE_MS,
  nextSpeedTierState,
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
  actionShortcuts: Live2DActionShortcutMap
  setParam: (id: string, value: number) => void
  paramOverridesRef: React.RefObject<Record<string, number | null>>
  triggerTapMotion: () => Promise<void>
  triggerMotion: (group: string, no: number) => Promise<void>
  setExpression: (index: number | null) => void
}

export function useLive2DInput({
  enabled,
  modelUuid,
  actionShortcuts,
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
  const modifiersRef = useRef<ActiveModifiers>({ ctrl: false, alt: false, shift: false })
  const tapThrottleRef = useRef(false)
  const tapThrottleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      setParam('ParamHandL', 0)
      setParam('ParamHandR', 0)
      setExpression(null)
      return
    }

    const unlistenPromise = listen<Live2DInputEvent>(EVENTS.LIVE2D_INPUT_EVENT, (event) => {
      const payload = event.payload
      if (payload.kind === 'mouse_move') {
        const overrides = paramOverridesRef.current ?? {}
        if (overrides.ParamEyeBallX == null) setParam('ParamEyeBallX', payload.x)
        if (overrides.ParamEyeBallY == null) setParam('ParamEyeBallY', payload.y)
        if (overrides.ParamAngleX == null) setParam('ParamAngleX', payload.x * 30)
        if (overrides.ParamAngleY == null) setParam('ParamAngleY', payload.y * 30)
        return
      }

      if (payload.kind === 'key_down') {
        if (payload.code.startsWith('Control') || payload.code.startsWith('Meta')) modifiersRef.current.ctrl = true
        if (payload.code.startsWith('Alt')) modifiersRef.current.alt = true
        if (payload.code.startsWith('Shift')) modifiersRef.current.shift = true
      } else if (payload.kind === 'key_up') {
        if (payload.code.startsWith('Control') || payload.code.startsWith('Meta')) modifiersRef.current.ctrl = false
        if (payload.code.startsWith('Alt')) modifiersRef.current.alt = false
        if (payload.code.startsWith('Shift')) modifiersRef.current.shift = false
      }

      const isLeft = LEFT_KEYS.has(payload.code)
      const pressedRef = isLeft ? pressedLeftRef : pressedRightRef
      if (payload.kind === 'key_down') {
        pressedRef.current.add(payload.code)
        setParam(isLeft ? 'ParamHandL' : 'ParamHandR', 1)

        const nextState = nextSpeedTierState(keyTimestampsRef.current, Date.now())
        keyTimestampsRef.current = nextState.timestamps
        if (nextState.tier !== currentTierRef.current) {
          currentTierRef.current = nextState.tier
          setExpression(nextState.expressionIndex)
        }

        if (!isModifierCode(payload.code)) {
          const shortcut = formatShortcutFromCode(payload.code, modifiersRef.current)
          const actionKey = findActionByShortcut(actionShortcuts, shortcut, modelUuid)
          if (actionKey?.startsWith('motion:')) {
            const [, , group, no] = actionKey.split(':')
            const index = Number.parseInt(no, 10)
            if (!Number.isNaN(index)) {
              void triggerMotion(group, index).catch(() => {})
            }
          } else if (actionKey?.startsWith('expression:')) {
            const [, , index] = actionKey.split(':')
            const expressionIndex = Number.parseInt(index, 10)
            if (!Number.isNaN(expressionIndex)) {
              setExpression(expressionIndex)
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
          setExpression(null)
          idleTimerRef.current = null
        }, LIVE2D_IDLE_RESET_MS)
        return
      }

      pressedRef.current.delete(payload.code)
      setParam(isLeft ? 'ParamHandL' : 'ParamHandR', pressedRef.current.size > 0 ? 1 : 0)
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
      setParam('ParamHandL', 0)
      setParam('ParamHandR', 0)
      setExpression(null)
      void unlistenPromise.then((fn) => fn()).catch(() => {})
    }
  }, [actionShortcuts, enabled, modelUuid, paramOverridesRef, setExpression, setParam, triggerMotion, triggerTapMotion])
}
