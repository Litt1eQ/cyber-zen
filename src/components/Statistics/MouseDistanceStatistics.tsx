import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DailyStats, Settings } from '@/types/merit'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useDisplayMonitors } from '@/hooks/useDisplayMonitors'
import { effectivePpiForDisplay, formatCentimeters, pixelsToCentimeters } from '@/lib/mouseDistance'
import { MouseDistancePanel } from '@/components/Statistics/MouseDistancePanel'

type Mode = 'day' | 'total'

function sumPxByDisplay(days: DailyStats[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const day of days) {
    const byDisplay = day.mouse_move_distance_px_by_display
    if (byDisplay) {
      for (const [id, px] of Object.entries(byDisplay)) {
        if (!px) continue
        out[id] = (out[id] ?? 0) + px
      }
      continue
    }
    const legacyPx = day.mouse_move_distance_px ?? 0
    if (legacyPx) out.unknown = (out.unknown ?? 0) + legacyPx
  }
  return out
}

function uniqueDaysByDate(days: DailyStats[]): DailyStats[] {
  const byDate = new Map<string, DailyStats>()
  for (const day of days) {
    const key = day.date
    if (!key) continue
    const existing = byDate.get(key)
    if (!existing || (existing.mouse_move_distance_px ?? 0) < (day.mouse_move_distance_px ?? 0)) byDate.set(key, day)
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
}

export function MouseDistanceStatistics({
  allDays,
  anchorKey,
  selectedDay,
  settings,
}: {
  allDays: DailyStats[]
  anchorKey: string | null
  selectedDay: DailyStats | undefined
  settings: Settings
}) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<Mode>('day')
  const displayMonitors = useDisplayMonitors()

  const monitorsById = useMemo(() => {
    const out = new Map<string, { name?: string | null; width: number; height: number }>()
    for (const m of displayMonitors.monitors ?? []) {
      out.set(m.id, { name: m.name ?? null, width: m.size[0], height: m.size[1] })
    }
    return out
  }, [displayMonitors.monitors])

  const trendDays = useMemo(() => {
    if (!anchorKey) return allDays
    return allDays.filter((d) => (d.date ?? '') <= anchorKey)
  }, [allDays, anchorKey])

  const scopeDays = useMemo(() => {
    if (mode === 'total') return trendDays
    return selectedDay ? [selectedDay] : []
  }, [mode, selectedDay, trendDays])

  const pxByDisplay = useMemo(() => sumPxByDisplay(scopeDays), [scopeDays])

  const breakdown = useMemo(() => {
    const rows = Object.entries(pxByDisplay).map(([id, px]) => {
      const mon = monitorsById.get(id)
      const size = mon ? { width: mon.width, height: mon.height } : null
      const ppi = effectivePpiForDisplay(settings, id, size)
      const cm = pixelsToCentimeters(px, ppi)
      return { id, name: mon?.name ?? null, px, ppi, cm }
    })
    rows.sort((a, b) => b.cm - a.cm)
    return rows
  }, [monitorsById, pxByDisplay, settings])

  const totalCm = useMemo(() => breakdown.reduce((acc, r) => acc + r.cm, 0), [breakdown])

  const cumulativeMetrics = useMemo(() => {
    const uniqueDays = uniqueDaysByDate(trendDays)
    const series = uniqueDays.map((day) => {
      const byDisplay = day.mouse_move_distance_px_by_display ?? {}
      const entries = Object.entries(byDisplay)
      const cm = entries.length
        ? entries.reduce((acc, [id, px]) => {
            const mon = monitorsById.get(id)
            const size = mon ? { width: mon.width, height: mon.height } : null
            const ppi = effectivePpiForDisplay(settings, id, size)
            return acc + pixelsToCentimeters(px, ppi)
          }, 0)
        : pixelsToCentimeters(day.mouse_move_distance_px ?? 0, effectivePpiForDisplay(settings, 'unknown', null))
      return { date: day.date, cm }
    })

    const sum = series.reduce((acc, p) => acc + p.cm, 0)
    const avg = series.length ? sum / series.length : 0
    const peak = series.reduce((acc, p) => (p.cm > acc.cm ? p : acc), { date: '-', cm: 0 })
    return { sum, avg, peak }
  }, [monitorsById, settings, trendDays])

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 tracking-wide">{t('statistics.mouseDistance.title')}</div>
          <div className="text-xs text-slate-500 mt-1">{t('statistics.mouseDistance.description')}</div>
        </div>
        <div className="flex items-center gap-2" data-no-drag>
          <Button type="button" variant={mode === 'day' ? 'secondary' : 'outline'} size="sm" onClick={() => setMode('day')} data-no-drag>
            {t('statistics.mouseDistance.mode.day')}
          </Button>
          <Button type="button" variant={mode === 'total' ? 'secondary' : 'outline'} size="sm" onClick={() => setMode('total')} data-no-drag>
            {t('statistics.mouseDistance.mode.total')}
          </Button>
        </div>
      </div>

      <div className="mt-3 text-xs text-slate-600 tabular-nums">
        {mode === 'day'
          ? t('statistics.mouseDistance.summary.day', { date: anchorKey ?? '-', cm: formatCentimeters(totalCm) })
          : t('statistics.mouseDistance.summary.total', {
              cm: formatCentimeters(cumulativeMetrics.sum),
              avg: formatCentimeters(cumulativeMetrics.avg),
              peak: formatCentimeters(cumulativeMetrics.peak.cm),
              date: cumulativeMetrics.peak.date,
            })}
      </div>

      <div className="mt-4">
        <MouseDistancePanel days={trendDays} settings={settings} defaultRange={7} />
      </div>

      <div className="mt-4">
        <div className="text-xs font-semibold text-slate-700">{t('statistics.mouseDistance.breakdown.title')}</div>
        <div className="mt-2 rounded-lg border border-slate-200 bg-white">
          <div className="grid grid-cols-12 gap-2 border-b border-slate-200 px-3 py-2 text-[11px] text-slate-500">
            <div className="col-span-6">{t('statistics.mouseDistance.breakdown.display')}</div>
            <div className="col-span-2 text-right">{t('statistics.mouseDistance.breakdown.ppi')}</div>
            <div className="col-span-4 text-right">{t('statistics.mouseDistance.breakdown.distance')}</div>
          </div>
          {breakdown.length === 0 ? (
            <div className="px-3 py-3 text-sm text-slate-500">{t('statistics.noData')}</div>
          ) : (
            breakdown.map((row) => (
              <div key={row.id} className="grid grid-cols-12 gap-2 px-3 py-2 text-sm border-b border-slate-100 last:border-b-0">
                <div className="col-span-6 truncate">
                  {row.name ? row.name : row.id}
                </div>
                <div className="col-span-2 text-right tabular-nums text-slate-500">{Math.round(row.ppi)}</div>
                <div className="col-span-4 text-right tabular-nums">{formatCentimeters(row.cm)} cm</div>
              </div>
            ))
          )}
        </div>
      </div>
    </Card>
  )
}
