import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { MonitorInfo } from '@/types/clickHeatmap'
import { COMMANDS } from '@/types/events'

export function useDisplayMonitors() {
  const [monitors, setMonitors] = useState<MonitorInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const next = await invoke<MonitorInfo[]>(COMMANDS.GET_DISPLAY_MONITORS)
      setMonitors(next)
    } catch (e) {
      setError(String(e))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { monitors, error, isLoading, refresh }
}

