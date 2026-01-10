import { useEffect, useRef } from 'react'
import { isRegistered, register, unregister } from '@tauri-apps/plugin-global-shortcut'
import { invoke } from '@tauri-apps/api/core'
import { COMMANDS } from '../types/events'
import type { Settings } from '../types/merit'

type ShortcutKey =
  | 'toggle_main'
  | 'toggle_settings'
  | 'toggle_listening'
  | 'toggle_window_pass_through'
  | 'toggle_always_on_top'

type ShortcutState = Record<ShortcutKey, string | null>

const emptyState: ShortcutState = {
  toggle_main: null,
  toggle_settings: null,
  toggle_listening: null,
  toggle_window_pass_through: null,
  toggle_always_on_top: null,
}

function normalizeShortcut(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

async function safeUnregister(accelerator: string) {
  try {
    if (await isRegistered(accelerator)) await unregister(accelerator)
  } catch {
    // ignore
  }
}

async function safeRegister(accelerator: string, onPressed: () => void) {
  try {
    await register(accelerator, (event) => {
      if (event.state === 'Released') return
      onPressed()
    })
  } catch {
    // ignore
  }
}

export function useGlobalShortcuts(settings: Settings | null) {
  const prev = useRef<ShortcutState>(emptyState)

  useEffect(() => {
    let cancelled = false

    const next: ShortcutState = {
      toggle_main: normalizeShortcut(settings?.shortcut_toggle_main),
      toggle_settings: normalizeShortcut(settings?.shortcut_toggle_settings),
      toggle_listening: normalizeShortcut(settings?.shortcut_toggle_listening),
      toggle_window_pass_through: normalizeShortcut(settings?.shortcut_toggle_window_pass_through),
      toggle_always_on_top: normalizeShortcut(settings?.shortcut_toggle_always_on_top),
    }

    const run = async () => {
      const current = prev.current

      for (const key of Object.keys(current) as ShortcutKey[]) {
        const oldValue = current[key]
        const newValue = next[key]
        if (oldValue && oldValue !== newValue) await safeUnregister(oldValue)
      }

      if (cancelled) return

      if (next.toggle_main && current.toggle_main !== next.toggle_main) {
        await safeRegister(next.toggle_main, () => void invoke(COMMANDS.TOGGLE_MAIN_WINDOW))
      }
      if (next.toggle_settings && current.toggle_settings !== next.toggle_settings) {
        await safeRegister(next.toggle_settings, () => void invoke(COMMANDS.TOGGLE_SETTINGS_WINDOW))
      }
      if (next.toggle_listening && current.toggle_listening !== next.toggle_listening) {
        await safeRegister(next.toggle_listening, () => void invoke(COMMANDS.TOGGLE_INPUT_LISTENING))
      }
      if (next.toggle_window_pass_through && current.toggle_window_pass_through !== next.toggle_window_pass_through) {
        await safeRegister(next.toggle_window_pass_through, () => void invoke(COMMANDS.TOGGLE_WINDOW_PASS_THROUGH))
      }
      if (next.toggle_always_on_top && current.toggle_always_on_top !== next.toggle_always_on_top) {
        await safeRegister(next.toggle_always_on_top, () => void invoke(COMMANDS.TOGGLE_ALWAYS_ON_TOP))
      }

      if (cancelled) return
      prev.current = next
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [
    settings?.shortcut_toggle_main,
    settings?.shortcut_toggle_settings,
    settings?.shortcut_toggle_listening,
    settings?.shortcut_toggle_window_pass_through,
    settings?.shortcut_toggle_always_on_top,
  ])

  useEffect(() => {
    return () => {
      const current = prev.current
      prev.current = emptyState
      void (async () => {
        if (current.toggle_main) await safeUnregister(current.toggle_main)
        if (current.toggle_settings) await safeUnregister(current.toggle_settings)
        if (current.toggle_listening) await safeUnregister(current.toggle_listening)
        if (current.toggle_window_pass_through) await safeUnregister(current.toggle_window_pass_through)
        if (current.toggle_always_on_top) await safeUnregister(current.toggle_always_on_top)
      })()
    }
  }, [])
}
