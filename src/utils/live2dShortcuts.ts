import type { Settings } from '@/types/merit'

export type ActiveModifiers = {
  ctrl: boolean
  alt: boolean
  shift: boolean
}

export type Live2DActionShortcutMap = Record<string, string>

const MODIFIER_CODES = new Set([
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'ShiftLeft',
  'ShiftRight',
  'MetaLeft',
  'MetaRight',
])

type ParsedActionKey =
  | { kind: 'motion'; uuid: string; group: string; no: number }
  | { kind: 'expression'; uuid: string; index: number }

export function isModifierCode(code: string): boolean {
  return MODIFIER_CODES.has(code)
}

export function formatShortcutFromDOM(event: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>): string {
  return formatShortcutFromCode(event.code, {
    ctrl: event.ctrlKey || event.metaKey,
    alt: event.altKey,
    shift: event.shiftKey,
  })
}

export function formatShortcutFromCode(code: string, modifiers: ActiveModifiers): string {
  const parts: string[] = []
  if (modifiers.ctrl) parts.push('Control')
  if (modifiers.alt) parts.push('Alt')
  if (modifiers.shift) parts.push('Shift')
  parts.push(code)
  return parts.join('+')
}

export function readActionShortcuts(settings?: Pick<Settings, 'live2d_action_shortcuts'> | null): Live2DActionShortcutMap {
  return { ...(settings?.live2d_action_shortcuts ?? {}) }
}

export function buildMotionActionKey(uuid: string, group: string, no: number): string {
  return `motion:${uuid}:${group}:${no}`
}

export function buildExpressionActionKey(uuid: string, index: number): string {
  return `expression:${uuid}:${index}`
}

export function getShortcutForAction(shortcuts: Live2DActionShortcutMap, actionKey: string): string | undefined {
  return shortcuts[actionKey]
}

export function setShortcut(
  shortcuts: Live2DActionShortcutMap,
  actionKey: string,
  shortcut: string,
): { shortcuts: Live2DActionShortcutMap; replacedActionKey?: string } {
  const next = { ...shortcuts }
  const parsed = parseActionKey(actionKey)
  const normalizedShortcut = shortcut.trim()
  let replacedActionKey: string | undefined

  if (parsed) {
    for (const [existingActionKey, existingShortcut] of Object.entries(next)) {
      if (existingActionKey === actionKey || existingShortcut !== normalizedShortcut) continue
      const existing = parseActionKey(existingActionKey)
      if (!existing || existing.uuid !== parsed.uuid) continue
      delete next[existingActionKey]
      replacedActionKey = existingActionKey
    }
  }

  next[actionKey] = normalizedShortcut

  return { shortcuts: next, replacedActionKey }
}

export function clearShortcut(shortcuts: Live2DActionShortcutMap, actionKey: string): Live2DActionShortcutMap {
  const next = { ...shortcuts }
  delete next[actionKey]
  return next
}

export function findActionByShortcut(
  shortcuts: Live2DActionShortcutMap,
  shortcut: string,
  modelUuid?: string | null,
): string | undefined {
  return Object.keys(shortcuts).find((actionKey) => {
    if (shortcuts[actionKey] !== shortcut) return false
    if (!modelUuid) return true
    return parseActionKey(actionKey)?.uuid === modelUuid
  })
}

function parseActionKey(actionKey: string): ParsedActionKey | null {
  const parts = actionKey.split(':')
  if (parts[0] === 'motion' && parts.length === 4) {
    const no = Number.parseInt(parts[3], 10)
    if (Number.isNaN(no)) return null
    return {
      kind: 'motion',
      uuid: parts[1],
      group: parts[2],
      no,
    }
  }

  if (parts[0] === 'expression' && parts.length === 3) {
    const index = Number.parseInt(parts[2], 10)
    if (Number.isNaN(index)) return null
    return {
      kind: 'expression',
      uuid: parts[1],
      index,
    }
  }

  return null
}
