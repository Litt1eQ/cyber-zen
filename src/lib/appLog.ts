import { invoke, isTauri } from '@tauri-apps/api/core'
import { COMMANDS } from '@/types/events'

export type AppLogRecord = {
  ts_ms: number
  level: string
  scope: string
  message: string
  data?: unknown
}

export async function appendAppLog(
  level: string,
  scope: string,
  message: string,
  data?: unknown
): Promise<void> {
  if (!isTauri()) return
  const args: Record<string, unknown> = { level, scope, message }
  if (data !== undefined) args.data = data
  await invoke<void>(COMMANDS.APPEND_LOG, args)
}

export async function readAppLogs(params?: {
  limit?: number
  query?: string
  tailBytes?: number
}): Promise<AppLogRecord[]> {
  if (!isTauri()) return []
  const args: Record<string, unknown> = {}
  if (params?.limit !== undefined) args.limit = params.limit
  if (params?.query !== undefined) args.query = params.query
  if (params?.tailBytes !== undefined) args.tailBytes = params.tailBytes
  return await invoke<AppLogRecord[]>(COMMANDS.READ_LOGS, args)
}

export async function clearAppLogs(): Promise<void> {
  if (!isTauri()) return
  await invoke<void>(COMMANDS.CLEAR_LOGS)
}

export async function openLogsDirectory(): Promise<void> {
  if (!isTauri()) return
  await invoke<void>(COMMANDS.OPEN_LOGS_DIRECTORY)
}
