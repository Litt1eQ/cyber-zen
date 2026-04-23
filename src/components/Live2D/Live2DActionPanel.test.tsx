import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { COMMANDS } from '@/types/events'
import { Live2DActionPanel } from './Live2DActionPanel'

const invokeMock = vi.fn()
const useSettingsStoreState = {
  settings: null as { live2d_speed_configs?: Record<string, unknown> } | null,
  updateSettings: vi.fn<(next: Record<string, unknown>) => Promise<void>>(),
}
const useLive2DStoreState = {
  motions: {
    idle: [{ group: 'idle', no: 0, name: 'idle_0' }],
    tap: [{ group: 'tap', no: 0, name: 'tap_0' }],
  } as Record<string, Array<{ group: string; no: number; name: string }>>,
  expressions: [{ name: 'smile' }, { name: 'blink' }],
}

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: Parameters<typeof invokeMock>) => invokeMock(...args),
}))

vi.mock('@/stores/useSettingsStore', () => ({
  useSettingsStore: (selector: (state: {
    settings: { live2d_speed_configs?: Record<string, unknown> } | null
    updateSettings: (next: Record<string, unknown>) => Promise<void>
  }) => unknown) => selector(useSettingsStoreState),
}))

vi.mock('@/stores/useLive2DStore', () => ({
  useLive2DStore: (selector: (state: typeof useLive2DStoreState) => unknown) => selector(useLive2DStoreState),
}))

describe('Live2DActionPanel', () => {
  beforeEach(() => {
    useLive2DStoreState.motions = {
      idle: [{ group: 'idle', no: 0, name: 'idle_0' }],
      tap: [{ group: 'tap', no: 0, name: 'tap_0' }],
    }
    useLive2DStoreState.expressions = [{ name: 'smile' }, { name: 'blink' }]
    invokeMock.mockReset()
    invokeMock.mockResolvedValue(JSON.stringify({
      FileReferences: {
        Motions: {
          idle: [{}],
          tap: [{}],
        },
        Expressions: [{ Name: 'smile' }, { Name: 'blink' }],
      },
    }))
    useSettingsStoreState.settings = {
      live2d_speed_configs: {},
    }
    useSettingsStoreState.updateSettings = vi.fn().mockResolvedValue(undefined)
  })

  it('renders four speed-tier cards with empty-state hints', async () => {
    render(<Live2DActionPanel uuid="uuid1" />)

    expect(await screen.findByText('慢速')).toBeInTheDocument()
    expect(screen.getByText('中速')).toBeInTheDocument()
    expect(screen.getByText('快速')).toBeInTheDocument()
    expect(screen.getByText('极快')).toBeInTheDocument()
    expect(screen.getAllByText('暂未配置，进入此档位时不触发动画')).toHaveLength(4)
  })

  it('adds picker items into the selected tier config', async () => {
    useSettingsStoreState.settings = {
      live2d_speed_configs: {},
    }

    render(<Live2DActionPanel uuid="uuid1" />)

    fireEvent.click(screen.getAllByRole('button', { name: '＋ 添加动作/表情' })[0])
    fireEvent.click(await screen.findByRole('button', { name: /smile/ }))

    await waitFor(() => {
      expect(useSettingsStoreState.updateSettings).toHaveBeenCalledWith({
        live2d_speed_configs: {
          uuid1: {
            slow: {
              mode: 'sequential',
              items: [{ type: 'expression', index: 0, name: 'smile' }],
            },
            medium: { mode: 'sequential', items: [] },
            fast: { mode: 'sequential', items: [] },
            very_fast: { mode: 'sequential', items: [] },
          },
        },
      })
    })
  })

  it('marks already-added picker items and still allows duplicates', async () => {
    useSettingsStoreState.settings = {
      live2d_speed_configs: {
        uuid1: {
          slow: {
            mode: 'sequential',
            items: [{ type: 'expression', index: 0, name: 'smile' }],
          },
          medium: { mode: 'sequential', items: [] },
          fast: { mode: 'sequential', items: [] },
          very_fast: { mode: 'sequential', items: [] },
        },
      },
    }

    render(<Live2DActionPanel uuid="uuid1" />)

    fireEvent.click(screen.getAllByRole('button', { name: '＋ 添加动作/表情' })[0])
    let smileOption: HTMLElement | undefined
    await waitFor(() => {
      smileOption = screen.getAllByRole('button')
        .find((element) => element.textContent?.includes('smile') && element.textContent?.includes('✓'))
      expect(smileOption).toBeDefined()
    })
    expect(within(smileOption!).getByText('✓')).toBeInTheDocument()
    fireEvent.click(smileOption!)

    await waitFor(() => {
      expect(useSettingsStoreState.updateSettings).toHaveBeenCalledWith({
        live2d_speed_configs: {
          uuid1: {
            slow: {
              mode: 'sequential',
              items: [
                { type: 'expression', index: 0, name: 'smile' },
                { type: 'expression', index: 0, name: 'smile' },
              ],
            },
            medium: { mode: 'sequential', items: [] },
            fast: { mode: 'sequential', items: [] },
            very_fast: { mode: 'sequential', items: [] },
          },
        },
      })
    })
  })

  it('switches a tier between sequential and random modes', async () => {
    render(<Live2DActionPanel uuid="uuid1" />)

    fireEvent.click(screen.getAllByRole('button', { name: '随机' })[0])

    await waitFor(() => {
      expect(useSettingsStoreState.updateSettings).toHaveBeenCalledWith({
        live2d_speed_configs: {
          uuid1: {
            slow: { mode: 'random', items: [] },
            medium: { mode: 'sequential', items: [] },
            fast: { mode: 'sequential', items: [] },
            very_fast: { mode: 'sequential', items: [] },
          },
        },
      })
    })
  })

  it('reorders sequential items by drag and drop', async () => {
    useSettingsStoreState.settings = {
      live2d_speed_configs: {
        uuid1: {
          slow: {
            mode: 'sequential',
            items: [
              { type: 'expression', index: 0, name: 'smile' },
              { type: 'motion', group: 'tap', no: 0, name: 'tap · 0' },
            ],
          },
          medium: { mode: 'sequential', items: [] },
          fast: { mode: 'sequential', items: [] },
          very_fast: { mode: 'sequential', items: [] },
        },
      },
    }

    render(<Live2DActionPanel uuid="uuid1" />)

    const cards = await screen.findAllByTestId('tier-item')
    fireEvent.dragStart(cards[0])
    fireEvent.dragOver(cards[1])
    fireEvent.drop(cards[1])

    await waitFor(() => {
      expect(useSettingsStoreState.updateSettings).toHaveBeenCalledWith({
        live2d_speed_configs: {
          uuid1: {
            slow: {
              mode: 'sequential',
              items: [
                { type: 'motion', group: 'tap', no: 0, name: 'tap · 0' },
                { type: 'expression', index: 0, name: 'smile' },
              ],
            },
            medium: { mode: 'sequential', items: [] },
            fast: { mode: 'sequential', items: [] },
            very_fast: { mode: 'sequential', items: [] },
          },
        },
      })
    })
  })

  it('falls back to selected model json when runtime store has no actions', async () => {
    useLive2DStoreState.motions = {}
    useLive2DStoreState.expressions = []
    invokeMock.mockResolvedValueOnce(JSON.stringify({
      FileReferences: {
        Motions: {
          CAT_motion: [{}, {}],
        },
        Expressions: [{ Name: 'live2d_expression0.exp3.json' }],
      },
    }))

    render(<Live2DActionPanel uuid="uuid-standard" />)

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(COMMANDS.GET_LIVE2D_MODEL_JSON, { uuid: 'uuid-standard' })
    })

    fireEvent.click(screen.getAllByRole('button', { name: '＋ 添加动作/表情' })[0])

    expect(await screen.findByRole('button', { name: /CAT_motion · 0/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /live2d_expression0\.exp3\.json/ })).toBeInTheDocument()
  })
})
