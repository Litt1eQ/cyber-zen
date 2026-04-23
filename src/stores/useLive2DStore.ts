import { invoke } from '@tauri-apps/api/core'
import { create } from 'zustand'
import { COMMANDS } from '@/types/events'
import type { Live2DExpressionInfo, Live2DModelMeta, Live2DMotionInfo } from '@/types/live2d'

type Live2DStoreState = {
  models: Live2DModelMeta[]
  motions: Record<string, Live2DMotionInfo[]>
  expressions: Live2DExpressionInfo[]
  isReady: boolean
  isLoading: boolean
  error: string | null
  setError: (error: string | null) => void
  loadModels: () => Promise<void>
  importModel: (srcDir: string) => Promise<Live2DModelMeta>
  deleteModel: (uuid: string) => Promise<void>
  setReady: (motions: Record<string, Live2DMotionInfo[]>, expressions: Live2DExpressionInfo[]) => void
  resetRuntime: () => void
}

export const useLive2DStore = create<Live2DStoreState>((set) => ({
  models: [],
  motions: {},
  expressions: [],
  isReady: false,
  isLoading: false,
  error: null,

  loadModels: async () => {
    set({ isLoading: true, error: null })
    try {
      const models = await invoke<Live2DModelMeta[]>(COMMANDS.LIST_LIVE2D_MODELS)
      set({
        models: [...(models ?? [])].sort((a, b) => a.name.localeCompare(b.name) || a.uuid.localeCompare(b.uuid)),
        isLoading: false,
      })
    } catch (error) {
      set({ isLoading: false, error: String(error) })
    }
  },

  setError: (error) => {
    set({ error })
  },

  importModel: async (srcDir) => {
    const meta = await invoke<Live2DModelMeta>(COMMANDS.IMPORT_LIVE2D_MODEL, { srcDir })
    set((state) => ({
      error: null,
      models: [...state.models, meta].sort((a, b) => a.name.localeCompare(b.name) || a.uuid.localeCompare(b.uuid)),
    }))
    return meta
  },

  deleteModel: async (uuid) => {
    await invoke(COMMANDS.DELETE_LIVE2D_MODEL, { uuid })
    set((state) => ({
      models: state.models.filter((model) => model.uuid !== uuid),
    }))
  },

  setReady: (motions, expressions) => {
    set({
      motions,
      expressions,
      isReady: true,
      error: null,
    })
  },

  resetRuntime: () => {
    set({
      motions: {},
      expressions: [],
      isReady: false,
    })
  },
}))
