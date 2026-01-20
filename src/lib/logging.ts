import { isTauri } from '@tauri-apps/api/core'
import { appendAppLog } from '@/lib/appLog'

function safeStringify(value: unknown): string {
  try {
    if (typeof value === 'string') return value
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export async function logInfo(scope: string, message: string, data?: unknown): Promise<void> {
  try {
    await appendAppLog('info', scope, message, data)
  } catch {
    // ignore
  }
}

export async function logWarn(scope: string, message: string, data?: unknown): Promise<void> {
  try {
    await appendAppLog('warn', scope, message, data)
  } catch {
    // ignore
  }
}

export async function logError(scope: string, message: string, data?: unknown): Promise<void> {
  try {
    await appendAppLog('error', scope, message, data)
  } catch {
    // ignore
  }
}

export function setupGlobalErrorLogging(context: { page: string }): () => void {
  if (!isTauri()) return () => {}

  const seen = new Map<string, number>()
  const shouldLog = (key: string) => {
    const now = Date.now()
    const last = seen.get(key) ?? 0
    if (now - last < 3000) return false
    seen.set(key, now)
    return true
  }

  const onError = (event: ErrorEvent) => {
    const stack = (event.error as { stack?: unknown } | null | undefined)?.stack
    const key = `error::${event.message}::${safeStringify(stack)}`
    if (!shouldLog(key)) return
    void logError('ui/error', event.message, {
      page: context.page,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack,
    })
  }

  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason
    const message = reason instanceof Error ? reason.message : safeStringify(reason)
    const stack = reason instanceof Error ? reason.stack : undefined
    const key = `rejection::${message}::${safeStringify(stack)}`
    if (!shouldLog(key)) return
    void logError('ui/unhandledrejection', message, { page: context.page, stack, reason })
  }

  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)

  void logInfo('ui/lifecycle', 'page_start', { page: context.page, href: location.href, ua: navigator.userAgent })

  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
  }
}

