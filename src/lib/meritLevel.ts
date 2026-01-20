export type MeritLevelDefinition = Readonly<{
  id: string
  nameKey: string
  fallbackName: string
  minMerit: number
}>

export type MeritLevelProgress = Readonly<{
  levelNumber: number
  currentLevel: MeritLevelDefinition
  nextLevel: MeritLevelDefinition | null
  minMerit: number
  nextMinMerit: number | null
  progress01: number
  remainingToNext: number | null
}>

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function normalizeDefinitions(definitions: readonly MeritLevelDefinition[]): MeritLevelDefinition[] {
  const filtered = definitions.filter(
    (level) =>
      level &&
      typeof level.id === 'string' &&
      level.id.length > 0 &&
      typeof level.nameKey === 'string' &&
      level.nameKey.length > 0 &&
      typeof level.fallbackName === 'string' &&
      level.fallbackName.length > 0 &&
      Number.isFinite(level.minMerit) &&
      level.minMerit >= 0
  )
  const sorted = [...filtered].sort((a, b) => a.minMerit - b.minMerit)
  if (sorted.length === 0) {
    return [{ id: 'awakening', nameKey: 'statistics.levelNames.awakening', fallbackName: '初醒', minMerit: 0 }]
  }
  if (sorted[0].minMerit !== 0) {
    sorted.unshift({ id: 'awakening', nameKey: 'statistics.levelNames.awakening', fallbackName: '初醒', minMerit: 0 })
  }

  const deduped: MeritLevelDefinition[] = []
  const seen = new Set<number>()
  for (const level of sorted) {
    if (seen.has(level.minMerit)) continue
    seen.add(level.minMerit)
    deduped.push(level)
  }
  return deduped
}

export const DEFAULT_MERIT_LEVELS: readonly MeritLevelDefinition[] = [
  { id: 'awakening', nameKey: 'statistics.levelNames.awakening', fallbackName: '初醒', minMerit: 0 },
  { id: 'spark', nameKey: 'statistics.levelNames.spark', fallbackName: '起念', minMerit: 100 },
  { id: 'glimmer', nameKey: 'statistics.levelNames.glimmer', fallbackName: '微光', minMerit: 300 },
  { id: 'entry', nameKey: 'statistics.levelNames.entry', fallbackName: '渐入', minMerit: 700 },
  { id: 'first', nameKey: 'statistics.levelNames.first', fallbackName: '初参', minMerit: 1_500 },
  { id: 'novice', nameKey: 'statistics.levelNames.novice', fallbackName: '入门', minMerit: 3_000 },
  { id: 'diligent', nameKey: 'statistics.levelNames.diligent', fallbackName: '勤修', minMerit: 6_000 },
  { id: 'effort', nameKey: 'statistics.levelNames.effort', fallbackName: '精进', minMerit: 12_000 },
  { id: 'abide', nameKey: 'statistics.levelNames.abide', fallbackName: '安住', minMerit: 24_000 },
  { id: 'stillness', nameKey: 'statistics.levelNames.stillness', fallbackName: '小定', minMerit: 48_000 },
  { id: 'samadhi', nameKey: 'statistics.levelNames.samadhi', fallbackName: '入定', minMerit: 96_000 },
  { id: 'watching', nameKey: 'statistics.levelNames.watching', fallbackName: '观心', minMerit: 160_000 },
  { id: 'clarity', nameKey: 'statistics.levelNames.clarity', fallbackName: '明觉', minMerit: 260_000 },
  { id: 'lamp', nameKey: 'statistics.levelNames.lamp', fallbackName: '慧灯', minMerit: 420_000 },
  { id: 'vajra', nameKey: 'statistics.levelNames.vajra', fallbackName: '金刚', minMerit: 680_000 },
  { id: 'arhat', nameKey: 'statistics.levelNames.arhat', fallbackName: '罗汉', minMerit: 1_100_000 },
  { id: 'bodhisattva', nameKey: 'statistics.levelNames.bodhisattva', fallbackName: '菩萨', minMerit: 1_800_000 },
  { id: 'mahasattva', nameKey: 'statistics.levelNames.mahasattva', fallbackName: '大士', minMerit: 3_000_000 },
  { id: 'dharma_king', nameKey: 'statistics.levelNames.dharma_king', fallbackName: '法王', minMerit: 5_000_000 },
  { id: 'supreme', nameKey: 'statistics.levelNames.supreme', fallbackName: '无上', minMerit: 8_000_000 },
  { id: 'perfection', nameKey: 'statistics.levelNames.perfection', fallbackName: '圆满', minMerit: 13_000_000 },
  { id: 'silent_light', nameKey: 'statistics.levelNames.silent_light', fallbackName: '寂照', minMerit: 21_000_000 },
  { id: 'void', nameKey: 'statistics.levelNames.void', fallbackName: '虚空', minMerit: 34_000_000 },
  { id: 'boundless', nameKey: 'statistics.levelNames.boundless', fallbackName: '无量', minMerit: 55_000_000 },
  { id: 'endless', nameKey: 'statistics.levelNames.endless', fallbackName: '无尽', minMerit: 89_000_000 },
  { id: 'one', nameKey: 'statistics.levelNames.one', fallbackName: '归一', minMerit: 144_000_000 },
]

export function resolveMeritLevelProgress(
  totalMerit: number,
  definitions: readonly MeritLevelDefinition[] = DEFAULT_MERIT_LEVELS
): MeritLevelProgress {
  const total = Number.isFinite(totalMerit) ? Math.max(0, Math.floor(totalMerit)) : 0
  const levels = normalizeDefinitions(definitions)

  let currentIndex = 0
  for (let i = 0; i < levels.length; i++) {
    if (levels[i].minMerit <= total) currentIndex = i
    else break
  }

  const currentLevel = levels[currentIndex]
  const nextLevel = levels[currentIndex + 1] ?? null
  const minMerit = currentLevel.minMerit
  const nextMinMerit = nextLevel?.minMerit ?? null

  const progress01 =
    nextMinMerit == null ? 1 : clamp01((total - minMerit) / Math.max(1, nextMinMerit - minMerit))
  const remainingToNext = nextMinMerit == null ? null : Math.max(0, nextMinMerit - total)

  return {
    levelNumber: currentIndex + 1,
    currentLevel,
    nextLevel,
    minMerit,
    nextMinMerit,
    progress01,
    remainingToNext,
  }
}
