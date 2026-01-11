export type KeyCounts = Record<string, number>

export type KeySpec = {
  code: string
  label: string
  shiftLabel?: string
  width?: number
}

export type KeyboardPlatform = 'mac' | 'windows' | 'linux'

const US_QWERTY_LAYOUT_BASE: KeySpec[][] = [
  [
    { code: 'Escape', label: 'Esc' },
    { code: 'F1', label: 'F1' },
    { code: 'F2', label: 'F2' },
    { code: 'F3', label: 'F3' },
    { code: 'F4', label: 'F4' },
    { code: 'F5', label: 'F5' },
    { code: 'F6', label: 'F6' },
    { code: 'F7', label: 'F7' },
    { code: 'F8', label: 'F8' },
    { code: 'F9', label: 'F9' },
    { code: 'F10', label: 'F10' },
    { code: 'F11', label: 'F11' },
    { code: 'F12', label: 'F12' },
    { code: 'PrintScreen', label: 'PrtSc' },
    { code: 'ScrollLock', label: 'ScrLk' },
    { code: 'Pause', label: 'Pause' },
  ],
  [
    { code: 'Backquote', label: '`', shiftLabel: '~' },
    { code: 'Digit1', label: '1', shiftLabel: '!' },
    { code: 'Digit2', label: '2', shiftLabel: '@' },
    { code: 'Digit3', label: '3', shiftLabel: '#' },
    { code: 'Digit4', label: '4', shiftLabel: '$' },
    { code: 'Digit5', label: '5', shiftLabel: '%' },
    { code: 'Digit6', label: '6', shiftLabel: '^' },
    { code: 'Digit7', label: '7', shiftLabel: '&' },
    { code: 'Digit8', label: '8', shiftLabel: '*' },
    { code: 'Digit9', label: '9', shiftLabel: '(' },
    { code: 'Digit0', label: '0', shiftLabel: ')' },
    { code: 'Minus', label: '-', shiftLabel: '_' },
    { code: 'Equal', label: '=', shiftLabel: '+' },
    { code: 'Backspace', label: '⌫', width: 2 },
  ],
  [
    { code: 'Tab', label: 'Tab', width: 1.5 },
    { code: 'KeyQ', label: 'q', shiftLabel: 'Q' },
    { code: 'KeyW', label: 'w', shiftLabel: 'W' },
    { code: 'KeyE', label: 'e', shiftLabel: 'E' },
    { code: 'KeyR', label: 'r', shiftLabel: 'R' },
    { code: 'KeyT', label: 't', shiftLabel: 'T' },
    { code: 'KeyY', label: 'y', shiftLabel: 'Y' },
    { code: 'KeyU', label: 'u', shiftLabel: 'U' },
    { code: 'KeyI', label: 'i', shiftLabel: 'I' },
    { code: 'KeyO', label: 'o', shiftLabel: 'O' },
    { code: 'KeyP', label: 'p', shiftLabel: 'P' },
    { code: 'BracketLeft', label: '[', shiftLabel: '{' },
    { code: 'BracketRight', label: ']', shiftLabel: '}' },
    { code: 'Backslash', label: '\\', shiftLabel: '|', width: 1.5 },
  ],
  [
    { code: 'CapsLock', label: 'Caps', width: 1.75 },
    { code: 'KeyA', label: 'a', shiftLabel: 'A' },
    { code: 'KeyS', label: 's', shiftLabel: 'S' },
    { code: 'KeyD', label: 'd', shiftLabel: 'D' },
    { code: 'KeyF', label: 'f', shiftLabel: 'F' },
    { code: 'KeyG', label: 'g', shiftLabel: 'G' },
    { code: 'KeyH', label: 'h', shiftLabel: 'H' },
    { code: 'KeyJ', label: 'j', shiftLabel: 'J' },
    { code: 'KeyK', label: 'k', shiftLabel: 'K' },
    { code: 'KeyL', label: 'l', shiftLabel: 'L' },
    { code: 'Semicolon', label: ';', shiftLabel: ':' },
    { code: 'Quote', label: "'", shiftLabel: '"' },
    { code: 'Enter', label: '⏎', width: 2.25 },
  ],
  [
    { code: 'ShiftLeft', label: 'Shift', width: 2.25 },
    { code: 'KeyZ', label: 'z', shiftLabel: 'Z' },
    { code: 'KeyX', label: 'x', shiftLabel: 'X' },
    { code: 'KeyC', label: 'c', shiftLabel: 'C' },
    { code: 'KeyV', label: 'v', shiftLabel: 'V' },
    { code: 'KeyB', label: 'b', shiftLabel: 'B' },
    { code: 'KeyN', label: 'n', shiftLabel: 'N' },
    { code: 'KeyM', label: 'm', shiftLabel: 'M' },
    { code: 'Comma', label: ',', shiftLabel: '<' },
    { code: 'Period', label: '.', shiftLabel: '>' },
    { code: 'Slash', label: '/', shiftLabel: '?' },
    { code: 'ShiftRight', label: 'Shift', width: 2.75 },
  ],
  [
    { code: 'ControlLeft', label: 'Ctrl', width: 1.5 },
    { code: 'MetaLeft', label: 'Meta', width: 1.25 },
    { code: 'AltLeft', label: 'Alt', width: 1.25 },
    { code: 'Space', label: 'Space', width: 6 },
    { code: 'AltRight', label: 'Alt', width: 1.25 },
    { code: 'MetaRight', label: 'Meta', width: 1.25 },
    { code: 'ControlRight', label: 'Ctrl', width: 1.5 },
  ],
  [
    { code: 'Insert', label: 'Ins' },
    { code: 'Home', label: 'Home' },
    { code: 'PageUp', label: 'PgUp' },
    { code: 'Delete', label: 'Del' },
    { code: 'End', label: 'End' },
    { code: 'PageDown', label: 'PgDn' },
  ],
  [
    { code: 'ArrowLeft', label: '←' },
    { code: 'ArrowDown', label: '↓' },
    { code: 'ArrowUp', label: '↑' },
    { code: 'ArrowRight', label: '→' },
  ],
]

function withLabelOverrides(layout: KeySpec[][], overrides: Record<string, string>): KeySpec[][] {
  return layout.map((row) =>
    row.map((key) => {
      const next = overrides[key.code]
      return next ? { ...key, label: next } : key
    })
  )
}

export function getUSQwertyLayout(platform: KeyboardPlatform): KeySpec[][] {
  if (platform === 'mac') {
    return withLabelOverrides(US_QWERTY_LAYOUT_BASE, {
      MetaLeft: '⌘',
      MetaRight: '⌘',
      AltLeft: '⌥',
      AltRight: '⌥',
    })
  }
  if (platform === 'windows') {
    return withLabelOverrides(US_QWERTY_LAYOUT_BASE, {
      MetaLeft: 'Win',
      MetaRight: 'Win',
    })
  }
  return withLabelOverrides(US_QWERTY_LAYOUT_BASE, {
    MetaLeft: 'Super',
    MetaRight: 'Super',
  })
}

export function sumKeyCounts(maps: Array<KeyCounts | undefined | null>): KeyCounts {
  const out: KeyCounts = {}
  for (const map of maps) {
    if (!map) continue
    for (const [key, value] of Object.entries(map)) {
      if (!value) continue
      out[key] = (out[key] ?? 0) + value
    }
  }
  return out
}

export function totalKeyCount(map: KeyCounts | undefined | null): number {
  if (!map) return 0
  let sum = 0
  for (const v of Object.values(map)) sum += v
  return sum
}

export type ShortcutId = string

export function buildKeySpecIndex(layout: KeySpec[][]): Record<string, KeySpec> {
  const out: Record<string, KeySpec> = {}
  for (const row of layout) {
    for (const key of row) {
      out[key.code] = key
    }
  }
  return out
}

export function shortcutIdFromParts(parts: {
  meta?: boolean
  ctrl?: boolean
  alt?: boolean
  shift?: boolean
  code: string
}): ShortcutId {
  const tokens: string[] = []
  if (parts.meta) tokens.push('Meta')
  if (parts.ctrl) tokens.push('Ctrl')
  if (parts.alt) tokens.push('Alt')
  if (parts.shift) tokens.push('Shift')
  tokens.push(parts.code)
  return tokens.join('+')
}

export function shortcutDisplay(
  id: ShortcutId,
  platform: KeyboardPlatform,
  keyIndex: Record<string, KeySpec>
): string {
  const parts = id.split('+').filter(Boolean)
  const code = parts[parts.length - 1] ?? id
  const hasShift = parts.includes('Shift')

  const modLabel = (token: string) => {
    if (token === 'Meta') {
      if (platform === 'mac') return '⌘'
      if (platform === 'windows') return 'Win'
      return 'Super'
    }
    if (token === 'Alt') return platform === 'mac' ? '⌥' : 'Alt'
    if (token === 'Ctrl') return 'Ctrl'
    if (token === 'Shift') return platform === 'mac' ? '⇧' : 'Shift'
    return token
  }

  const spec = keyIndex[code]
  const keyLabel = spec ? (hasShift ? spec.shiftLabel ?? spec.label : spec.label) : code

  return [...parts.slice(0, -1).map(modLabel), keyLabel].join(platform === 'mac' ? '' : '+')
}
