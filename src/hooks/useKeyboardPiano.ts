import { useEffect, useMemo, useRef } from 'react'
import { listen } from '@tauri-apps/api/event'
import type { Settings } from '@/types/merit'
import { EVENTS } from '@/types/events'
import { KeyboardPianoSynth, createKeyboardPianoMapper, type KeyboardPianoScale, type KeyboardPianoWave } from '@/lib/keyboardPiano'
import { logWarn } from '@/lib/logging'
import { normalizeKeyboardLayoutId } from '@/lib/keyboard'

type PianoKeyEventPayload = { code: string }

function normalizeScale(value: unknown): KeyboardPianoScale {
  if (value === 'pentatonic_major' || value === 'major' || value === 'chromatic') return value
  return 'pentatonic_major'
}

function normalizeWave(value: unknown): KeyboardPianoWave {
  if (value === 'sine' || value === 'triangle' || value === 'square' || value === 'sawtooth') return value
  return 'triangle'
}

function normalizeVolume(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0.25
  return Math.max(0, Math.min(1, value))
}

export function useKeyboardPiano(settings: Settings | null) {
  const enabled = settings?.keyboard_piano_enabled ?? false
  const volume = normalizeVolume(settings?.keyboard_piano_volume)
  const scale = normalizeScale(settings?.keyboard_piano_scale)
  const wave = normalizeWave(settings?.keyboard_piano_wave)
  const layoutId = normalizeKeyboardLayoutId(settings?.keyboard_layout)

  const synthRef = useRef<KeyboardPianoSynth | null>(null)
  const warnedRef = useRef(false)

  const mapper = useMemo(() => {
    return createKeyboardPianoMapper({
      keyboardLayoutId: layoutId,
      scale,
    })
  }, [layoutId, scale])

  useEffect(() => {
    if (!enabled) {
      synthRef.current?.stop()
      synthRef.current = null
      warnedRef.current = false
      return
    }

    if (!synthRef.current) synthRef.current = new KeyboardPianoSynth()
    synthRef.current.setVolume(volume)
    synthRef.current.setWave(wave)
    void synthRef.current.ensureStarted()
  }, [enabled, volume, wave])

  useEffect(() => {
    if (!enabled) return
    const synth = synthRef.current
    if (!synth) return

    let cancelled = false

    const unlistenPromise = listen<PianoKeyEventPayload>(EVENTS.KEYBOARD_PIANO_KEY, async (event) => {
      if (cancelled) return
      const code = event.payload.code
      const midi = mapper.midiForCode(code)
      await synth.ensureStarted()
      synth.playMidi(midi)

      if (!warnedRef.current && synth.getState() === 'suspended') {
        warnedRef.current = true
        void logWarn('keyboard_piano', 'audio_context_suspended', { code })
      }
    })

    return () => {
      cancelled = true
      void unlistenPromise.then((fn) => fn()).catch(() => {})
    }
  }, [enabled, mapper])
}
