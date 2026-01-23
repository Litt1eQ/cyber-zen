import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { COMMANDS } from '@/types/events'
import type { CustomStatisticsTemplate, CustomStatisticsTemplateUpsert } from '@/types/customStatisticsTemplates'

interface CustomStatisticsTemplatesState {
  templates: CustomStatisticsTemplate[]
  isLoading: boolean
  error: string | null
  fetchTemplates: () => Promise<void>
  upsertTemplate: (template: CustomStatisticsTemplateUpsert) => Promise<CustomStatisticsTemplate>
  deleteTemplate: (id: string) => Promise<void>
}

export const useCustomStatisticsTemplatesStore = create<CustomStatisticsTemplatesState>((set, get) => ({
  templates: [],
  isLoading: false,
  error: null,

  fetchTemplates: async () => {
    set({ isLoading: true, error: null })
    try {
      const templates = await invoke<CustomStatisticsTemplate[]>(COMMANDS.GET_CUSTOM_STATISTICS_TEMPLATES)
      set({ templates, isLoading: false })
    } catch (error) {
      set({ error: String(error), isLoading: false })
    }
  },

  upsertTemplate: async (template: CustomStatisticsTemplateUpsert) => {
    set({ error: null })
    try {
      const saved = await invoke<CustomStatisticsTemplate>(COMMANDS.UPSERT_CUSTOM_STATISTICS_TEMPLATE, { template })
      const current = get().templates
      const idx = current.findIndex((t) => t.id === saved.id)
      const next = idx >= 0 ? [...current.slice(0, idx), saved, ...current.slice(idx + 1)] : [...current, saved]
      set({ templates: next })
      return saved
    } catch (error) {
      const msg = String(error)
      set({ error: msg })
      throw error
    }
  },

  deleteTemplate: async (id: string) => {
    set({ error: null })
    try {
      await invoke(COMMANDS.DELETE_CUSTOM_STATISTICS_TEMPLATE, { id })
      set({ templates: get().templates.filter((t) => t.id !== id) })
    } catch (error) {
      set({ error: String(error) })
      throw error
    }
  },
}))

