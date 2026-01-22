export const STATISTICS_BLOCK_IDS = [
  'period_summary',
  'insights',
  'weekday_distribution',
  'hourly_weekday_heatmap',
  'input_source_share',
  'trend',
  'mouse_distance',
  'daily_source_bars',
  'shortcut_usage_trend',
  'key_diversity_bars',
  'shift_usage',
  'key_pareto',
  'mouse_button_structure',
  'click_position_heatmap',
  'app_concentration',
  'app_input_ranking',
  'monthly_calendar',
] as const

export type StatisticsBlockId = (typeof STATISTICS_BLOCK_IDS)[number]

export type StatisticsBlockState = {
  id: StatisticsBlockId
  collapsed?: boolean
}

export const DEFAULT_STATISTICS_BLOCKS: StatisticsBlockState[] = [
  { id: 'period_summary' },
  { id: 'insights' },
  { id: 'weekday_distribution' },
  { id: 'hourly_weekday_heatmap' },
  { id: 'input_source_share' },
  { id: 'trend' },
  { id: 'mouse_distance' },
  { id: 'daily_source_bars' },
  { id: 'shortcut_usage_trend' },
  { id: 'key_diversity_bars' },
  { id: 'shift_usage' },
  { id: 'key_pareto' },
  { id: 'mouse_button_structure' },
  { id: 'click_position_heatmap' },
  { id: 'app_concentration' },
  { id: 'app_input_ranking' },
  { id: 'monthly_calendar' },
]

export function isKnownStatisticsBlockId(id: string): id is StatisticsBlockId {
  return (STATISTICS_BLOCK_IDS as readonly string[]).includes(id)
}

export function normalizeStatisticsBlocks(raw: unknown): StatisticsBlockState[] {
  const out: StatisticsBlockState[] = []
  const seen = new Set<string>()

  const items = Array.isArray(raw) ? raw : []
  for (const entry of items) {
    if (!entry || typeof entry !== 'object') continue
    const maybeId = (entry as { id?: unknown }).id
    if (typeof maybeId !== 'string') continue
    const id = maybeId.trim()
    if (!id) continue
    if (!isKnownStatisticsBlockId(id)) continue
    if (seen.has(id)) continue

    const collapsedRaw = (entry as { collapsed?: unknown }).collapsed
    const collapsed = typeof collapsedRaw === 'boolean' ? collapsedRaw : false
    out.push({ id, collapsed })
    seen.add(id)
  }

  if (out.length === 0) return DEFAULT_STATISTICS_BLOCKS.map((b) => ({ ...b }))

  for (const def of DEFAULT_STATISTICS_BLOCKS) {
    if (seen.has(def.id)) continue
    out.push({ ...def })
    seen.add(def.id)
  }

  return out
}

