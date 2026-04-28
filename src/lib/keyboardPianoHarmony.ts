import type { KeyboardPianoMapper } from './keyboardPiano'

export type HarmonyProgressionId = 'pop' | 'jazz' | 'classical' | 'folk'
export type KeyDirectionHint = 'left' | 'center' | 'right'

export type ChordDef = {
  rootPitchClass: number
  primary: number[]
  passing: number[]
}

type MotionDirection = -1 | 0 | 1

export type HarmonicMapper = {
  midiForCode: (code: string, hint?: KeyDirectionHint) => number
}

const KEYSTROKES_PER_CHORD = 8
const INACTIVITY_RESET_MS = 4000
const MAX_FOLD_INTERVAL = 7
const PRIMARY_SNAP_RADIUS = 2
const CONTINUITY_DISTANCE_WINDOW = 1
const RAPID_INPUT_THRESHOLD_MS = 90
const RAPID_HARMONIC_STEP_BUDGET = 1
const C4_MIDI = 60
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11]

function createChord(rootPitchClass: number, primary: number[]): ChordDef {
  return {
    rootPitchClass,
    primary,
    passing: MAJOR_SCALE.filter((pitchClass) => !primary.includes(pitchClass)),
  }
}

const CHORDS = {
  C: createChord(0, [0, 4, 7]),
  G: createChord(7, [7, 11, 2]),
  Am: createChord(9, [9, 0, 4]),
  F: createChord(5, [5, 9, 0]),
  Dm: createChord(2, [2, 5, 9]),
} as const

export const PROGRESSIONS: Record<HarmonyProgressionId, ChordDef[]> = {
  pop: [CHORDS.C, CHORDS.G, CHORDS.Am, CHORDS.F],
  jazz: [CHORDS.Dm, CHORDS.G, CHORDS.C],
  classical: [CHORDS.C, CHORDS.F, CHORDS.G, CHORDS.C],
  folk: [CHORDS.C, CHORDS.F, CHORDS.C, CHORDS.G],
}

function pitchClassOf(midi: number): number {
  return ((midi % 12) + 12) % 12
}

function clampMidi(midi: number): number {
  return Math.max(0, Math.min(127, midi))
}

function buildCandidates(midi: number, pitchClasses: number[], isPrimary: boolean) {
  const octaveBase = midi - pitchClassOf(midi)
  const candidates: Array<{ midi: number; isPrimary: boolean }> = []

  for (const pitchClass of pitchClasses) {
    for (const octaveOffset of [-1, 0, 1]) {
      const candidate = octaveBase + pitchClass + octaveOffset * 12
      if (candidate >= 0 && candidate <= 127) {
        candidates.push({ midi: candidate, isPrimary })
      }
    }
  }

  return candidates
}

function seededCenterChoice(seed: number): 'lower' | 'higher' {
  return seed % 2 === 0 ? 'lower' : 'higher'
}

function directionBetween(fromMidi: number, toMidi: number): MotionDirection {
  if (toMidi > fromMidi) return 1
  if (toMidi < fromMidi) return -1
  return 0
}

function melodicContinuityPenalty(candidateMidi: number, lastMidi: number): number {
  const interval = Math.abs(candidateMidi - lastMidi)
  const leapBeyondStep = Math.max(0, interval - 2)
  return leapBeyondStep * 2 + interval * 0.1
}

function uniqueCandidatesByMidi(candidates: Array<{ midi: number; isPrimary: boolean }>) {
  const byMidi = new Map<number, { midi: number; isPrimary: boolean }>()

  for (const candidate of candidates) {
    const existing = byMidi.get(candidate.midi)
    if (!existing || (!existing.isPrimary && candidate.isPrimary)) {
      byMidi.set(candidate.midi, candidate)
    }
  }

  return [...byMidi.values()].sort((a, b) => a.midi - b.midi)
}

function nearestCandidateIndex(candidates: Array<{ midi: number; isPrimary: boolean }>, midi: number): number {
  let bestIndex = 0
  let bestDistance = Number.POSITIVE_INFINITY

  candidates.forEach((candidate, index) => {
    const distance = Math.abs(candidate.midi - midi)
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
    }
  })

  return bestIndex
}

function rapidSmoothingPitchClasses(chord: ChordDef, targetMidi: number): number[] {
  const nearestPrimaryDistance = buildCandidates(targetMidi, chord.primary, true).reduce((best, candidate) => {
    return Math.min(best, Math.abs(candidate.midi - targetMidi))
  }, Number.POSITIVE_INFINITY)
  if (nearestPrimaryDistance <= PRIMARY_SNAP_RADIUS) return chord.primary
  return [...chord.primary, ...chord.passing]
}

function rapidMotionScore(
  candidateMidi: number,
  targetMidi: number,
  lastMidi: number,
  targetDirection: MotionDirection,
  recentDirection: MotionDirection,
): number {
  const motionDirection = directionBetween(lastMidi, candidateMidi)
  const motionDistance = Math.abs(candidateMidi - lastMidi)
  let score = Math.abs(candidateMidi - targetMidi) + motionDistance * 0.2

  if (targetDirection !== 0) {
    if (motionDirection === targetDirection) {
      score -= 0.1
    } else if (motionDirection !== 0) {
      score += 0.15
    } else {
      score += 0.05
    }
  }

  if (recentDirection !== 0 && motionDirection !== 0) {
    if (motionDirection === recentDirection) {
      score -= 0.05
    } else {
      score += 0.1
    }
  }

  return score
}

function selectRapidInputCandidate(
  targetMidi: number,
  chord: ChordDef,
  lastMidi: number,
  recentDirection: MotionDirection,
  seed: number,
): number {
  const pitchClasses = rapidSmoothingPitchClasses(chord, targetMidi)
  const candidates = uniqueCandidatesByMidi(buildCandidates(lastMidi, pitchClasses, true))
  const anchorIndex = nearestCandidateIndex(candidates, lastMidi)
  const nearbyCandidates = candidates.filter((_, index) => Math.abs(index - anchorIndex) <= RAPID_HARMONIC_STEP_BUDGET)
  const targetDirection = directionBetween(lastMidi, targetMidi)

  const ranked = [...nearbyCandidates].sort((a, b) => {
    const scoreDelta = rapidMotionScore(a.midi, targetMidi, lastMidi, targetDirection, recentDirection)
      - rapidMotionScore(b.midi, targetMidi, lastMidi, targetDirection, recentDirection)
    if (scoreDelta !== 0) return scoreDelta
    return a.midi - b.midi
  })

  const best = ranked[0]
  if (!best) return targetMidi

  const bestScore = rapidMotionScore(best.midi, targetMidi, lastMidi, targetDirection, recentDirection)
  const tied = ranked.filter((candidate) => {
    return rapidMotionScore(candidate.midi, targetMidi, lastMidi, targetDirection, recentDirection) === bestScore
  })

  if (tied.length === 1) return best.midi
  return seededCenterChoice(seed) === 'lower' ? tied[0].midi : tied[tied.length - 1].midi
}

function resolveDirectionalTie(
  candidates: Array<{ midi: number; isPrimary: boolean }>,
  hint: KeyDirectionHint,
  seed: number,
  lastMidi?: number,
): number {
  if (candidates.length === 1) return candidates[0].midi

  const sorted = [...candidates].sort((a, b) => a.midi - b.midi)
  if (hint === 'left') return sorted[0].midi
  if (hint === 'right') return sorted[sorted.length - 1].midi

  if (lastMidi != null) {
    const continuitySorted = [...sorted].sort((a, b) => {
      const distanceDelta = Math.abs(a.midi - lastMidi) - Math.abs(b.midi - lastMidi)
      if (distanceDelta !== 0) return distanceDelta
      return a.midi - b.midi
    })
    const bestDistance = Math.abs(continuitySorted[0].midi - lastMidi)
    const continuityTies = continuitySorted.filter((candidate) => Math.abs(candidate.midi - lastMidi) === bestDistance)
    if (continuityTies.length === 1) return continuityTies[0].midi
    return seededCenterChoice(seed) === 'lower' ? continuityTies[0].midi : continuityTies[continuityTies.length - 1].midi
  }

  return seededCenterChoice(seed) === 'lower' ? sorted[0].midi : sorted[sorted.length - 1].midi
}

function selectCenterCandidate(
  candidates: Array<{ midi: number; isPrimary: boolean }>,
  targetMidi: number,
  lastMidi: number,
  seed: number,
): number {
  const bestTargetDistance = candidates.reduce((best, candidate) => {
    return Math.min(best, Math.abs(candidate.midi - targetMidi))
  }, Number.POSITIVE_INFINITY)

  const plausibleCandidates = candidates.filter((candidate) => {
    return Math.abs(candidate.midi - targetMidi) <= bestTargetDistance + CONTINUITY_DISTANCE_WINDOW
  })

  const ranked = [...plausibleCandidates].sort((a, b) => {
    const continuityDelta = melodicContinuityPenalty(a.midi, lastMidi) - melodicContinuityPenalty(b.midi, lastMidi)
    if (continuityDelta !== 0) return continuityDelta

    const targetDistanceDelta = Math.abs(a.midi - targetMidi) - Math.abs(b.midi - targetMidi)
    if (targetDistanceDelta !== 0) return targetDistanceDelta

    return a.midi - b.midi
  })

  const best = ranked[0]
  if (!best) return targetMidi

  const bestContinuityPenalty = melodicContinuityPenalty(best.midi, lastMidi)
  const bestTargetDistanceScore = Math.abs(best.midi - targetMidi)
  const tied = ranked.filter((candidate) => {
    return (
      melodicContinuityPenalty(candidate.midi, lastMidi) === bestContinuityPenalty
      && Math.abs(candidate.midi - targetMidi) === bestTargetDistanceScore
    )
  })

  if (tied.length === 1) return best.midi
  return seededCenterChoice(seed) === 'lower' ? tied[0].midi : tied[tied.length - 1].midi
}

export class ChordProgressionState {
  private readonly progression: ChordDef[]
  private chordIndex = 0
  private keystrokeCount = 0
  private lastKeyAt = Date.now()

  constructor(progressionId: HarmonyProgressionId) {
    this.progression = PROGRESSIONS[progressionId]
  }

  currentChord(): ChordDef {
    return this.progression[this.chordIndex]
  }

  currentChordTones(): number[] {
    return this.currentChord().primary
  }

  tick(): void {
    const now = Date.now()
    if (now - this.lastKeyAt > INACTIVITY_RESET_MS) {
      this.chordIndex = 0
      this.keystrokeCount = 0
    }

    this.lastKeyAt = now
    this.keystrokeCount += 1

    if (this.keystrokeCount >= KEYSTROKES_PER_CHORD) {
      this.keystrokeCount = 0
      this.chordIndex = (this.chordIndex + 1) % this.progression.length
    }
  }
}

export function foldOctave(midi: number, lastMidi: number): number {
  let candidate = midi

  while (candidate - lastMidi > MAX_FOLD_INTERVAL) candidate -= 12
  while (lastMidi - candidate > MAX_FOLD_INTERVAL) candidate += 12

  return clampMidi(candidate)
}

export function snapToChord(midi: number, chord: ChordDef, hint: KeyDirectionHint, seed: number, lastMidi?: number): number {
  const primaryCandidates = buildCandidates(midi, chord.primary, true)
  const combinedCandidates = [...primaryCandidates, ...buildCandidates(midi, chord.passing, false)]

  const nearestPrimaryDistance = primaryCandidates.reduce((best, candidate) => {
    return Math.min(best, Math.abs(candidate.midi - midi))
  }, Number.POSITIVE_INFINITY)

  const activeCandidates = nearestPrimaryDistance <= PRIMARY_SNAP_RADIUS ? primaryCandidates : combinedCandidates

  const ranked = [...activeCandidates].sort((a, b) => {
    const distanceDelta = Math.abs(a.midi - midi) - Math.abs(b.midi - midi)
    if (distanceDelta !== 0) return distanceDelta
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1
    return a.midi - b.midi
  })

  const best = ranked[0]
  if (!best) return clampMidi(midi)

  const bestDistance = Math.abs(best.midi - midi)
  const bestTier = best.isPrimary
  const tied = ranked.filter((candidate) => {
    return Math.abs(candidate.midi - midi) === bestDistance && candidate.isPrimary === bestTier
  })

  if (hint === 'center' && lastMidi != null) {
    return selectCenterCandidate(
      activeCandidates.filter((candidate) => candidate.isPrimary === bestTier),
      midi,
      lastMidi,
      seed,
    )
  }

  return resolveDirectionalTie(tied, hint, seed, lastMidi)
}

function initialRootMidi(progressionId: HarmonyProgressionId): number {
  return C4_MIDI + PROGRESSIONS[progressionId][0].rootPitchClass
}

export function createHarmonicMapper(
  baseMapper: KeyboardPianoMapper,
  progressionId: HarmonyProgressionId,
): HarmonicMapper {
  const progressionState = new ChordProgressionState(progressionId)
  let lastMidi = initialRootMidi(progressionId)
  let keystrokeCount = 0
  let lastInputAt: number | null = null
  let recentDirection: MotionDirection = 0

  return {
    midiForCode(code, hint = 'center') {
      const now = Date.now()
      const rawMidi = baseMapper.midiForCode(code)
      const foldedMidi = foldOctave(rawMidi, lastMidi)
      const currentChord = progressionState.currentChord()
      const isRapidInput = lastInputAt != null && now - lastInputAt <= RAPID_INPUT_THRESHOLD_MS
      const harmonicTargetMidi = isRapidInput
        ? snapToChord(foldedMidi, currentChord, hint, keystrokeCount)
        : snapToChord(foldedMidi, currentChord, hint, keystrokeCount, lastMidi)
      const finalMidi = isRapidInput
        ? selectRapidInputCandidate(rawMidi, currentChord, lastMidi, recentDirection, keystrokeCount)
        : harmonicTargetMidi

      recentDirection = directionBetween(lastMidi, finalMidi)
      lastMidi = finalMidi
      lastInputAt = now
      keystrokeCount += 1
      progressionState.tick()

      return finalMidi
    },
  }
}
