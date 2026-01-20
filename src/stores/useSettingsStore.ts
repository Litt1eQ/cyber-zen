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
  app_locale: 'system',
  enable_keyboard: true,
  enable_mouse_single: true,
  always_on_top: true,
  window_pass_through: false,
  show_taskbar_icon: false,
  launch_on_startup: false,
  wooden_fish_skin: 'rosewood',
  keyboard_layout: DEFAULT_KEYBOARD_LAYOUT_ID,
  opacity: 0.95,
  wooden_fish_opacity: 1.0,
  animation_speed: 1.0,
  window_scale: 100,
  heatmap_levels: 10,
  click_heatmap_grid_cols: 64,
  click_heatmap_grid_rows: 36,
  lock_window_position: false,
  dock_margin_px: 0,
  auto_fade_enabled: false,
  auto_fade_idle_opacity: 0.35,
  auto_fade_delay_ms: 800,
  auto_fade_duration_ms: 180,
  drag_hold_ms: 0,
  merit_pop_opacity: 0.82,
  merit_pop_label: '功德',
  custom_statistics_widgets: ['trend', 'calendar'],
  custom_statistics_range: 'today',
  mouse_distance_displays: {},
  keyboard_heatmap_share_hide_numbers: true,
  keyboard_heatmap_share_hide_keys: true,
  keyboard_heatmap_share_show_merit_value: false,
  achievement_notifications_enabled: false,
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
    let currentSettings = get().settings
    if (!currentSettings) {
      try {
        currentSettings = await invoke<Settings>(COMMANDS.GET_SETTINGS)
        set({ settings: currentSettings })
      } catch {
        currentSettings = defaultSettings
      }
    }
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
