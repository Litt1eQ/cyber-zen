import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useMeritStore } from '../stores/useMeritStore'
import { useSettingsStore } from '../stores/useSettingsStore'
import { useMeritDaysStore } from '../stores/useMeritDaysStore'
import { useMeritDaysLiteStore } from '../stores/useMeritDaysLiteStore'
import type { MeritStatsLite } from '../types/merit'
import { COMMANDS, EVENTS } from '../types/events'
import { isMac } from '../utils/platform'

export type InputListenerErrorCode = 'permission_required' | 'listen_failed'

export type InputListenerError = {
  code: InputListenerErrorCode
  message: string
  detail?: string
}

export function useInputListener() {
  const { t } = useTranslation()
  const [isListening, setIsListening] = useState(false)
  const [rawError, setRawError] = useState<{ code: InputListenerErrorCode; detail?: string } | null>(null)
  const updateStats = useMeritStore((state) => state.updateStats)
  const mergeTodayFull = useMeritDaysStore((s) => s.mergeTodayLite)
  const mergeTodayLite = useMeritDaysLiteStore((s) => s.mergeTodayLite)
  const settings = useSettingsStore((state) => state.settings)

  useEffect(() => {
    const unsubscribe = listen<MeritStatsLite>(EVENTS.MERIT_UPDATED, (event) => {
      updateStats(event.payload)
      mergeTodayFull(event.payload.today)
      mergeTodayLite(event.payload.today)
    })

    return () => {
      unsubscribe.then((fn) => fn())
    }
  }, [mergeTodayFull, mergeTodayLite, updateStats])

  const startListening = async () => {
    try {
      setRawError(null)
      if (isMac()) {
        const permitted = await invoke<boolean>(COMMANDS.CHECK_INPUT_MONITORING_PERMISSION)
        if (!permitted) {
          setRawError({
            code: 'permission_required',
          })
          setIsListening(false)
          return
        }
      }
      await invoke(COMMANDS.START_INPUT_LISTENING)
      setIsListening(true)
    } catch (err) {
      setRawError({ code: 'listen_failed', detail: String(err) })
      setIsListening(false)
    }
  }

  const stopListening = async () => {
    try {
      setRawError(null)
      await invoke(COMMANDS.STOP_INPUT_LISTENING)
      setIsListening(false)
    } catch (err) {
      setRawError({ code: 'listen_failed', detail: String(err) })
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
      setRawError({ code: 'listen_failed', detail: String(err) })
    }
  }

  useEffect(() => {
    checkListeningStatus()
    invoke<InputListenerError | null>(COMMANDS.GET_INPUT_LISTENER_ERROR)
      .then((msg) => {
        if (msg) setRawError({ code: msg.code, detail: msg.message })
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const unlisten = listen<InputListenerError>(EVENTS.INPUT_LISTENER_ERROR, (event) => {
      setRawError({ code: event.payload.code, detail: event.payload.message })
      setIsListening(false)
    })

    return () => {
      unlisten.then((fn) => fn())
    }
  }, [])

  const error: InputListenerError | null = (() => {
    if (!rawError) return null
    if (rawError.code === 'permission_required') {
      return { code: rawError.code, message: t('errors.inputMonitoringRequiredMac') }
    }
    return {
      code: rawError.code,
      message: rawError.detail ?? t('errors.unknown'),
      detail: rawError.detail,
    }
  })()

  return {
    isListening,
    error,
    startListening,
    stopListening,
    toggleListening,
    settings,
  }
}
