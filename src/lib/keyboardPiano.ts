import { getKeyboardLayout, normalizeKeyboardLayoutId, type KeyboardPlatform, type KeyboardLayoutId, type KeySpec } from '@/lib/keyboard'
import { isMac, isWindows } from '@/utils/platform'

export type KeyboardPianoScale = 'pentatonic_major' | 'major' | 'chromatic'
export type KeyboardPianoWave = 'sine' | 'triangle' | 'square' | 'sawtooth'

export type KeyboardPianoMapperConfig = {
  keyboardLayoutId: KeyboardLayoutId
  scale: KeyboardPianoScale
}

function platformToKeyboardPlatform(): KeyboardPlatform {
  if (isMac()) return 'mac'
  if (isWindows()) return 'windows'
  return 'linux'
}

function scaleIntervals(scale: KeyboardPianoScale): number[] {
  switch (scale) {
    case 'pentatonic_major':
      return [0, 2, 4, 7, 9]
    case 'major':
      return [0, 2, 4, 5, 7, 9, 11]
    case 'chromatic':
      return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
  }
}

function shouldIgnoreKeyCode(code: string): boolean {
  return (
    code === 'ShiftLeft' ||
    code === 'ShiftRight' ||
    code === 'ControlLeft' ||
    code === 'ControlRight' ||
    code === 'AltLeft' ||
    code === 'AltRight' ||
    code === 'MetaLeft' ||
    code === 'MetaRight' ||
    code === 'CapsLock' ||
    code === 'Fn'
  )
}

function findRowIndex(rows: KeySpec[][], predicate: (codes: string[]) => boolean): number | null {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const codes = rows[rowIndex]
      .filter((k) => k.kind !== 'spacer')
      .map((k) => k.code)
      .filter((code) => !code.startsWith('__'))
    if (predicate(codes)) return rowIndex
  }
  return null
}

function rowBaseOctave(rowIndex: number, anchors: { number: number; q: number; a: number; z: number; space: number }): number {
  if (rowIndex === anchors.number) return 6
  if (rowIndex === anchors.q) return 5
  if (rowIndex === anchors.a) return 4
  if (rowIndex === anchors.z) return 3
  if (rowIndex === anchors.space) return 2
  return 4
}

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export type KeyboardPianoMapper = {
  midiForCode: (code: string) => number
}

export function createKeyboardPianoMapper(config: KeyboardPianoMapperConfig): KeyboardPianoMapper {
  const platform = platformToKeyboardPlatform()
  const layoutId = normalizeKeyboardLayoutId(config.keyboardLayoutId)
  const layoutRows = getKeyboardLayout(layoutId, platform)
  const intervals = scaleIntervals(config.scale)

  const numberRowIndex =
    findRowIndex(layoutRows, (codes) => codes.includes('Backquote') && codes.includes('Digit1') && codes.includes('Backspace')) ?? 0
  const qRowIndex = findRowIndex(layoutRows, (codes) => codes.includes('KeyQ') && codes.includes('KeyP')) ?? numberRowIndex + 1
  const aRowIndex = findRowIndex(layoutRows, (codes) => codes.includes('KeyA') && codes.includes('Enter')) ?? qRowIndex + 1
  const zRowIndex = findRowIndex(layoutRows, (codes) => codes.includes('KeyZ') && codes.includes('KeyM')) ?? aRowIndex + 1
  const spaceRowIndex = findRowIndex(layoutRows, (codes) => codes.includes('Space')) ?? zRowIndex + 1

  const anchors = {
    number: numberRowIndex,
    q: qRowIndex,
    a: aRowIndex,
    z: zRowIndex,
    space: spaceRowIndex,
  }

  const map = new Map<string, number>()
  const rootPitchClass = 0 // C

  for (let rowIndex = 0; rowIndex < layoutRows.length; rowIndex++) {
    const row = layoutRows[rowIndex]
    const keys = row
      .filter((k) => k.kind !== 'spacer')
      .map((k) => k.code)
      .filter((code) => !code.startsWith('__'))
      .filter((code) => !shouldIgnoreKeyCode(code))

    if (keys.length === 0) continue

    const baseOctave = rowBaseOctave(rowIndex, anchors)
    const baseMidi = baseOctave * 12 + rootPitchClass

    for (let col = 0; col < keys.length; col++) {
      const degree = col % intervals.length
      const octaveOffset = Math.floor(col / intervals.length)
      const midi = baseMidi + intervals[degree] + octaveOffset * 12
      map.set(keys[col], Math.max(0, Math.min(127, midi)))
    }
  }

  const fallbackNotes: number[] = []
  for (let octave = 2; octave <= 6; octave++) {
    for (const interval of intervals) {
      fallbackNotes.push(octave * 12 + rootPitchClass + interval)
    }
  }

  return {
    midiForCode: (code: string) => {
      const mapped = map.get(code)
      if (mapped != null) return mapped
      const idx = fnv1a32(code) % fallbackNotes.length
      return fallbackNotes[idx]
    },
  }
}

function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

export class KeyboardPianoSynth {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private wave: KeyboardPianoWave = 'triangle'
  private volume = 0.25

  getState(): AudioContextState | 'uninitialized' {
    if (!this.ctx) return 'uninitialized'
    return this.ctx.state
  }

  setVolume(volume: number) {
    const v = Math.max(0, Math.min(1, volume))
    this.volume = v
    const ctx = this.ctx
    if (this.master && ctx) {
      this.master.gain.setValueAtTime(v, ctx.currentTime)
    }
  }

  setWave(wave: KeyboardPianoWave) {
    this.wave = wave
  }

  async ensureStarted(): Promise<void> {
    if (!this.ctx) {
      const ctx = new AudioContext()
      const master = ctx.createGain()
      master.gain.value = this.volume

      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 1800
      filter.Q.value = 0.9

      master.connect(filter)
      filter.connect(ctx.destination)

      this.ctx = ctx
      this.master = master
    }

    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume()
      } catch {
        // ignore
      }
    }
  }

  playMidi(midi: number, velocity = 1): void {
    if (!this.ctx || !this.master) return
    const ctx = this.ctx
    const now = ctx.currentTime

    const osc = ctx.createOscillator()
    osc.type = this.wave
    osc.frequency.setValueAtTime(midiToFrequency(midi), now)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, now)

    const amp = Math.max(0, Math.min(1, velocity)) * 0.9
    const attack = 0.004
    const decay = 0.09
    const release = 0.12
    gain.gain.linearRampToValueAtTime(amp, now + attack)
    gain.gain.exponentialRampToValueAtTime(0.06, now + attack + decay)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay + release)

    osc.connect(gain)
    gain.connect(this.master)

    osc.start(now)
    osc.stop(now + attack + decay + release)
  }

  stop(): void {
    if (!this.ctx) return
    try {
      void this.ctx.close()
    } catch {
      // ignore
    }
    this.ctx = null
    this.master = null
  }
}
