import { describe, expect, it, vi } from 'vitest'
import { createKeyboardPianoMapper } from './keyboardPiano'
import {
  ChordProgressionState,
  PROGRESSIONS,
  createHarmonicMapper,
  foldOctave,
  snapToChord,
  type ChordDef,
} from './keyboardPianoHarmony'

describe('ChordProgressionState', () => {
  it('starts on chord index 0', () => {
    const state = new ChordProgressionState('pop')
    expect(state.currentChord()).toEqual(PROGRESSIONS.pop[0])
  })

  it('advances chord after 8 ticks', () => {
    const state = new ChordProgressionState('pop')
    for (let i = 0; i < 8; i++) state.tick()
    expect(state.currentChord()).toEqual(PROGRESSIONS.pop[1])
  })

  it('wraps around at end of progression', () => {
    const state = new ChordProgressionState('jazz')
    for (let i = 0; i < 24; i++) state.tick()
    expect(state.currentChord()).toEqual(PROGRESSIONS.jazz[0])
  })

  it('resets to chord 0 after 4 seconds of inactivity', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-28T10:00:00.000Z'))

    const state = new ChordProgressionState('pop')
    for (let i = 0; i < 8; i++) state.tick()
    expect(state.currentChord()).toEqual(PROGRESSIONS.pop[1])

    vi.advanceTimersByTime(4001)
    state.tick()

    expect(state.currentChord()).toEqual(PROGRESSIONS.pop[0])
    vi.useRealTimers()
  })
})

describe('foldOctave', () => {
  it('returns same note when within 7 semitones', () => {
    expect(foldOctave(64, 60)).toBe(64)
  })

  it('shifts note down when too far above', () => {
    expect(foldOctave(72, 60)).toBe(60)
  })

  it('shifts note up when too far below', () => {
    expect(foldOctave(48, 60)).toBe(60)
  })

  it('clamps the folded note into the MIDI range', () => {
    expect(foldOctave(3, 0)).toBeGreaterThanOrEqual(0)
    expect(foldOctave(124, 127)).toBeLessThanOrEqual(127)
  })
})

describe('snapToChord', () => {
  const cChord = PROGRESSIONS.pop[0]

  it('snaps to the nearest chord tone with directional tie breaking', () => {
    expect(snapToChord(62, cChord, 'left', 0)).toBe(60)
    expect(snapToChord(62, cChord, 'right', 0)).toBe(64)
  })

  it('uses deterministic seeded tie breaking for center keys', () => {
    expect(snapToChord(62, cChord, 'center', 0)).toBe(60)
    expect(snapToChord(62, cChord, 'center', 1)).toBe(64)
  })

  it('keeps an exact chord tone unchanged', () => {
    expect(snapToChord(60, cChord, 'center', 0)).toBe(60)
    expect(snapToChord(64, cChord, 'center', 0)).toBe(64)
  })

  it('only uses passing tones when no chord tone is within 2 semitones', () => {
    const sparseChord: ChordDef = {
      rootPitchClass: 0,
      primary: [0],
      passing: [5],
    }

    expect(snapToChord(65, sparseChord, 'center', 0)).toBe(65)
  })

  it('prefers a smaller melodic step when two harmonic targets are both plausible', () => {
    expect(snapToChord(66, cChord, 'center', 0, 60)).toBe(64)
  })
})

describe('createHarmonicMapper', () => {
  it('returns notes within 7 semitones of the previous note', () => {
    const base = createKeyboardPianoMapper({ keyboardLayoutId: 'compact_60', scale: 'major' })
    const mapper = createHarmonicMapper(base, 'pop')

    const first = mapper.midiForCode('KeyA', 'left')
    const second = mapper.midiForCode('KeyP', 'right')

    expect(Math.abs(second - first)).toBeLessThanOrEqual(7)
  })

  it('initializes the previous-note anchor from the first chord root of the progression', () => {
    const base = {
      midiForCode: () => 80,
    }
    const mapper = createHarmonicMapper(base, 'jazz')

    expect(mapper.midiForCode('KeyA', 'right')).toBe(69)
  })

  it('keeps repeated center-key ties on a stable pitch instead of alternating', () => {
    const base = {
      midiForCode: () => 62,
    }
    const mapper = createHarmonicMapper(base, 'pop')

    const first = mapper.midiForCode('KeyF', 'center')
    const second = mapper.midiForCode('KeyF', 'center')
    const third = mapper.midiForCode('KeyF', 'center')

    expect([first, second, third]).toEqual([60, 60, 60])
  })

  it('constrains snapped notes to the current harmonic palette', () => {
    const base = createKeyboardPianoMapper({ keyboardLayoutId: 'compact_60', scale: 'chromatic' })
    const mapper = createHarmonicMapper(base, 'pop')
    const cMajorPitchClasses = new Set([0, 2, 4, 5, 7, 9, 11])

    for (const code of ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG']) {
      const midi = mapper.midiForCode(code, 'center')
      expect(cMajorPitchClasses.has(((midi % 12) + 12) % 12)).toBe(true)
    }
  })

  it('turns rapid far-apart targets into adjacent harmonic steps', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-28T10:00:00.000Z'))

    const notes = [60, 67, 72]
    const base = {
      midiForCode: () => notes.shift() ?? 72,
    }
    const mapper = createHarmonicMapper(base, 'pop')

    const first = mapper.midiForCode('KeyA', 'center')
    vi.advanceTimersByTime(35)
    const second = mapper.midiForCode('KeyB', 'center')
    vi.advanceTimersByTime(35)
    const third = mapper.midiForCode('KeyC', 'center')

    expect([first, second, third]).toEqual([60, 64, 67])
    vi.useRealTimers()
  })

  it('keeps wider melodic moves available at normal typing speed', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-28T10:00:00.000Z'))

    const notes = [60, 67, 72]
    const base = {
      midiForCode: () => notes.shift() ?? 72,
    }
    const mapper = createHarmonicMapper(base, 'pop')

    const first = mapper.midiForCode('KeyA', 'center')
    vi.advanceTimersByTime(220)
    const second = mapper.midiForCode('KeyB', 'center')
    vi.advanceTimersByTime(220)
    const third = mapper.midiForCode('KeyC', 'center')

    expect([first, second, third]).toEqual([60, 67, 72])
    vi.useRealTimers()
  })
})
