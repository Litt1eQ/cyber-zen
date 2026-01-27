export interface InputSource {
  Keyboard: 'keyboard'
  MouseSingle: 'mouse_single'
}

export type InputSourceType = 'keyboard' | 'mouse_single'

export interface DailyStats {
  date: string
  total: number
  keyboard: number
  mouse_single: number
  first_event_at_ms?: number | null
  last_event_at_ms?: number | null
  mouse_move_distance_px?: number
  mouse_move_distance_px_by_display?: Record<string, number>
  hourly?: Array<{
    total: number
    keyboard: number
    mouse_single: number
  }>
  key_counts: Record<string, number>
  key_counts_unshifted?: Record<string, number>
  key_counts_shifted?: Record<string, number>
  shortcut_counts?: Record<string, number>
  mouse_button_counts: Record<string, number>
  app_input_counts?: Record<
    string,
    {
      name?: string | null
      total: number
      keyboard: number
      mouse_single: number
    }
  >
}

export interface MeritStats {
  total_merit: number
  today: DailyStats
  history: DailyStats[]
}

export interface Settings {
  app_locale?: 'system' | 'en' | 'zh-CN' | 'zh-TW'
  auto_update_enabled?: boolean
  enable_keyboard: boolean
  enable_mouse_single: boolean
  keyboard_piano_enabled?: boolean
  keyboard_piano_volume?: number
  keyboard_piano_scale?: 'pentatonic_major' | 'major' | 'chromatic'
  keyboard_piano_wave?: 'sine' | 'triangle' | 'square' | 'sawtooth'
  always_on_top: boolean
  window_pass_through: boolean
  show_taskbar_icon: boolean
  launch_on_startup: boolean
  wooden_fish_skin: string
  keyboard_layout?: string
  opacity: number
  wooden_fish_opacity: number
  animation_speed: number
  window_scale: number
  heatmap_levels?: number
  click_heatmap_grid_cols?: number
  click_heatmap_grid_rows?: number
  lock_window_position?: boolean
  dock_margin_px?: number
  auto_fade_enabled?: boolean
  auto_fade_idle_opacity?: number
  auto_fade_delay_ms?: number
  auto_fade_duration_ms?: number
  drag_hold_ms?: number
  merit_pop_opacity: number
  merit_pop_label: string
  custom_statistics_widgets?: string[]
  custom_statistics_range?: 'today' | 'all'
  mouse_distance_displays?: Record<
    string,
    {
      diagonal_in?: number | null
      ppi_override?: number | null
    }
  >
  shortcut_toggle_main?: string | null
  shortcut_toggle_settings?: string | null
  shortcut_toggle_listening?: string | null
  shortcut_toggle_window_pass_through?: string | null
  shortcut_toggle_always_on_top?: string | null
  shortcut_open_custom_statistics?: string | null
  shortcut_close_custom_statistics?: string | null
  keyboard_heatmap_share_hide_numbers?: boolean
  keyboard_heatmap_share_hide_keys?: boolean
  keyboard_heatmap_share_show_merit_value?: boolean
  achievement_notifications_enabled?: boolean
  statistics_blocks?: Array<{
    id: string
    collapsed?: boolean
  }>
}

export interface InputEvent {
  origin: 'global' | 'app'
  source: InputSourceType
  count: number
}
