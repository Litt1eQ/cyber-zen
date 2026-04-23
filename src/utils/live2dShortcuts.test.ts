import { beforeEach, describe, expect, it } from 'vitest'
import type { Settings } from '@/types/merit'
import {
  buildExpressionActionKey,
  buildMotionActionKey,
  clearShortcut,
  findActionByShortcut,
  formatShortcutFromCode,
  formatShortcutFromDOM,
  getShortcutForAction,
  isModifierCode,
  readActionShortcuts,
  setShortcut,
} from './live2dShortcuts'

function makeSettings(shortcuts?: Record<string, string>): Settings {
  return {
    enable_keyboard: true,
    enable_mouse_single: true,
    always_on_top: true,
    window_pass_through: false,
    show_taskbar_icon: false,
    launch_on_startup: false,
    wooden_fish_skin: 'rosewood',
    opacity: 0.95,
    wooden_fish_opacity: 1,
    animation_speed: 1,
    window_scale: 100,
    merit_pop_opacity: 0.82,
    merit_pop_label: '功德',
    live2d_action_shortcuts: shortcuts,
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('isModifierCode', () => {
  it('returns true for modifier codes', () => {
    expect(isModifierCode('ControlLeft')).toBe(true)
    expect(isModifierCode('ShiftRight')).toBe(true)
    expect(isModifierCode('MetaLeft')).toBe(true)
  })

  it('returns false for non-modifier codes', () => {
    expect(isModifierCode('F1')).toBe(false)
    expect(isModifierCode('KeyA')).toBe(false)
  })
})

describe('formatShortcutFromDOM', () => {
  it('returns code when no modifiers are active', () => {
    const event = {
      code: 'F1',
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    } as KeyboardEvent

    expect(formatShortcutFromDOM(event)).toBe('F1')
  })

  it('normalizes meta key to Control', () => {
    const event = {
      code: 'F2',
      ctrlKey: false,
      altKey: false,
      shiftKey: true,
      metaKey: true,
    } as KeyboardEvent

    expect(formatShortcutFromDOM(event)).toBe('Control+Shift+F2')
  })
})

describe('formatShortcutFromCode', () => {
  it('formats modifiers in Control Alt Shift order', () => {
    expect(formatShortcutFromCode('F3', { ctrl: true, alt: true, shift: true })).toBe('Control+Alt+Shift+F3')
    expect(formatShortcutFromCode('F4', { ctrl: false, alt: false, shift: false })).toBe('F4')
  })
})

describe('action key helpers', () => {
  it('builds stable motion and expression action keys', () => {
    expect(buildMotionActionKey('uuid1', 'tap', 0)).toBe('motion:uuid1:tap:0')
    expect(buildExpressionActionKey('uuid1', 2)).toBe('expression:uuid1:2')
  })
})

describe('settings-backed shortcut helpers', () => {
  it('reads empty shortcuts from missing settings field', () => {
    expect(readActionShortcuts(makeSettings())).toEqual({})
  })

  it('returns shortcut for action key', () => {
    const settings = makeSettings({
      'motion:uuid1:tap:0': 'F1',
    })

    expect(getShortcutForAction(readActionShortcuts(settings), 'motion:uuid1:tap:0')).toBe('F1')
  })

  it('sets a shortcut and removes conflicting shortcut only within the same model uuid', () => {
    const next = setShortcut(
      {
        'motion:uuid1:idle:0': 'F3',
        'motion:uuid2:idle:0': 'F3',
      },
      'expression:uuid1:1',
      'F3',
    )

    expect(next.shortcuts).toEqual({
      'motion:uuid2:idle:0': 'F3',
      'expression:uuid1:1': 'F3',
    })
    expect(next.replacedActionKey).toBe('motion:uuid1:idle:0')
  })

  it('clears a shortcut entry', () => {
    expect(
      clearShortcut(
        {
          'expression:uuid1:0': 'F2',
        },
        'expression:uuid1:0',
      ),
    ).toEqual({})
  })

  it('finds an action by shortcut and optional model uuid', () => {
    const shortcuts = {
      'motion:uuid1:tap:0': 'F4',
      'expression:uuid2:1': 'F4',
    }

    expect(findActionByShortcut(shortcuts, 'F4', 'uuid1')).toBe('motion:uuid1:tap:0')
    expect(findActionByShortcut(shortcuts, 'F4', 'uuid2')).toBe('expression:uuid2:1')
    expect(findActionByShortcut(shortcuts, 'F4', 'uuid3')).toBeUndefined()
  })
})
