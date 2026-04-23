import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Live2DCanvas } from './Live2DCanvas'

const listenMock = vi.fn()
const loadModelsMock = vi.fn()

const live2DStoreState = {
  models: [] as Array<{ uuid: string; name: string; model_path: string; model_file: string }>,
  isReady: false,
  isLoading: false,
  error: null as string | null,
  loadModels: loadModelsMock,
}

const settingsStoreState = {
  settings: {
    live2d_speed_configs: {},
  },
}

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: Parameters<typeof listenMock>) => listenMock(...args),
}))

vi.mock('@/hooks/useWindowDragGesture', () => ({
  useWindowDragGesture: () => ({
    onPointerDown: vi.fn(),
    onPointerMove: vi.fn(),
    onPointerUp: vi.fn(),
    onPointerCancel: vi.fn(),
    onPointerLeave: vi.fn(),
    consumeIgnoreClick: () => false,
  }),
}))

vi.mock('@/stores/useLive2DStore', () => ({
  useLive2DStore: (selector: (state: typeof live2DStoreState) => unknown) => selector(live2DStoreState),
}))

vi.mock('@/stores/useSettingsStore', () => ({
  useSettingsStore: (selector: (state: typeof settingsStoreState) => unknown) => selector(settingsStoreState),
}))

vi.mock('./useLive2DRenderer', () => ({
  useLive2DRenderer: () => ({
    load: vi.fn(),
    triggerTapMotion: vi.fn(),
    triggerMotion: vi.fn(),
    getParamRange: vi.fn(),
    setParam: vi.fn(),
    setExpression: vi.fn(),
  }),
}))

vi.mock('./useLive2DInput', () => ({
  useLive2DInput: vi.fn(),
}))

vi.mock('./useLive2DResources', () => ({
  useLive2DResources: () => ({
    backgroundSrc: null,
    overlaySrcs: [],
  }),
}))

describe('Live2DCanvas', () => {
  beforeEach(() => {
    listenMock.mockReset()
    listenMock.mockResolvedValue(() => {})
    loadModelsMock.mockReset()
    loadModelsMock.mockResolvedValue(undefined)
    live2DStoreState.models = []
    live2DStoreState.isReady = false
    live2DStoreState.isLoading = false
    live2DStoreState.error = null
  })

  it('refreshes model list before showing missing-model error for a newly selected live2d skin', async () => {
    loadModelsMock.mockReturnValue(new Promise(() => {}))

    render(<Live2DCanvas skinId="live2d:new-model" onHit={() => {}} />)

    await waitFor(() => {
      expect(loadModelsMock).toHaveBeenCalledTimes(1)
    })

    expect(screen.queryByText('当前 Live2D 模型不存在，请重新选择或导入。')).not.toBeInTheDocument()
  })
})
