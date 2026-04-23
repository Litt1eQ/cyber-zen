import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Live2DInputEvent } from '@/types/live2d'
import { useLive2DInput } from './useLive2DInput'

const listenMock = vi.fn()
let inputListener: ((event: { payload: Live2DInputEvent }) => void) | null = null

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: Parameters<typeof listenMock>) => listenMock(...args),
}))

describe('useLive2DInput', () => {
  beforeEach(() => {
    inputListener = null
    listenMock.mockReset()
    listenMock.mockImplementation(async (_eventName, handler) => {
      inputListener = handler as (event: { payload: Live2DInputEvent }) => void
      return () => {}
    })
  })

  it('skips mouse-driven params that are currently overridden', async () => {
    const setParam = vi.fn()
    const setExpression = vi.fn()
    const triggerTapMotion = vi.fn().mockResolvedValue(undefined)
    const triggerMotion = vi.fn().mockResolvedValue(undefined)
    const paramOverridesRef = {
      current: {
      ParamEyeBallX: 0.2,
      ParamAngleY: 10,
      },
    }

    renderHook(() => useLive2DInput({
      enabled: true,
      modelUuid: 'uuid1',
      actionShortcuts: {},
      setParam,
      paramOverridesRef,
      triggerTapMotion,
      triggerMotion,
      setExpression,
    }))

    expect(inputListener).not.toBeNull()

    act(() => {
      inputListener?.({
        payload: {
          kind: 'mouse_move',
          x: 0.5,
          y: -0.25,
          display_id: 'main',
        },
      })
    })

    expect(setParam).toHaveBeenCalledWith('ParamEyeBallY', -0.25)
    expect(setParam).toHaveBeenCalledWith('ParamAngleX', 15)
    expect(setParam).not.toHaveBeenCalledWith('ParamEyeBallX', 0.5)
    expect(setParam).not.toHaveBeenCalledWith('ParamAngleY', -7.5)
  })

  it('matches model-scoped motion shortcuts using tracked modifiers', async () => {
    const setParam = vi.fn()
    const setExpression = vi.fn()
    const triggerTapMotion = vi.fn().mockResolvedValue(undefined)
    const triggerMotion = vi.fn().mockResolvedValue(undefined)
    const paramOverridesRef = { current: {} }

    renderHook(() => useLive2DInput({
      enabled: true,
      modelUuid: 'uuid1',
      actionShortcuts: {
        'motion:uuid1:tap:0': 'Control+F1',
        'motion:uuid2:tap:0': 'Control+F1',
      },
      setParam,
      paramOverridesRef,
      triggerTapMotion,
      triggerMotion,
      setExpression,
    }))

    act(() => {
      inputListener?.({
        payload: {
          kind: 'key_down',
          code: 'ControlLeft',
        },
      })
      inputListener?.({
        payload: {
          kind: 'key_down',
          code: 'F1',
        },
      })
    })

    expect(triggerMotion).toHaveBeenCalledWith('tap', 0)
    expect(triggerMotion).toHaveBeenCalledTimes(1)
  })

  it('matches expression shortcuts for the active model', async () => {
    const setParam = vi.fn()
    const setExpression = vi.fn()
    const triggerTapMotion = vi.fn().mockResolvedValue(undefined)
    const triggerMotion = vi.fn().mockResolvedValue(undefined)
    const paramOverridesRef = { current: {} }

    renderHook(() => useLive2DInput({
      enabled: true,
      modelUuid: 'uuid1',
      actionShortcuts: {
        'expression:uuid1:2': 'Alt+F2',
      },
      setParam,
      paramOverridesRef,
      triggerTapMotion,
      triggerMotion,
      setExpression,
    }))

    act(() => {
      inputListener?.({
        payload: {
          kind: 'key_down',
          code: 'AltLeft',
        },
      })
      inputListener?.({
        payload: {
          kind: 'key_down',
          code: 'F2',
        },
      })
    })

    expect(setExpression).toHaveBeenCalledWith(2)
  })
})
