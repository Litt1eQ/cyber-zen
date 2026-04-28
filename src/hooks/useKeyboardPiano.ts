import { useEffect, useMemo, useRef } from 'react'
import { listen } from '@tauri-apps/api/event'
import type { Settings } from '@/types/merit'
import { EVENTS } from '@/types/events'
import { KeyboardPianoSynth, createKeyboardPianoMapper, type KeyboardPianoScale, type KeyboardPianoWave } from '@/lib/keyboardPiano'
import { createHarmonicMapper, type HarmonyProgressionId, type KeyDirectionHint } from '@/lib/keyboardPianoHarmony'
import { logWarn } from '@/lib/logging'
import { getKeyboardLayout, normalizeKeyboardLayoutId } from '@/lib/keyboard'
import { isMac, isWindows } from '@/utils/platform'

type PianoKeyEventPayload = { code: string }

function platformToKeyboardPlatform() {
  if (isMac()) return 'mac' as const
  if (isWindows()) return 'windows' as const
  return 'linux' as const
}

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

function normalizeProgression(value: unknown): HarmonyProgressionId {
  if (value === 'pop' || value === 'jazz' || value === 'classical' || value === 'folk') return value
  return 'pop'
}

function buildDirectionMap(layoutId: ReturnType<typeof normalizeKeyboardLayoutId>): Map<string, KeyDirectionHint> {
  const platform = platformToKeyboardPlatform()
  const rows = getKeyboardLayout(layoutId, platform)
  const directionMap = new Map<string, KeyDirectionHint>()

  for (const row of rows) {
    const keys = row.filter((key) => key.kind !== 'spacer' && !key.code.startsWith('__'))
    const leftBoundary = Math.floor(keys.length / 3)
    const rightBoundary = Math.ceil((2 * keys.length) / 3)

    keys.forEach((key, index) => {
      if (index < leftBoundary) {
        directionMap.set(key.code, 'left')
      } else if (index >= rightBoundary) {
        directionMap.set(key.code, 'right')
      } else {
        directionMap.set(key.code, 'center')
      }
    })
  }

  return directionMap
}

export function useKeyboardPiano(settings: Settings | null) {
  const enabled = settings?.keyboard_piano_enabled ?? false
  const volume = normalizeVolume(settings?.keyboard_piano_volume)
  const scale = normalizeScale(settings?.keyboard_piano_scale)
  const wave = normalizeWave(settings?.keyboard_piano_wave)
  const layoutId = normalizeKeyboardLayoutId(settings?.keyboard_layout)
  const harmonyMode = settings?.keyboard_piano_harmony_mode ?? false
  const progression = normalizeProgression(settings?.keyboard_piano_harmony_progression)

  const synthRef = useRef<KeyboardPianoSynth | null>(null)
  const warnedRef = useRef(false)

  const baseMapper = useMemo(() => {
    return createKeyboardPianoMapper({
      keyboardLayoutId: layoutId,
      scale,
    })
  }, [layoutId, scale])

  const harmonyMapper = useMemo(() => {
    if (!harmonyMode) return null
    return createHarmonicMapper(baseMapper, progression)
  }, [baseMapper, harmonyMode, progression])

  const directionMap = useMemo(() => buildDirectionMap(layoutId), [layoutId])

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
      const directionHint = directionMap.get(code) ?? 'center'
      const midi = harmonyMapper ? harmonyMapper.midiForCode(code, directionHint) : baseMapper.midiForCode(code)
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
  }, [baseMapper, directionMap, enabled, harmonyMapper])
}
