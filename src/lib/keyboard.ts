export type KeyCounts = Record<string, number>

export type KeySpec = {
  code: string
  label: string
  shiftLabel?: string
  width?: number
  height?: number
  kind?: 'key' | 'spacer'
}

export type KeyboardPlatform = 'mac' | 'windows' | 'linux'

// “配列”这里指键盘物理尺寸/键位分布（100%/TKL/75%/65%/60%/96/98），而非 QWERTY 等字符布局。
export type KeyboardLayoutId =
  | 'full_104'
  | 'full_108'
  | 'compact_98'
  | 'compact_96'
  | 'tkl_80'
  | 'compact_75'
  | 'compact_65'
  | 'compact_60'
  | 'hhkb'
  | 'macbook_pro'

export const DEFAULT_KEYBOARD_LAYOUT_ID: KeyboardLayoutId = 'tkl_80'

export const KEYBOARD_LAYOUTS: ReadonlyArray<{
  id: KeyboardLayoutId
  name: string
  keyCountHint?: string
}> = [
  { id: 'full_104', name: '全尺寸（104）', keyCountHint: '104' },
  { id: 'full_108', name: '全尺寸（108）', keyCountHint: '108' },
  { id: 'compact_98', name: '98%', keyCountHint: '98' },
  { id: 'compact_96', name: '96%', keyCountHint: '96' },
  { id: 'tkl_80', name: '80%（TKL）', keyCountHint: '87' },
  { id: 'compact_75', name: '75%', keyCountHint: '82/84' },
  { id: 'compact_65', name: '65%', keyCountHint: '68' },
  { id: 'compact_60', name: '60%', keyCountHint: '61' },
  { id: 'hhkb', name: 'HHKB', keyCountHint: '60' },
  { id: 'macbook_pro', name: 'MacBook Pro', keyCountHint: 'Touch Bar' },
]
// Layout definitions live in `getKeyboardLayout` to keep each preset explicit and self-contained.

type KeyOverride = Partial<Pick<KeySpec, 'label' | 'shiftLabel' | 'width'>>

function withKeyOverrides(layout: KeySpec[][], overrides: Record<string, KeyOverride>): KeySpec[][] {
  return layout.map((row) =>
    row.map((key) => {
      const next = overrides[key.code]
      return next ? { ...key, ...next } : key
    })
  )
}

function modifierLabelOverrides(platform: KeyboardPlatform): Record<string, KeyOverride> {
  if (platform === 'mac') {
    return {
      MetaLeft: { label: '⌘' },
      MetaRight: { label: '⌘' },
      AltLeft: { label: '⌥' },
      AltRight: { label: '⌥' },
    }
  }
  if (platform === 'windows') {
    return {
      MetaLeft: { label: 'Win' },
      MetaRight: { label: 'Win' },
    }
  }
  return {
    MetaLeft: { label: 'Super' },
    MetaRight: { label: 'Super' },
  }
}

export function normalizeKeyboardLayoutId(value: unknown): KeyboardLayoutId {
  if (typeof value !== 'string') return DEFAULT_KEYBOARD_LAYOUT_ID
  // Backward-compatible aliases
  if (value === 'full_100') return 'full_104'
  for (const entry of KEYBOARD_LAYOUTS) {
    if (entry.id === value) return entry.id
  }
  return DEFAULT_KEYBOARD_LAYOUT_ID
}

export function getKeyboardLayout(layoutId: KeyboardLayoutId, platform: KeyboardPlatform): KeySpec[][] {
  const withMods = (layout: KeySpec[][]) => withKeyOverrides(layout, modifierLabelOverrides(platform))
  const spacer = (code: string, width = 1): KeySpec => ({ code, label: '', width, kind: 'spacer' })

  const gapBetweenBlocks = (id: string, width = 0.25) => spacer(`__gap_${id}`, width)
  const arrowUpRow = (id: string) => [spacer(`__arrow_${id}_l`), { code: 'ArrowUp', label: '↑' }, spacer(`__arrow_${id}_r`)]

  const numberRow: KeySpec[] = [
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
  ]

  const qRow: KeySpec[] = [
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
  ]

  const aRow: KeySpec[] = [
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
  ]

  const zRow: KeySpec[] = [
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
  ]

  const bottomRow: KeySpec[] = [
    { code: 'ControlLeft', label: 'Ctrl', width: 1.25 },
    { code: 'MetaLeft', label: 'Meta', width: 1.25 },
    { code: 'AltLeft', label: 'Alt', width: 1.25 },
    { code: 'Space', label: 'Space', width: 6.25 },
    { code: 'AltRight', label: 'Alt', width: 1.25 },
    { code: 'MetaRight', label: 'Meta', width: 1.25 },
    { code: 'Fn', label: 'Fn', width: 1.25 },
    { code: 'ControlRight', label: 'Ctrl', width: 1.25 },
  ]

  const arrowBottomRow: KeySpec[] = [
    { code: 'ArrowLeft', label: '←' },
    { code: 'ArrowDown', label: '↓' },
    { code: 'ArrowRight', label: '→' },
  ]

  const navTopRow: KeySpec[] = [
    { code: 'Insert', label: 'Ins' },
    { code: 'Home', label: 'Home' },
    { code: 'PageUp', label: 'PgUp' },
  ]
  const navBottomRow: KeySpec[] = [
    { code: 'Delete', label: 'Del' },
    { code: 'End', label: 'End' },
    { code: 'PageDown', label: 'PgDn' },
  ]

  const numpadTopRow: KeySpec[] = [
    { code: 'NumLock', label: 'Num' },
    { code: 'NumpadDivide', label: '÷' },
    { code: 'NumpadMultiply', label: '×' },
    { code: 'NumpadSubtract', label: '-' },
  ]
  const numpadRow7: KeySpec[] = [
    { code: 'Numpad7', label: '7' },
    { code: 'Numpad8', label: '8' },
    { code: 'Numpad9', label: '9' },
    { code: 'NumpadAdd', label: '+', height: 2 },
  ]
  const numpadRow4: KeySpec[] = [
    { code: 'Numpad4', label: '4' },
    { code: 'Numpad5', label: '5' },
    { code: 'Numpad6', label: '6' },
  ]
  const numpadRow1: KeySpec[] = [
    { code: 'Numpad1', label: '1' },
    { code: 'Numpad2', label: '2' },
    { code: 'Numpad3', label: '3' },
    { code: 'NumpadEnter', label: '⏎', height: 2 },
  ]
  const numpadRow0: KeySpec[] = [
    { code: 'Numpad0', label: '0', width: 2 },
    { code: 'NumpadDecimal', label: '.' },
  ]

  if (layoutId === 'tkl_80') {
    const layout: KeySpec[][] = [
      [
        { code: 'Escape', label: 'Esc' },
        gapBetweenBlocks('tkl_r1_g1', 0.5),
        { code: 'F1', label: 'F1' },
        { code: 'F2', label: 'F2' },
        { code: 'F3', label: 'F3' },
        { code: 'F4', label: 'F4' },
        gapBetweenBlocks('tkl_r1_g2', 0.5),
        { code: 'F5', label: 'F5' },
        { code: 'F6', label: 'F6' },
        { code: 'F7', label: 'F7' },
        { code: 'F8', label: 'F8' },
        gapBetweenBlocks('tkl_r1_g3', 0.5),
        { code: 'F9', label: 'F9' },
        { code: 'F10', label: 'F10' },
        { code: 'F11', label: 'F11' },
        { code: 'F12', label: 'F12' },
        gapBetweenBlocks('tkl_r1_g4', 0.25),
        { code: 'PrintScreen', label: 'PrtSc' },
        { code: 'ScrollLock', label: 'ScrLk' },
        { code: 'Pause', label: 'Pause' },
      ],
      [...numberRow, gapBetweenBlocks('tkl_r2'), ...navTopRow],
      [...qRow, gapBetweenBlocks('tkl_r3'), ...navBottomRow],
      [...aRow],
      [...zRow, gapBetweenBlocks('tkl_r5'), ...arrowUpRow('tkl')],
      [...bottomRow, gapBetweenBlocks('tkl_r6'), ...arrowBottomRow],
    ]
    return withMods(layout)
  }

  if (layoutId === 'full_104') {
    const layout: KeySpec[][] = [
      [
        { code: 'Escape', label: 'Esc' },
        gapBetweenBlocks('full_r1_g1', 0.5),
        { code: 'F1', label: 'F1' },
        { code: 'F2', label: 'F2' },
        { code: 'F3', label: 'F3' },
        { code: 'F4', label: 'F4' },
        gapBetweenBlocks('full_r1_g2', 0.5),
        { code: 'F5', label: 'F5' },
        { code: 'F6', label: 'F6' },
        { code: 'F7', label: 'F7' },
        { code: 'F8', label: 'F8' },
        gapBetweenBlocks('full_r1_g3', 0.5),
        { code: 'F9', label: 'F9' },
        { code: 'F10', label: 'F10' },
        { code: 'F11', label: 'F11' },
        { code: 'F12', label: 'F12' },
        gapBetweenBlocks('full_r1_g4', 0.25),
        { code: 'PrintScreen', label: 'PrtSc' },
        { code: 'ScrollLock', label: 'ScrLk' },
        { code: 'Pause', label: 'Pause' },
      ],
      [
        ...numberRow,
        gapBetweenBlocks('full_r2_g1'),
        ...navTopRow,
        gapBetweenBlocks('full_r2_g2'),
        ...numpadTopRow,
      ],
      [
        ...qRow,
        gapBetweenBlocks('full_r3_g1'),
        ...navBottomRow,
        gapBetweenBlocks('full_r3_g2'),
        ...numpadRow7,
      ],
      [
        ...aRow,
        gapBetweenBlocks('full_r4_g1'),
        spacer('__full_r4_nav_blank', 3),
        gapBetweenBlocks('full_r4_g2'),
        ...numpadRow4,
      ],
      [
        ...zRow,
        gapBetweenBlocks('full_r5_g1'),
        ...arrowUpRow('full'),
        gapBetweenBlocks('full_r5_g2'),
        ...numpadRow1,
      ],
      [
        ...bottomRow,
        gapBetweenBlocks('full_r6_g1'),
        ...arrowBottomRow,
        gapBetweenBlocks('full_r6_g2'),
        ...numpadRow0,
      ],
    ]
    return withMods(layout)
  }

  if (layoutId === 'full_108') {
    const layout: KeySpec[][] = [
      [
        { code: 'Escape', label: 'Esc' },
        gapBetweenBlocks('full108_r1_g1', 0.5),
        { code: 'F1', label: 'F1' },
        { code: 'F2', label: 'F2' },
        { code: 'F3', label: 'F3' },
        { code: 'F4', label: 'F4' },
        gapBetweenBlocks('full108_r1_g2', 0.5),
        { code: 'F5', label: 'F5' },
        { code: 'F6', label: 'F6' },
        { code: 'F7', label: 'F7' },
        { code: 'F8', label: 'F8' },
        gapBetweenBlocks('full108_r1_g3', 0.5),
        { code: 'F9', label: 'F9' },
        { code: 'F10', label: 'F10' },
        { code: 'F11', label: 'F11' },
        { code: 'F12', label: 'F12' },
        gapBetweenBlocks('full108_r1_g4', 0.25),
        { code: 'PrintScreen', label: 'PrtSc' },
        { code: 'ScrollLock', label: 'ScrLk' },
        { code: 'Pause', label: 'Pause' },
        gapBetweenBlocks('full108_r1_g5', 0.25),
        { code: 'Calculator', label: 'Cal' },
        { code: 'MediaTrackPrevious', label: '◄' },
        { code: 'MediaTrackNext', label: '►' },
        { code: 'AudioVolumeMute', label: 'Vol' },
      ],
      [
        ...numberRow,
        gapBetweenBlocks('full108_r2_g1'),
        ...navTopRow,
        gapBetweenBlocks('full108_r2_g2'),
        ...numpadTopRow,
      ],
      [
        ...qRow,
        gapBetweenBlocks('full108_r3_g1'),
        ...navBottomRow,
        gapBetweenBlocks('full108_r3_g2'),
        ...numpadRow7,
      ],
      [
        ...aRow,
        gapBetweenBlocks('full108_r4_g1'),
        spacer('__full108_r4_nav_blank', 3),
        gapBetweenBlocks('full108_r4_g2'),
        ...numpadRow4,
      ],
      [
        ...zRow,
        gapBetweenBlocks('full108_r5_g1'),
        ...arrowUpRow('full108'),
        gapBetweenBlocks('full108_r5_g2'),
        ...numpadRow1,
      ],
      [
        ...bottomRow,
        gapBetweenBlocks('full108_r6_g1'),
        ...arrowBottomRow,
        gapBetweenBlocks('full108_r6_g2'),
        ...numpadRow0,
      ],
    ]
    return withMods(layout)
  }

  if (layoutId === 'compact_98') {
    const layout: KeySpec[][] = [
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
      [...numberRow, ...navTopRow, ...numpadTopRow],
      [...qRow, ...navBottomRow, ...numpadRow7],
      [...aRow, ...numpadRow4],
      [...zRow, ...arrowUpRow('c98'), ...numpadRow1],
      [...bottomRow, ...arrowBottomRow, ...numpadRow0],
    ]
    return withMods(layout)
  }

  if (layoutId === 'hhkb') {
    // HHKB-style: no function row, Control on home-row, Backspace key labeled Delete, dedicated Fn key.
    const layout: KeySpec[][] = [
      [
        { code: 'Escape', label: 'Esc' },
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
        { code: 'Backslash', label: '\\', shiftLabel: '|' },
        { code: 'Backquote', label: '`', shiftLabel: '~' },
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
        { code: 'Backspace', label: 'Del', width: 1.5 },
      ],
      [
        { code: 'ControlLeft', label: 'Ctrl', width: 1.75 },
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
        { code: 'ShiftRight', label: 'Shift', width: 1.75 },
        { code: 'Fn', label: 'Fn', width: 1 },
      ],
      [
        spacer('__hhkb_bottom_l', 1.5),
        { code: 'AltLeft', label: 'Alt', width: 1.5 },
        { code: 'MetaLeft', label: 'Meta', width: 1.5 },
        { code: 'Space', label: 'Space', width: 6 },
        { code: 'MetaRight', label: 'Meta', width: 1.5 },
        { code: 'AltRight', label: 'Alt', width: 1.5 },
        spacer('__hhkb_bottom_r', 1.5),
      ],
    ]
    return withMods(layout)
  }

  if (layoutId === 'macbook_pro') {
    // Approximate the MacBook Pro (Touch Bar era) physical keyboard: no function row, with inverted-T arrow cluster.
    // Note: arrow key heights are not modeled; shown as a single-row cluster for consistency with other presets.
    const layout: KeySpec[][] = [
      [
        { code: 'Escape', label: 'Esc', width: 1.25 },
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
        { code: 'Backspace', label: 'Del', width: 2 },
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
        { code: 'Fn', label: 'Fn', width: 1.25 },
        { code: 'ControlLeft', label: 'Ctrl', width: 1.25 },
        { code: 'AltLeft', label: 'Alt', width: 1.25 },
        { code: 'MetaLeft', label: 'Meta', width: 1.5 },
        { code: 'Space', label: 'Space', width: 6 },
        { code: 'MetaRight', label: 'Meta', width: 1.5 },
        { code: 'AltRight', label: 'Alt', width: 1.25 },
        { code: 'ArrowLeft', label: '←' },
        { code: 'ArrowUp', label: '↑' },
        { code: 'ArrowDown', label: '↓' },
        { code: 'ArrowRight', label: '→' },
      ],
    ]
    return withMods(layout)
  }

  if (layoutId === 'compact_96') {
    const layout: KeySpec[][] = [
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
      [...numberRow, { code: 'Delete', label: 'Del' }, ...numpadTopRow],
      [...qRow, { code: 'PageUp', label: 'PgUp' }, ...numpadRow7],
      [...aRow, { code: 'PageDown', label: 'PgDn' }, ...numpadRow4],
      [...zRow, { code: 'ArrowUp', label: '↑' }, ...numpadRow1],
      [...bottomRow, ...arrowBottomRow, ...numpadRow0],
    ]
    return withMods(layout)
  }

  if (layoutId === 'compact_75') {
    const layout: KeySpec[][] = [
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
      ],
      [...numberRow, { code: 'Delete', label: 'Del' }],
      [...qRow, { code: 'PageUp', label: 'PgUp' }],
      [...aRow, { code: 'PageDown', label: 'PgDn' }],
      [...zRow, { code: 'ArrowUp', label: '↑' }],
      [...bottomRow, { code: 'ArrowLeft', label: '←' }, { code: 'ArrowDown', label: '↓' }, { code: 'ArrowRight', label: '→' }],
    ]
    return withMods(layout)
  }

  if (layoutId === 'compact_65') {
    const layout: KeySpec[][] = [
      [{ code: 'Escape', label: 'Esc', width: 1.25 }, ...numberRow, { code: 'Delete', label: 'Del', width: 1.25 }],
      [...qRow, { code: 'PageUp', label: 'PgUp', width: 1.25 }],
      [...aRow, { code: 'PageDown', label: 'PgDn', width: 1.25 }],
      [...zRow, { code: 'ArrowUp', label: '↑' }],
      [...bottomRow, ...arrowBottomRow],
    ]
    return withMods(layout)
  }

  // compact_60
  const layout: KeySpec[][] = [
    [
      { code: 'Escape', label: 'Esc', width: 1.25 },
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
    [...qRow],
    [...aRow],
    [...zRow],
    [
      { code: 'ControlLeft', label: 'Ctrl', width: 1.25 },
      { code: 'MetaLeft', label: 'Meta', width: 1.25 },
      { code: 'AltLeft', label: 'Alt', width: 1.25 },
      { code: 'Space', label: 'Space', width: 6.25 },
      { code: 'AltRight', label: 'Alt', width: 1.25 },
      { code: 'MetaRight', label: 'Meta', width: 1.25 },
      { code: 'ControlRight', label: 'Ctrl', width: 1.25 },
    ],
  ]
  return withMods(layout)
}

export function getUSQwertyLayout(platform: KeyboardPlatform): KeySpec[][] {
  return getKeyboardLayout(DEFAULT_KEYBOARD_LAYOUT_ID, platform)
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
      if (key.kind === 'spacer') continue
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
