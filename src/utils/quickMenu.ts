import { invoke } from '@tauri-apps/api/core'
import { CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu } from '@tauri-apps/api/menu'
import { COMMANDS } from '../types/events'
import { useSettingsStore } from '../stores/useSettingsStore'
import i18n from '@/i18n'

const SCALE_OPTIONS = [50, 75, 100, 125, 150] as const
const OPACITY_OPTIONS: Array<{ label: string; value: number }> = [
  { label: '30%', value: 0.3 },
  { label: '50%', value: 0.5 },
  { label: '75%', value: 0.75 },
  { label: '95%', value: 0.95 },
  { label: '100%', value: 1.0 },
]

function approxEq(a: number, b: number) {
  return Math.abs(a - b) < 0.0001
}

export async function showMainQuickMenu() {
  const settings = useSettingsStore.getState().settings
  if (!settings) return
  const t = (key: string) => i18n.t(key) as string

  const isListening = await invoke<boolean>(COMMANDS.IS_INPUT_LISTENING).catch(() => false)

  const updateSettings = useSettingsStore.getState().updateSettings

  const items = await Promise.all([
    MenuItem.new({
      text: t('quickMenu.openSettings'),
      action: () => void invoke(COMMANDS.SHOW_SETTINGS_WINDOW),
    }),
    MenuItem.new({
      text: t('quickMenu.customStatistics'),
      action: () => void invoke(COMMANDS.SHOW_CUSTOM_STATISTICS_WINDOW),
    }),
    MenuItem.new({
      text: t('quickMenu.hideWoodenFish'),
      action: () => void invoke(COMMANDS.HIDE_MAIN_WINDOW),
    }),
    PredefinedMenuItem.new({ item: 'Separator' }),
    CheckMenuItem.new({
      text: t('quickMenu.lockPosition'),
      checked: settings.lock_window_position ?? false,
      action: () => void updateSettings({ lock_window_position: !(settings.lock_window_position ?? false) }),
    }),
    CheckMenuItem.new({
      text: t('quickMenu.autoFade'),
      checked: settings.auto_fade_enabled ?? false,
      action: () => void updateSettings({ auto_fade_enabled: !(settings.auto_fade_enabled ?? false) }),
    }),
    Submenu.new({
      text: t('quickMenu.dockTo'),
      items: await Promise.all(
        [
          { text: t('quickMenu.dockCorners.topLeft'), corner: 'top_left' },
          { text: t('quickMenu.dockCorners.topRight'), corner: 'top_right' },
          { text: t('quickMenu.dockCorners.bottomLeft'), corner: 'bottom_left' },
          { text: t('quickMenu.dockCorners.bottomRight'), corner: 'bottom_right' },
        ].map((opt) =>
          MenuItem.new({
            text: opt.text,
            action: () => void invoke(COMMANDS.DOCK_MAIN_WINDOW, { corner: opt.corner }),
          })
        )
      ),
    }),
    PredefinedMenuItem.new({ item: 'Separator' }),
    CheckMenuItem.new({
      text: t('quickMenu.globalListening'),
      checked: isListening,
      action: () => {
        void (isListening
          ? invoke(COMMANDS.STOP_INPUT_LISTENING)
          : invoke(COMMANDS.START_INPUT_LISTENING))
      },
    }),
    PredefinedMenuItem.new({ item: 'Separator' }),
    CheckMenuItem.new({
      text: t('quickMenu.alwaysOnTop'),
      checked: settings.always_on_top,
      action: () => void updateSettings({ always_on_top: !settings.always_on_top }),
    }),
    Submenu.new({
      text: t('quickMenu.windowScale'),
      items: await Promise.all(
        SCALE_OPTIONS.map((scale) =>
          CheckMenuItem.new({
            text: `${scale}%`,
            checked: settings.window_scale === scale,
            action: () => void updateSettings({ window_scale: scale }),
          }),
        ),
      ),
    }),
    Submenu.new({
      text: t('quickMenu.opacity'),
      items: await Promise.all(
        OPACITY_OPTIONS.map((opt) =>
          CheckMenuItem.new({
            text: opt.label,
            checked: approxEq(settings.opacity, opt.value),
            action: () => void updateSettings({ opacity: opt.value }),
          }),
        ),
      ),
    }),
    PredefinedMenuItem.new({ item: 'Separator' }),
    MenuItem.new({
      text: t('quickMenu.quit'),
      action: () => void invoke(COMMANDS.QUIT_APP),
    }),
  ])

  const menu = await Menu.new({ items })
  // `menu.popup()` is more reliable on macOS across DPI/scaling and NSPanel windows.
  await menu.popup()
}
