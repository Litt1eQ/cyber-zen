export const HEAT_LEVEL_COUNT_MIN = 5 as const
export const HEAT_LEVEL_COUNT_MAX = 15 as const
export const HEAT_LEVEL_COUNT_DEFAULT = 10 as const

export type HeatLevel = number

const HEAT_PALETTE = [
  'bg-slate-100 border-slate-200 text-slate-700',
  'bg-blue-50 border-blue-100 text-slate-900',
  'bg-blue-100 border-blue-200 text-slate-900',
  'bg-blue-200 border-blue-300 text-slate-900',
  'bg-blue-300 border-blue-400 text-slate-900',
  'bg-blue-400/55 border-blue-500 text-slate-900',
  'bg-blue-400 border-blue-500 text-slate-900',
  'bg-blue-500/65 border-blue-600 text-white',
  'bg-blue-500 border-blue-600 text-white',
  'bg-blue-600/85 border-blue-700 text-white',
  'bg-blue-600 border-blue-700 text-white',
  'bg-blue-700 border-blue-800 text-white',
  'bg-blue-800 border-blue-900 text-white',
  'bg-blue-900 border-blue-950 text-white',
  'bg-blue-950 border-blue-950 text-white',
] as const

type HeatPaint = {
  fill: string
  stroke: string
  text: string
  textMuted: string
}

const HEAT_PALETTE_COLORS: Array<{ fill: string; stroke: string; darkText: boolean }> = [
  { fill: '#f1f5f9', stroke: '#e2e8f0', darkText: true }, // slate-100
  { fill: '#eff6ff', stroke: '#dbeafe', darkText: true }, // blue-50 / blue-100
  { fill: '#dbeafe', stroke: '#bfdbfe', darkText: true }, // blue-100 / blue-200
  { fill: '#bfdbfe', stroke: '#93c5fd', darkText: true }, // blue-200 / blue-300
  { fill: '#93c5fd', stroke: '#60a5fa', darkText: true }, // blue-300 / blue-400
  { fill: 'rgba(96,165,250,0.55)', stroke: '#3b82f6', darkText: true }, // blue-400/55 / blue-500
  { fill: '#60a5fa', stroke: '#3b82f6', darkText: true }, // blue-400 / blue-500
  { fill: 'rgba(59,130,246,0.65)', stroke: '#2563eb', darkText: false }, // blue-500/65 / blue-600
  { fill: '#3b82f6', stroke: '#2563eb', darkText: false }, // blue-500 / blue-600
  { fill: 'rgba(37,99,235,0.85)', stroke: '#1d4ed8', darkText: false }, // blue-600/85 / blue-700
  { fill: '#2563eb', stroke: '#1d4ed8', darkText: false }, // blue-600 / blue-700
  { fill: '#1d4ed8', stroke: '#1e40af', darkText: false }, // blue-700 / blue-800
  { fill: '#1e40af', stroke: '#1e3a8a', darkText: false }, // blue-800 / blue-900
  { fill: '#1e3a8a', stroke: '#172554', darkText: false }, // blue-900 / blue-950
  { fill: '#172554', stroke: '#172554', darkText: false }, // blue-950
]

export function normalizeHeatLevelCount(levelCount: number | undefined | null): number {
  const n = Number.isFinite(levelCount as number) ? Math.round(levelCount as number) : HEAT_LEVEL_COUNT_DEFAULT
  return Math.min(HEAT_LEVEL_COUNT_MAX, Math.max(HEAT_LEVEL_COUNT_MIN, n))
}

export function heatLevels(levelCount: number): HeatLevel[] {
  const n = normalizeHeatLevelCount(levelCount)
  return Array.from({ length: n }, (_, i) => i)
}

function paletteIndexFor(level: number, levelCount: number): number {
  const n = normalizeHeatLevelCount(levelCount)
  const maxLevel = n - 1
  if (maxLevel <= 0) return 0
  const clamped = Math.min(maxLevel, Math.max(0, level))
  return Math.round((clamped / maxLevel) * (HEAT_PALETTE.length - 1))
}

export function computeHeatThresholds(values: number[], levelCount: number): number[] | null {
  const n = normalizeHeatLevelCount(levelCount)
  const steps = n - 1
  const nonZero = values.filter((v) => v > 0).sort((a, b) => a - b)
  if (nonZero.length < steps) return null

  const at = (p: number) => nonZero[Math.min(nonZero.length - 1, Math.floor(p * (nonZero.length - 1)))]
  const thresholds: number[] = []
  for (let i = 1; i < steps; i += 1) thresholds.push(at(i / steps))
  return thresholds
}

export function heatLevelForValue(
  value: number,
  max: number,
  thresholds: number[] | null,
  levelCount: number
): HeatLevel {
  const n = normalizeHeatLevelCount(levelCount)
  const steps = n - 1

  if (value <= 0) return 0

  if (thresholds && thresholds.length === steps - 1) {
    for (let i = 0; i < thresholds.length; i += 1) {
      if (value <= thresholds[i]) return i + 1
    }
    return steps
  }

  if (max <= 0) return 0
  const ratio = value / max
  return Math.min(steps, Math.max(1, Math.ceil(ratio * steps)))
}

export function isHeatDark(level: HeatLevel, levelCount: number): boolean {
  const idx = paletteIndexFor(level, levelCount)
  return HEAT_PALETTE[idx].includes('text-white')
}

export function heatClass(level: HeatLevel, levelCount: number): string {
  return HEAT_PALETTE[paletteIndexFor(level, levelCount)]
}

export function heatPaint(level: HeatLevel, levelCount: number): HeatPaint {
  const idx = paletteIndexFor(level, levelCount)
  const paletteIdx = Math.min(HEAT_PALETTE_COLORS.length - 1, Math.max(0, idx))
  const { fill, stroke, darkText } = HEAT_PALETTE_COLORS[paletteIdx]
  if (darkText) {
    return { fill, stroke, text: '#0f172a', textMuted: 'rgba(15,23,42,0.62)' }
  }
  return { fill, stroke, text: '#ffffff', textMuted: 'rgba(255,255,255,0.9)' }
}
