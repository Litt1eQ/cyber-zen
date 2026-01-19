export type MonitorInfo = {
  id: string
  name?: string | null
  position: [number, number]
  size: [number, number]
  scale_factor: number
  is_primary: boolean
}

export type ClickHeatmapGrid = {
  monitor_id: string
  cols: number
  rows: number
  counts: Array<number | string | bigint>
  max: number | string | bigint
  total_clicks: number | string | bigint
}
