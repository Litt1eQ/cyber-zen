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
}

export interface MeritStats {
  total_merit: number
  today: DailyStats
  history: DailyStats[]
}

export interface Settings {
  enable_keyboard: boolean
  enable_mouse_single: boolean
  always_on_top: boolean
  window_pass_through: boolean
  show_taskbar_icon: boolean
  launch_on_startup: boolean
  wooden_fish_skin: string
  keyboard_layout?: string
  opacity: number
  animation_speed: number
  window_scale: number
  heatmap_levels?: number
  lock_window_position?: boolean
  dock_margin_px?: number
  auto_fade_enabled?: boolean
  auto_fade_idle_opacity?: number
  auto_fade_delay_ms?: number
  auto_fade_duration_ms?: number
  drag_hold_ms?: number
  shortcut_toggle_main?: string | null
  shortcut_toggle_settings?: string | null
  shortcut_toggle_listening?: string | null
  shortcut_toggle_window_pass_through?: string | null
  shortcut_toggle_always_on_top?: string | null
}

export interface InputEvent {
  origin: 'global' | 'app'
  source: InputSourceType
  count: number
}
