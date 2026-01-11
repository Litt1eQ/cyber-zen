export type KeyCounts = Record<string, number>

export type KeySpec = {
  code: string
  label: string
  width?: number
}

export type KeyboardPlatform = 'mac' | 'windows' | 'linux'

const US_QWERTY_LAYOUT_BASE: KeySpec[][] = [
  [
    { code: 'Backquote', label: '`' },
    { code: 'Digit1', label: '1' },
    { code: 'Digit2', label: '2' },
    { code: 'Digit3', label: '3' },
    { code: 'Digit4', label: '4' },
    { code: 'Digit5', label: '5' },
    { code: 'Digit6', label: '6' },
    { code: 'Digit7', label: '7' },
    { code: 'Digit8', label: '8' },
    { code: 'Digit9', label: '9' },
    { code: 'Digit0', label: '0' },
    { code: 'Minus', label: '-' },
    { code: 'Equal', label: '=' },
    { code: 'Backspace', label: '⌫', width: 2 },
  ],
  [
    { code: 'Tab', label: 'Tab', width: 1.5 },
    { code: 'KeyQ', label: 'Q' },
    { code: 'KeyW', label: 'W' },
    { code: 'KeyE', label: 'E' },
    { code: 'KeyR', label: 'R' },
    { code: 'KeyT', label: 'T' },
    { code: 'KeyY', label: 'Y' },
    { code: 'KeyU', label: 'U' },
    { code: 'KeyI', label: 'I' },
    { code: 'KeyO', label: 'O' },
    { code: 'KeyP', label: 'P' },
    { code: 'BracketLeft', label: '[' },
    { code: 'BracketRight', label: ']' },
    { code: 'Backslash', label: '\\', width: 1.5 },
  ],
  [
    { code: 'CapsLock', label: 'Caps', width: 1.75 },
    { code: 'KeyA', label: 'A' },
    { code: 'KeyS', label: 'S' },
    { code: 'KeyD', label: 'D' },
    { code: 'KeyF', label: 'F' },
    { code: 'KeyG', label: 'G' },
    { code: 'KeyH', label: 'H' },
    { code: 'KeyJ', label: 'J' },
    { code: 'KeyK', label: 'K' },
    { code: 'KeyL', label: 'L' },
    { code: 'Semicolon', label: ';' },
    { code: 'Quote', label: "'" },
    { code: 'Enter', label: '⏎', width: 2.25 },
  ],
  [
    { code: 'ShiftLeft', label: 'Shift', width: 2.25 },
    { code: 'KeyZ', label: 'Z' },
    { code: 'KeyX', label: 'X' },
    { code: 'KeyC', label: 'C' },
    { code: 'KeyV', label: 'V' },
    { code: 'KeyB', label: 'B' },
    { code: 'KeyN', label: 'N' },
    { code: 'KeyM', label: 'M' },
    { code: 'Comma', label: ',' },
    { code: 'Period', label: '.' },
    { code: 'Slash', label: '/' },
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
