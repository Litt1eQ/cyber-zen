import { useCallback, useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { COMMANDS } from '../types/events'

function isMacOS() {
  return (
    navigator.platform.toLowerCase().includes('mac') ||
    navigator.userAgent.toLowerCase().includes('mac os x')
  )
}

export function useInputMonitoringPermission() {
  const supported = useMemo(() => isMacOS(), [])
  const [authorized, setAuthorized] = useState<boolean>(!supported)
  const [loading, setLoading] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!supported) return
    setLoading(true)
    try {
      const ok = await invoke<boolean>(COMMANDS.CHECK_INPUT_MONITORING_PERMISSION)
      setAuthorized(ok)
      setLastError(null)
    } catch (e) {
      setLastError(String(e))
    } finally {
      setLoading(false)
    }
  }, [supported])

  const request = useCallback(async () => {
    if (!supported) return
    setLoading(true)
    try {
      await invoke<boolean>(COMMANDS.REQUEST_INPUT_MONITORING_PERMISSION)
      await refresh()
    } catch (e) {
      setLastError(String(e))
    } finally {
      setLoading(false)
    }
  }, [refresh, supported])

  const openSystemSettings = useCallback(async () => {
    if (!supported) return
    await invoke<void>(COMMANDS.OPEN_INPUT_MONITORING_SETTINGS)
  }, [supported])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { supported, authorized, loading, lastError, refresh, request, openSystemSettings }
}
