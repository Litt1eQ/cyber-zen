import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useMeritStore } from '../stores/useMeritStore'
import { useSettingsStore } from '../stores/useSettingsStore'
import type { MeritStats } from '../types/merit'
import { COMMANDS, EVENTS } from '../types/events'
import { isMac } from '../utils/platform'

export type InputListenerErrorCode = 'permission_required' | 'listen_failed'

export type InputListenerError = {
  code: InputListenerErrorCode
  message: string
}

export function useInputListener() {
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState<InputListenerError | null>(null)
  const updateStats = useMeritStore((state) => state.updateStats)
  const settings = useSettingsStore((state) => state.settings)

  useEffect(() => {
    const unsubscribe = listen<MeritStats>(EVENTS.MERIT_UPDATED, (event) => {
      updateStats(event.payload)
    })

    return () => {
      unsubscribe.then((fn) => fn())
    }
  }, [updateStats])

  const startListening = async () => {
    try {
      setError(null)
      if (isMac()) {
        const permitted = await invoke<boolean>(COMMANDS.CHECK_INPUT_MONITORING_PERMISSION)
        if (!permitted) {
          setError({
            code: 'permission_required',
            message:
              '需要开启 macOS「输入监控」权限：系统设置 → 隐私与安全性 → 输入监控。',
          })
          setIsListening(false)
          return
        }
      }
      await invoke(COMMANDS.START_INPUT_LISTENING)
      setIsListening(true)
    } catch (err) {
      setError({ code: 'listen_failed', message: String(err) })
      setIsListening(false)
    }
  }

  const stopListening = async () => {
    try {
      setError(null)
      await invoke(COMMANDS.STOP_INPUT_LISTENING)
      setIsListening(false)
    } catch (err) {
      setError({ code: 'listen_failed', message: String(err) })
    }
  }

  const toggleListening = async () => {
    if (isListening) {
      await stopListening()
    } else {
      await startListening()
    }
  }

  const checkListeningStatus = async () => {
    try {
      const listening = await invoke<boolean>(COMMANDS.IS_INPUT_LISTENING)
      setIsListening(listening)
    } catch (err) {
      setError({ code: 'listen_failed', message: String(err) })
    }
  }

  useEffect(() => {
    checkListeningStatus()
    invoke<InputListenerError | null>(COMMANDS.GET_INPUT_LISTENER_ERROR)
      .then((msg) => {
        if (msg) setError(msg)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const unlisten = listen<InputListenerError>(EVENTS.INPUT_LISTENER_ERROR, (event) => {
      setError(event.payload)
      setIsListening(false)
    })

    return () => {
      unlisten.then((fn) => fn())
    }
  }, [])

  return {
    isListening,
    error,
    startListening,
    stopListening,
    toggleListening,
    settings,
  }
}
