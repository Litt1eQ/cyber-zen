import { invoke, isTauri } from '@tauri-apps/api/core'
import { logError, logInfo, logWarn } from '@/lib/logging'
import { COMMANDS } from '@/types/events'

export type SystemNotification = {
  title: string
  body?: string
}

export function isSystemNotificationSupported(): boolean {
  if (isTauri()) return true
  return typeof Notification !== 'undefined'
}

function normalizePermission(p: unknown): NotificationPermission | null {
  if (p === 'granted' || p === 'denied' || p === 'default') return p
  if (p === 'prompt') return 'default'
  return null
}

export async function getSystemNotificationPermission(): Promise<NotificationPermission | null> {
  if (!isSystemNotificationSupported()) return null

  if (isTauri()) {
    const { isPermissionGranted } = await import('@tauri-apps/plugin-notification')
    const granted = await isPermissionGranted()
    return granted ? 'granted' : 'default'
  }

  return Notification.permission
}

export async function requestSystemNotificationPermission(): Promise<NotificationPermission | null> {
  if (!isSystemNotificationSupported()) return null

  if (isTauri()) {
    const { isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification')
    const alreadyGranted = await isPermissionGranted()
    if (alreadyGranted) return 'granted'
    const perm = await requestPermission()
    void logInfo('notifications/permission', 'request', { perm })
    return normalizePermission(perm)
  }

  try {
    return await Notification.requestPermission()
  } catch {
    void logError('notifications/permission', 'web_request_failed')
    return null
  }
}

export async function sendSystemNotification(n: SystemNotification): Promise<boolean> {
  if (!isSystemNotificationSupported()) return false

  if (isTauri()) {
    try {
      const meta = await invoke<{ target_app_id: string; is_dev: boolean; in_app_bundle: boolean }>(COMMANDS.SEND_SYSTEM_NOTIFICATION, {
        title: n.title,
        body: n.body ?? null,
      })
      void logInfo('notifications/send', 'sent', meta)
      return true
    } catch (e) {
      void logError('notifications/send', 'tauri_send_failed', { title: n.title, error: String(e) })
      return false
    }
  }

  if (Notification.permission !== 'granted') {
    void logWarn('notifications/send', 'permission_not_granted')
    return false
  }

  try {
    new Notification(n.title, n.body ? { body: n.body } : undefined)
    return true
  } catch {
    void logError('notifications/send', 'web_send_failed', { title: n.title })
    return false
  }
}
