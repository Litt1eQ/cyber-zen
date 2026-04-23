import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Live2DInputEvent, ModelSpeedConfig } from '@/types/live2d'
import { useLive2DInput } from './useLive2DInput'

const listenMock = vi.fn()
let inputListener: ((event: { payload: Live2DInputEvent }) => void) | null = null

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: Parameters<typeof listenMock>) => listenMock(...args),
}))

function createSpeedConfig(overrides?: Partial<ModelSpeedConfig>): ModelSpeedConfig {
  return {
    slow: { mode: 'sequential', items: [] },
    medium: { mode: 'sequential', items: [] },
    fast: { mode: 'sequential', items: [] },
    very_fast: { mode: 'sequential', items: [] },
    ...overrides,
  }
}

describe('useLive2DInput', () => {
  beforeEach(() => {
    vi.useRealTimers()
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
    const getParamRange = vi.fn((id: string) => {
      switch (id) {
        case 'ParamMouseX':
        case 'ParamEyeBallX':
          return { min: -1, max: 1 }
        case 'ParamMouseY':
        case 'ParamEyeBallY':
          return { min: -1, max: 1 }
        case 'ParamAngleX':
        case 'ParamAngleY':
        case 'ParamAngleZ':
          return { min: -30, max: 30 }
        default:
          return null
      }
    })
    const paramOverridesRef = {
      current: {
      ParamEyeBallX: 0.2,
      ParamAngleY: 10,
      },
    }

    renderHook(() => useLive2DInput({
      enabled: true,
      modelUuid: 'uuid1',
      speedConfig: null,
      setParam,
      getParamRange,
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
    expect(setParam).toHaveBeenCalledWith('ParamAngleX', -15)
    expect(setParam).toHaveBeenCalledWith('ParamMouseX', -0.5)
    expect(setParam).toHaveBeenCalledWith('ParamMouseY', -0.25)
    expect(setParam).toHaveBeenCalledWith('ParamAngleZ', -3.75)
    expect(setParam).not.toHaveBeenCalledWith('ParamEyeBallX', 0.5)
    expect(setParam).not.toHaveBeenCalledWith('ParamAngleY', -7.5)
  })

  it('plays sequential tier items in order and preserves per-tier counters until idle reset', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)

    const setParam = vi.fn()
    const setExpression = vi.fn()
    const triggerTapMotion = vi.fn().mockResolvedValue(undefined)
    const triggerMotion = vi.fn().mockResolvedValue(undefined)
    const getParamRange = vi.fn().mockReturnValue({ min: -1, max: 1 })
    const paramOverridesRef = { current: {} }
    const speedConfig = createSpeedConfig({
      medium: {
        mode: 'sequential',
        items: [
          { type: 'expression', index: 2, name: 'blink' },
          { type: 'motion', group: 'idle', no: 0, name: 'idle · 0' },
        ],
      },
      fast: {
        mode: 'sequential',
        items: [
          { type: 'motion', group: 'tap', no: 1, name: 'tap · 1' },
        ],
      },
    })

    renderHook(() => useLive2DInput({
      enabled: true,
      modelUuid: 'uuid1',
      speedConfig,
      setParam,
      getParamRange,
      paramOverridesRef,
      triggerTapMotion,
      triggerMotion,
      setExpression,
    }))

    act(() => {
      inputListener?.({
        payload: {
          kind: 'key_down',
          code: 'KeyA',
        },
      })
    })

    act(() => {
      vi.setSystemTime(1600)
      inputListener?.({
        payload: {
          kind: 'key_down',
          code: 'KeyS',
        },
      })
    })

    act(() => {
      vi.setSystemTime(2200)
      inputListener?.({
        payload: {
          kind: 'key_down',
          code: 'KeyD',
        },
      })
    })

    act(() => {
      vi.setSystemTime(2500)
      inputListener?.({
        payload: {
          kind: 'key_down',
          code: 'KeyF',
        },
      })
    })

    act(() => {
      vi.setSystemTime(3100)
      inputListener?.({
        payload: {
          kind: 'key_down',
          code: 'KeyG',
        },
      })
    })

    expect(setExpression).toHaveBeenCalledWith(2)
    expect(triggerMotion).toHaveBeenCalledWith('tap', 1)
    expect(triggerMotion).toHaveBeenCalledWith('idle', 0)

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(setExpression).toHaveBeenLastCalledWith(null)

    act(() => {
      vi.setSystemTime(5000)
      inputListener?.({
        payload: {
          kind: 'key_down',
          code: 'KeyJ',
        },
      })
      vi.setSystemTime(5600)
      inputListener?.({
        payload: {
          kind: 'key_down',
          code: 'KeyK',
        },
      })
    })

    expect(setExpression).toHaveBeenCalledWith(2)
  })

  it('uses random selection for random tiers', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.8)

    const setParam = vi.fn()
    const setExpression = vi.fn()
    const triggerTapMotion = vi.fn().mockResolvedValue(undefined)
    const triggerMotion = vi.fn().mockResolvedValue(undefined)
    const getParamRange = vi.fn().mockReturnValue({ min: -1, max: 1 })
    const paramOverridesRef = { current: {} }

    renderHook(() => useLive2DInput({
      enabled: true,
      modelUuid: 'uuid1',
      speedConfig: createSpeedConfig({
        very_fast: {
          mode: 'random',
          items: [
            { type: 'expression', index: 0, name: 'smile' },
            { type: 'motion', group: 'tap', no: 2, name: 'tap · 2' },
          ],
        },
      }),
      setParam,
      getParamRange,
      paramOverridesRef,
      triggerTapMotion,
      triggerMotion,
      setExpression,
    }))

    act(() => {
      inputListener?.({
        payload: {
          kind: 'key_down',
          code: 'KeyA',
        },
      })
      inputListener?.({
        payload: {
          kind: 'key_down',
          code: 'KeyS',
        },
      })
    })

    expect(triggerMotion).toHaveBeenCalledWith('tap', 2)
  })

  it('maps left and right mouse button events to Live2D params', async () => {
    const setParam = vi.fn()
    const setExpression = vi.fn()
    const triggerTapMotion = vi.fn().mockResolvedValue(undefined)
    const triggerMotion = vi.fn().mockResolvedValue(undefined)
    const getParamRange = vi.fn().mockReturnValue({ min: -1, max: 1 })
    const paramOverridesRef = { current: {} }

    renderHook(() => useLive2DInput({
      enabled: true,
      modelUuid: 'uuid1',
      speedConfig: null,
      setParam,
      getParamRange,
      paramOverridesRef,
      triggerTapMotion,
      triggerMotion,
      setExpression,
    }))

    act(() => {
      inputListener?.({
        payload: {
          kind: 'mouse_button_down',
          button: 'Left',
        } as Live2DInputEvent,
      })
      inputListener?.({
        payload: {
          kind: 'mouse_button_down',
          button: 'Right',
        } as Live2DInputEvent,
      })
      inputListener?.({
        payload: {
          kind: 'mouse_button_up',
          button: 'Left',
        } as Live2DInputEvent,
      })
      inputListener?.({
        payload: {
          kind: 'mouse_button_up',
          button: 'Right',
        } as Live2DInputEvent,
      })
    })

    expect(setParam).toHaveBeenCalledWith('ParamMouseLeftDown', 1)
    expect(setParam).toHaveBeenCalledWith('ParamMouseRightDown', 1)
    expect(setParam).toHaveBeenCalledWith('ParamMouseLeftDown', 0)
    expect(setParam).toHaveBeenCalledWith('ParamMouseRightDown', 0)
  })

  it('resets mouse button params when disabled or unmounted', async () => {
    const setParam = vi.fn()
    const setExpression = vi.fn()
    const triggerTapMotion = vi.fn().mockResolvedValue(undefined)
    const triggerMotion = vi.fn().mockResolvedValue(undefined)
    const getParamRange = vi.fn().mockReturnValue({ min: -1, max: 1 })
    const paramOverridesRef = { current: {} }

    const { rerender, unmount } = renderHook(
      (enabled: boolean) => useLive2DInput({
        enabled,
        modelUuid: 'uuid1',
        speedConfig: null,
        setParam,
        getParamRange,
        paramOverridesRef,
        triggerTapMotion,
        triggerMotion,
        setExpression,
      }),
      { initialProps: true },
    )

    rerender(false)
    unmount()

    expect(setParam).toHaveBeenCalledWith('ParamMouseLeftDown', 0)
    expect(setParam).toHaveBeenCalledWith('ParamMouseRightDown', 0)
  })

  it('drives both generic and BongoCat hand-down params from keyboard side groups', async () => {
    const setParam = vi.fn()
    const setExpression = vi.fn()
    const triggerTapMotion = vi.fn().mockResolvedValue(undefined)
    const triggerMotion = vi.fn().mockResolvedValue(undefined)
    const getParamRange = vi.fn().mockReturnValue({ min: -1, max: 1 })
    const paramOverridesRef = { current: {} }

    renderHook(() => useLive2DInput({
      enabled: true,
      modelUuid: 'uuid1',
      speedConfig: null,
      setParam,
      getParamRange,
      paramOverridesRef,
      triggerTapMotion,
      triggerMotion,
      setExpression,
    }))

    act(() => {
      inputListener?.({
        payload: {
          kind: 'key_down',
          code: 'KeyA',
        },
      })
      inputListener?.({
        payload: {
          kind: 'key_down',
          code: 'KeyL',
        },
      })
      inputListener?.({
        payload: {
          kind: 'key_up',
          code: 'KeyA',
        },
      })
      inputListener?.({
        payload: {
          kind: 'key_up',
          code: 'KeyL',
        },
      })
    })

    expect(setParam).toHaveBeenCalledWith('ParamHandL', 1)
    expect(setParam).toHaveBeenCalledWith('CatParamLeftHandDown', 1)
    expect(setParam).toHaveBeenCalledWith('ParamHandR', 1)
    expect(setParam).toHaveBeenCalledWith('CatParamRightHandDown', 1)
    expect(setParam).toHaveBeenCalledWith('ParamHandL', 0)
    expect(setParam).toHaveBeenCalledWith('CatParamLeftHandDown', 0)
    expect(setParam).toHaveBeenCalledWith('ParamHandR', 0)
    expect(setParam).toHaveBeenCalledWith('CatParamRightHandDown', 0)
  })

  it('maps mouse-driven params using model ranges instead of fixed constants', async () => {
    const setParam = vi.fn()
    const setExpression = vi.fn()
    const triggerTapMotion = vi.fn().mockResolvedValue(undefined)
    const triggerMotion = vi.fn().mockResolvedValue(undefined)
    const getParamRange = vi.fn((id: string) => {
      switch (id) {
        case 'ParamMouseX':
          return { min: -2, max: 4 }
        case 'ParamMouseY':
          return { min: -3, max: 1 }
        case 'ParamAngleX':
          return { min: -30, max: 10 }
        case 'ParamAngleY':
          return { min: -20, max: 20 }
        case 'ParamAngleZ':
          return { min: -10, max: 20 }
        case 'ParamEyeBallX':
          return { min: -0.5, max: 1.5 }
        case 'ParamEyeBallY':
          return { min: -1.5, max: 0.5 }
        default:
          return null
      }
    })
    const paramOverridesRef = { current: {} }

    renderHook(() => useLive2DInput({
      enabled: true,
      modelUuid: 'uuid1',
      speedConfig: null,
      setParam,
      getParamRange,
      paramOverridesRef,
      triggerTapMotion,
      triggerMotion,
      setExpression,
    }))

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

    expect(setParam).toHaveBeenCalledWith('ParamMouseX', -0.5)
    expect(setParam).toHaveBeenCalledWith('ParamMouseY', -1.5)
    expect(setParam).toHaveBeenCalledWith('ParamAngleX', -20)
    expect(setParam).toHaveBeenCalledWith('ParamAngleY', -5)
    expect(setParam).toHaveBeenCalledWith('ParamAngleZ', -1.25)
    expect(setParam).toHaveBeenCalledWith('ParamEyeBallX', 0)
    expect(setParam).toHaveBeenCalledWith('ParamEyeBallY', -0.75)
  })
})
