import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useSettingsStore } from '../stores/useSettingsStore'
import type { Settings } from '../types/merit'
import { EVENTS } from '../types/events'

export function useSettingsSync() {
  const applySettings = useSettingsStore((s) => s.applySettings)

  useEffect(() => {
    const unlisten = listen<Settings>(EVENTS.SETTINGS_UPDATED, (event) => {
      applySettings(event.payload)
    })

    return () => {
      unlisten.then((fn) => fn())
    }
  }, [applySettings])
}
