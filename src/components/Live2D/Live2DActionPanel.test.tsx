import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EVENTS } from '@/types/events'
import { Live2DActionPanel } from './Live2DActionPanel'

const invokeMock = vi.fn()
const emitMock = vi.fn()
const useSettingsStoreState = {
  settings: null as { live2d_action_shortcuts?: Record<string, string> } | null,
  updateSettings: vi.fn<(next: Record<string, unknown>) => Promise<void>>(),
}

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: Parameters<typeof invokeMock>) => invokeMock(...args),
}))

vi.mock('@tauri-apps/api/event', () => ({
  emit: (...args: Parameters<typeof emitMock>) => emitMock(...args),
}))

vi.mock('@/stores/useSettingsStore', () => ({
  useSettingsStore: (selector: (state: {
    settings: { live2d_action_shortcuts?: Record<string, string> } | null
    updateSettings: (next: Record<string, unknown>) => Promise<void>
  }) => unknown) => selector(useSettingsStoreState),
}))

describe('Live2DActionPanel', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    emitMock.mockReset()
    useSettingsStoreState.settings = {
      live2d_action_shortcuts: {
        'motion:uuid1:idle:0': 'F2',
        'motion:uuid1:tap:0': 'F1',
      },
    }
    useSettingsStoreState.updateSettings = vi.fn().mockResolvedValue(undefined)
  })

  it('renders motion rows from model json and emits play action', async () => {
    invokeMock.mockResolvedValue(JSON.stringify({
      FileReferences: {
        Motions: {
          tap: [{}, {}],
        },
        Expressions: [{ Name: 'smile' }],
      },
    }))

    render(<Live2DActionPanel uuid="uuid1" />)

    expect(await screen.findByText('tap_0')).toBeInTheDocument()
    expect(screen.getByText('F1')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: '▶ 播放' })[0])

    expect(emitMock).toHaveBeenCalledWith(EVENTS.LIVE2D_ACTION_EVENT, {
      kind: 'trigger_motion',
      group: 'tap',
      no: 0,
    })
  })

  it('records shortcuts and replaces conflicting binding within the same model', async () => {
    useSettingsStoreState.settings = {
      live2d_action_shortcuts: {
        'motion:uuid1:idle:0': 'F2',
      },
    }
    useSettingsStoreState.updateSettings = vi.fn().mockResolvedValue(undefined)
    invokeMock.mockResolvedValue(JSON.stringify({
      FileReferences: {
        Motions: {
          tap: [{}],
          idle: [{}],
        },
      },
    }))

    render(<Live2DActionPanel uuid="uuid1" />)

    await screen.findByText('tap_0')
    const recorder = screen.getAllByRole('button', { name: '--' })[0]
    fireEvent.mouseDown(recorder)
    fireEvent.focus(recorder)
    fireEvent.keyDown(recorder, {
      key: 'F2',
      code: 'F2',
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    })

    await waitFor(() => {
      expect(useSettingsStoreState.updateSettings).toHaveBeenCalledWith({
        live2d_action_shortcuts: {
          'motion:uuid1:tap:0': 'F2',
        },
      })
    })
  })

  it('shows graceful empty state when the model has no motions', async () => {
    invokeMock.mockResolvedValue(JSON.stringify({
      FileReferences: {
        Motions: {},
        Expressions: [],
      },
    }))

    render(<Live2DActionPanel uuid="uuid1" />)

    expect(await screen.findByText('此模型无可用动作')).toBeInTheDocument()
    expect(screen.queryByText('表情 0')).not.toBeInTheDocument()
  })

  it('keeps controls interactive even when settings window runtime is not ready', async () => {
    invokeMock.mockResolvedValue(JSON.stringify({
      FileReferences: {
        Motions: {
          tap: [{}],
        },
        Expressions: [{ Name: 'smile' }],
      },
    }))

    render(<Live2DActionPanel uuid="uuid1" />)

    expect(await screen.findByText('tap_0')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '▶ 播放' })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: '--' })).not.toBeDisabled()
    for (const slider of screen.getAllByRole('slider')) {
      expect(slider).not.toBeDisabled()
    }
  })
})
