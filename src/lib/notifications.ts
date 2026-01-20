export type SystemNotification = {
  title: string
  body?: string
}

export function isSystemNotificationSupported(): boolean {
  if (typeof Notification === 'undefined') return false
  return true
}

export function getSystemNotificationPermission(): NotificationPermission | null {
  if (!isSystemNotificationSupported()) return null
  return Notification.permission
}

export async function requestSystemNotificationPermission(): Promise<NotificationPermission | null> {
  if (!isSystemNotificationSupported()) return null
  try {
    return await Notification.requestPermission()
  } catch {
    return null
  }
}

export async function sendSystemNotification(n: SystemNotification): Promise<boolean> {
  if (typeof Notification === 'undefined') return false
  if (Notification.permission !== 'granted') return false

  try {
    new Notification(n.title, n.body ? { body: n.body } : undefined)
    return true
  } catch {
    return false
  }
}
