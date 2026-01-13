import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type { Settings } from '../types/merit'
import { COMMANDS } from '../types/events'
import { DEFAULT_KEYBOARD_LAYOUT_ID } from '@/lib/keyboard'

interface SettingsState {
  settings: Settings | null
  isLoading: boolean
  error: string | null
  fetchSettings: () => Promise<void>
  updateSettings: (settings: Partial<Settings>) => Promise<void>
  applySettings: (settings: Settings) => void
  toggleAlwaysOnTop: () => Promise<void>
}

const defaultSettings: Settings = {
  enable_keyboard: true,
  enable_mouse_single: true,
  always_on_top: true,
  window_pass_through: false,
  show_taskbar_icon: false,
  launch_on_startup: false,
  wooden_fish_skin: 'rosewood',
  keyboard_layout: DEFAULT_KEYBOARD_LAYOUT_ID,
  opacity: 0.95,
  animation_speed: 1.0,
  window_scale: 100,
  heatmap_levels: 10,
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  isLoading: false,
  error: null,

  fetchSettings: async () => {
    set({ isLoading: true, error: null })
    try {
      const settings = await invoke<Settings>(COMMANDS.GET_SETTINGS)
      set({ settings, isLoading: false })
    } catch (error) {
      set({ settings: defaultSettings, isLoading: false, error: String(error) })
    }
  },

  updateSettings: async (newSettings: Partial<Settings>) => {
    const currentSettings = get().settings || defaultSettings
    const updatedSettings = { ...currentSettings, ...newSettings }

    try {
      await invoke(COMMANDS.UPDATE_SETTINGS, { settings: updatedSettings })
      set({ settings: updatedSettings })
    } catch (error) {
      set({ error: String(error) })
    }
  },

  applySettings: (settings: Settings) => {
    set({ settings })
  },

  toggleAlwaysOnTop: async () => {
    const currentSettings = get().settings || defaultSettings
    const newValue = !currentSettings.always_on_top
    await get().updateSettings({ always_on_top: newValue })
  },
}))
