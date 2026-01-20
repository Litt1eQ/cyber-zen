import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { COMMANDS, EVENTS } from '@/types/events'
import type { InputEvent, Settings } from '@/types/merit'
import type { ClickHeatmapGrid, MonitorInfo } from '@/types/clickHeatmap'
import { cn } from '@/lib/utils'
import {
  computeHeatThresholds,
  heatClass,
  heatLevelForValue,
  heatLevels,
  heatPaint,
  normalizeHeatLevelCount,
} from './heatScale'

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'string') return Number(value)
  return 0
}

type ClickHeatmapUpdatedPayload = { display_id: string }

function formatMonitorLabel(m: MonitorInfo): string {
  const name = (m.name ?? m.id).trim()
  const [w, h] = m.size
  if (name) return `${name} (${w}×${h})`
  return `${m.id} (${w}×${h})`
}

function clampGrid(v: number | undefined | null, min: number, max: number, fallback: number): number {
  const n = Number.isFinite(v as number) ? Math.round(v as number) : fallback
  return Math.min(max, Math.max(min, n))
}

export function ClickPositionHeatmap({
  settings,
  todayKey,
  defaultMode = 'total',
}: {
  settings: Settings
  todayKey?: string
  defaultMode?: 'day' | 'total'
}) {
  const { t } = useTranslation()
  const [monitors, setMonitors] = useState<MonitorInfo[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [mode, setMode] = useState<'day' | 'total'>(defaultMode)
  const [grid, setGrid] = useState<ClickHeatmapGrid | null>(null)
  const [error, setError] = useState<string | null>(null)
  const refreshTokenRef = useRef<number | null>(null)

  const enabled = !!settings.enable_mouse_single
  const dayModeAvailable = Boolean(todayKey)

  const gridCols = useMemo(() => clampGrid(settings.click_heatmap_grid_cols, 8, 240, 64), [settings.click_heatmap_grid_cols])
  const gridRows = useMemo(() => clampGrid(settings.click_heatmap_grid_rows, 6, 180, 36), [settings.click_heatmap_grid_rows])
  const heatLevelCount = useMemo(() => normalizeHeatLevelCount(settings.heatmap_levels), [settings.heatmap_levels])

  const fetchMonitors = useCallback(async () => {
    setError(null)
    try {
      const list = await invoke<MonitorInfo[]>(COMMANDS.GET_DISPLAY_MONITORS)
      setMonitors(list)
      const primary = list.find((m) => m.is_primary)?.id
      setSelectedId((prev) => {
        if (prev && list.some((m) => m.id === prev)) return prev
        return primary ?? list[0]?.id ?? ''
      })
    } catch (e) {
      setError(String(e))
    }
  }, [])

  const fetchGrid = useCallback(async () => {
    if (!selectedId) return
    setError(null)
    try {
      const args: Record<string, unknown> = {
        monitorId: selectedId,
        cols: gridCols,
        rows: gridRows,
      }
      if (mode === 'day' && todayKey) args.dateKey = todayKey

      const next = await invoke<ClickHeatmapGrid>(COMMANDS.GET_CLICK_HEATMAP_GRID, args)
      setGrid(next)
    } catch (e) {
      setError(String(e))
    }
  }, [gridCols, gridRows, mode, selectedId, todayKey])

  const scheduleRefresh = useCallback(() => {
    if (refreshTokenRef.current) window.clearTimeout(refreshTokenRef.current)
    refreshTokenRef.current = window.setTimeout(() => {
      refreshTokenRef.current = null
      void fetchGrid()
    }, 240)
  }, [fetchGrid])

  useEffect(() => {
    void fetchMonitors()
  }, [fetchMonitors])

  useEffect(() => {
    void fetchGrid()
  }, [fetchGrid])

  useEffect(() => {
    if (mode === 'day' && !todayKey) setMode('total')
  }, [mode, todayKey])

  useEffect(() => {
    const unsubscribe = listen<InputEvent>(EVENTS.INPUT_EVENT, (event) => {
      if (event.payload.origin !== 'global') return
      if (event.payload.source !== 'mouse_single') return
      scheduleRefresh()
    })
    return () => {
      unsubscribe.then((fn) => fn())
    }
  }, [scheduleRefresh])

  useEffect(() => {
    const unsubscribe = listen<ClickHeatmapUpdatedPayload>(EVENTS.CLICK_HEATMAP_UPDATED, (event) => {
      if (event.payload.display_id !== selectedId) return
      scheduleRefresh()
    })
    return () => {
      unsubscribe.then((fn) => fn())
    }
  }, [scheduleRefresh, selectedId])

  const totalClicks = useMemo(() => toNumber(grid?.total_clicks ?? 0), [grid?.total_clicks])
  const maxCell = useMemo(() => toNumber(grid?.max ?? 0), [grid?.max])

  const gridView = useMemo(() => {
    const cols = grid?.cols ?? 0
    const rows = grid?.rows ?? 0
    const cellCount = cols > 0 && rows > 0 ? cols * rows : 0
    if (!cellCount) {
      return {
        cols: 0,
        rows: 0,
        values: [] as number[],
        max: 0,
        thresholds: null as number[] | null,
      }
    }

    const values = Array.from({ length: cellCount }, (_, idx) => {
      const raw = grid?.counts?.[idx]
      const n = toNumber(raw)
      return Number.isFinite(n) ? n : 0
    })
    const max = values.reduce((acc, v) => Math.max(acc, v), 0)
    const thresholds = computeHeatThresholds(values, heatLevelCount)
    return { cols, rows, values, max, thresholds }
  }, [grid?.cols, grid?.counts, grid?.rows, heatLevelCount])

  const handleClear = useCallback(async () => {
    if (!selectedId) return
    setError(null)
    try {
      const args: Record<string, unknown> = { displayId: selectedId }
      if (mode === 'day' && todayKey) args.dateKey = todayKey
      await invoke(COMMANDS.CLEAR_CLICK_HEATMAP, args)
      await fetchGrid()
    } catch (e) {
      setError(String(e))
    }
  }, [fetchGrid, mode, selectedId, todayKey])

  if (!enabled) {
    return (
      <Card className="p-4">
        <div className="text-sm font-semibold text-slate-900 tracking-wide">{t('statistics.clickHeatmap.title')}</div>
        <div className="mt-2 text-sm text-slate-500">{t('statistics.clickHeatmap.disabled')}</div>
      </Card>
    )
  }

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900 tracking-wide">{t('statistics.clickHeatmap.title')}</div>
            <div className="mt-1 text-xs text-slate-500 tabular-nums flex flex-wrap items-center gap-x-2">
              <span className="tabular-nums">
                {mode === 'day' ? t('customStatistics.mode.daily') : t('customStatistics.mode.cumulative')}
                {mode === 'day' && todayKey ? ` · ${todayKey}` : ''}
              </span>
              {t('statistics.clickHeatmap.summary', { total: totalClicks.toLocaleString(), max: maxCell.toLocaleString() })}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0" data-no-drag>
            <Button
              type="button"
              variant={mode === 'day' ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setMode('day')}
              disabled={!dayModeAvailable}
              data-no-drag
            >
              {t('customStatistics.mode.daily')}
            </Button>
            <Button
              type="button"
              variant={mode === 'total' ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setMode('total')}
              data-no-drag
            >
              {t('customStatistics.mode.cumulative')}
            </Button>
            <Button variant="secondary" size="sm" onClick={handleClear} disabled={!selectedId}>
              {t('statistics.clickHeatmap.clear')}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2" data-no-drag>
          <div className="min-w-[220px]">
            <Select value={selectedId} onValueChange={(v) => setSelectedId(v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('statistics.clickHeatmap.selectDisplay')} />
              </SelectTrigger>
              <SelectContent>
                {monitors.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {formatMonitorLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => void fetchMonitors()}>
              {t('statistics.clickHeatmap.refreshDisplays')}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void fetchGrid()} disabled={!selectedId}>
              {t('statistics.clickHeatmap.refresh')}
            </Button>
          </div>
        </div>

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
        ) : null}

        {!selectedId ? (
          <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-3 py-5 text-center text-sm text-slate-500">
            {t('statistics.clickHeatmap.noDisplay')}
          </div>
        ) : (
          <div className="w-full overflow-hidden">
            {gridView.cols && gridView.rows ? (
              <div className="relative w-full" data-no-drag>
                <div
                  aria-hidden="true"
                  style={{
                    paddingTop: `${(gridView.rows / gridView.cols) * 100}%`,
                  }}
                />
                <div
                  className={cn('absolute inset-0 grid gap-px rounded-md bg-slate-200/70 p-px')}
                  style={{
                    gridTemplateColumns: `repeat(${gridView.cols}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${gridView.rows}, minmax(0, 1fr))`,
                  }}
                >
                  {gridView.values.map((value, idx) => {
                    const level = heatLevelForValue(value, gridView.max, gridView.thresholds, heatLevelCount)
                    const x = idx % gridView.cols
                    const y = Math.floor(idx / gridView.cols)
                    return (
                      <div
                        key={idx}
                        className={cn('min-h-0 min-w-0 border rounded-[2px]', heatClass(level, heatLevelCount))}
                        title={`(${x + 1}, ${y + 1})  ${value.toLocaleString()}`}
                        aria-label={`(${x + 1}, ${y + 1})  ${value.toLocaleString()}`}
                      />
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
                {t('statistics.noData')}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{t('statistics.heat.low')}</span>
          <div className="flex items-center gap-1" aria-hidden="true">
            {heatLevels(heatLevelCount).map((lv) => {
              const paint = heatPaint(lv, heatLevelCount)
              return (
                <span
                  key={lv}
                  className={cn('h-3 w-3 rounded border')}
                  style={{ backgroundColor: paint.fill, borderColor: paint.stroke }}
                />
              )
            })}
          </div>
          <span>{t('statistics.heat.high')}</span>
        </div>
      </div>
    </Card>
  )
}
