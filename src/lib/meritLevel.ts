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

function ceilToStep(value: number, step: number): number {
  if (!Number.isFinite(value)) return 0
  if (!Number.isFinite(step) || step <= 1) return Math.round(value)
  return Math.ceil(value / step) * step
}

function buildPowerThresholds(
  count: number,
  {
    baseStep,
    power,
    roundingStep,
  }: { baseStep: number; power: number; roundingStep: number }
): number[] {
  const safeCount = Number.isFinite(count) ? Math.max(1, Math.floor(count)) : 1
  const out = new Array<number>(safeCount)
  out[0] = 0

  const safeBase = Number.isFinite(baseStep) ? Math.max(1, baseStep) : 1
  const safePower = Number.isFinite(power) ? Math.max(1, power) : 1
  const safeRoundingStep = Number.isFinite(roundingStep) ? Math.max(1, roundingStep) : 1

  for (let i = 1; i < safeCount; i++) {
    const prev = out[i - 1]
    const raw = safeBase * Math.pow(i, safePower)
    let next = ceilToStep(raw, safeRoundingStep)
    if (next <= prev) next = prev + 1
    out[i] = next
  }
  return out
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
    return [{ id: 'l01', nameKey: 'statistics.levelNames.l01', fallbackName: '初醒', minMerit: 0 }]
  }
  if (sorted[0].minMerit !== 0) {
    sorted.unshift({ id: 'l01', nameKey: 'statistics.levelNames.l01', fallbackName: '初醒', minMerit: 0 })
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

const DEFAULT_LEVEL_NAMES: ReadonlyArray<string> = [
  '初醒',
  '起念',
  '微光',
  '渐入',
  '初参',
  '入门',
  '勤修',
  '精进',
  '安住',
  '伏心',
  '静心',
  '定心',
  '明心',
  '净心',
  '一心',
  '正念',
  '离念',
  '无念',
  '观息',
  '观身',
  '观受',
  '观心',
  '观法',
  '照见',
  '洞察',
  '通达',
  '自在',
  '小定',
  '入定',
  '深定',
  '寂定',
  '澄定',
  '圆定',
  '定慧',
  '慧定',
  '空定',
  '明觉',
  '慧灯',
  '慧炬',
  '慧海',
  '慧眼',
  '慧心',
  '慧光',
  '慧轮',
  '慧日',
  '金刚',
  '坚固',
  '不动',
  '无畏',
  '破障',
  '离垢',
  '净域',
  '清凉',
  '寂照',
  '行愿',
  '慈航',
  '悲智',
  '普度',
  '弘法',
  '摄心',
  '护念',
  '庄严',
  '妙觉',
  '无量',
  '无尽',
  '无边',
  '无碍',
  '无相',
  '无住',
  '无取',
  '无生',
  '无灭',
  '返观',
  '返照',
  '归途',
  '归寂',
  '归心',
  '归空',
  '归真',
  '一如',
  '归一',
]

function buildDefaultMeritLevels(): MeritLevelDefinition[] {
  const thresholds = buildPowerThresholds(DEFAULT_LEVEL_NAMES.length, { baseStep: 200, power: 3, roundingStep: 100 })
  return DEFAULT_LEVEL_NAMES.map((meta, index) => {
    const n = index + 1
    const id = `l${String(n).padStart(2, '0')}`
    return {
      id,
      nameKey: `statistics.levelNames.${id}`,
      fallbackName: meta,
      minMerit: thresholds[index],
    }
  })
}

export const DEFAULT_MERIT_LEVELS: readonly MeritLevelDefinition[] = Object.freeze(
  buildDefaultMeritLevels().map((level) => Object.freeze(level))
)

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
