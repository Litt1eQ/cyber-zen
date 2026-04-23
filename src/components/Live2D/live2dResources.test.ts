import { describe, expect, it } from 'vitest'
import {
  buildResourceKeyCandidates,
  pressResource,
  releaseResource,
  resolveResourceEntry,
  type Live2DResourceEntry,
  type PressedLive2DResourceMap,
} from './live2dResources'

const supported: Record<string, Live2DResourceEntry> = {
  Num1: { group: 'left-keys', src: '/left/Num1.png' },
  BackQuote: { group: 'left-keys', src: '/left/BackQuote.png' },
  LeftArrow: { group: 'right-keys', src: '/right/LeftArrow.png' },
  Control: { group: 'left-keys', src: '/left/Control.png' },
  ControlRight: { group: 'right-keys', src: '/right/ControlRight.png' },
  KeyA: { group: 'left-keys', src: '/left/KeyA.png' },
  KeyL: { group: 'right-keys', src: '/right/KeyL.png' },
}

describe('buildResourceKeyCandidates', () => {
  it('adds filename aliases used by BongoCat resources', () => {
    expect(buildResourceKeyCandidates('Digit1')).toEqual(['Digit1', 'Num1'])
    expect(buildResourceKeyCandidates('Backquote')).toEqual(['Backquote', 'BackQuote'])
    expect(buildResourceKeyCandidates('Enter')).toEqual(['Enter', 'Return'])
    expect(buildResourceKeyCandidates('ArrowLeft')).toEqual(['ArrowLeft', 'LeftArrow'])
  })

  it('falls back to generic modifier names after side-specific keys', () => {
    expect(buildResourceKeyCandidates('ControlRight')).toEqual(['ControlRight', 'Control'])
    expect(buildResourceKeyCandidates('ShiftLeft')).toEqual(['ShiftLeft', 'Shift'])
  })
})

describe('resolveResourceEntry', () => {
  it('matches aliases when the exact DOM code does not exist in resources', () => {
    expect(resolveResourceEntry('Digit1', supported)).toEqual({
      key: 'Num1',
      group: 'left-keys',
      src: '/left/Num1.png',
    })
    expect(resolveResourceEntry('Backquote', supported)).toEqual({
      key: 'BackQuote',
      group: 'left-keys',
      src: '/left/BackQuote.png',
    })
    expect(resolveResourceEntry('ArrowLeft', supported)).toEqual({
      key: 'LeftArrow',
      group: 'right-keys',
      src: '/right/LeftArrow.png',
    })
  })

  it('prefers side-specific resources before generic modifier resources', () => {
    expect(resolveResourceEntry('ControlRight', supported)).toEqual({
      key: 'ControlRight',
      group: 'right-keys',
      src: '/right/ControlRight.png',
    })
  })
})

describe('pressed resource reducer', () => {
  it('keeps one pressed resource per group and ignores stale releases', () => {
    let pressed: PressedLive2DResourceMap = {}

    pressed = pressResource(pressed, 'KeyA', supported)
    expect(pressed).toEqual({
      'left-keys': { inputKey: 'KeyA', src: '/left/KeyA.png' },
    })

    pressed = pressResource(pressed, 'Digit1', supported)
    expect(pressed).toEqual({
      'left-keys': { inputKey: 'Digit1', src: '/left/Num1.png' },
    })

    pressed = releaseResource(pressed, 'KeyA')
    expect(pressed).toEqual({
      'left-keys': { inputKey: 'Digit1', src: '/left/Num1.png' },
    })

    pressed = pressResource(pressed, 'KeyL', supported)
    expect(pressed).toEqual({
      'left-keys': { inputKey: 'Digit1', src: '/left/Num1.png' },
      'right-keys': { inputKey: 'KeyL', src: '/right/KeyL.png' },
    })

    pressed = releaseResource(pressed, 'Digit1')
    pressed = releaseResource(pressed, 'KeyL')
    expect(pressed).toEqual({})
  })
})
