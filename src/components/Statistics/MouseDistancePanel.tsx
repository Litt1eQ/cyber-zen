import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DailyStats, Settings } from '@/types/merit'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { effectivePpiForDisplay, formatCentimeters, pixelsToCentimeters } from '@/lib/mouseDistance'
import { useDisplayMonitors } from '@/hooks/useDisplayMonitors'

function formatShortDate(dateKey: string): string {
  const parts = dateKey.split('-')
  if (parts.length !== 3) return dateKey
  return `${Number(parts[1])}/${Number(parts[2])}`
}

function buildPolyline(points: Array<{ x: number; y: number }>): string {
  return points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
}

export function MouseDistancePanel({
  days,
  settings,
  defaultRange = 7,
}: {
  days: DailyStats[]
  settings: Settings
  defaultRange?: 7 | 30
}) {
  const { t } = useTranslation()
  const [range, setRange] = useState<7 | 30>(defaultRange)

  const displayMonitors = useDisplayMonitors()
  const monitorsById = useMemo(() => {
    const out = new Map<string, { width: number; height: number }>()
    for (const m of displayMonitors.monitors ?? []) {
      out.set(m.id, { width: m.size[0], height: m.size[1] })
    }
    return out
  }, [displayMonitors.monitors])

  const points = useMemo(() => {
    const byDate = new Map<string, DailyStats>()
    for (const day of days) {
      const existing = byDate.get(day.date)
      if (!existing || (existing.mouse_move_distance_px ?? 0) < (day.mouse_move_distance_px ?? 0)) {
        byDate.set(day.date, day)
      }
    }

    const sorted = Array.from(byDate.values())
      .map((day) => {
        const byDisplay = day.mouse_move_distance_px_by_display ?? {}
        const entries = Object.entries(byDisplay)
        if (entries.length) {
          const cm = entries.reduce((acc, [id, px]) => {
            const size = monitorsById.get(id) ?? null
            const ppi = effectivePpiForDisplay(settings, id, size)
            return acc + pixelsToCentimeters(px, ppi)
          }, 0)
          return { date: day.date, cm }
        }

        const px = day.mouse_move_distance_px ?? 0
        return { date: day.date, cm: pixelsToCentimeters(px, effectivePpiForDisplay(settings, 'unknown', null)) }
      })
      .sort((a, b) => a.date.localeCompare(b.date))

    return sorted.slice(Math.max(0, sorted.length - range))
  }, [days, monitorsById, range, settings])

  const metrics = useMemo(() => {
    const sum = points.reduce((acc, p) => acc + p.cm, 0)
    const peak = points.reduce((acc, p) => Math.max(acc, p.cm), 0)
    const avg = points.length ? sum / points.length : 0
    return { sum, peak, avg }
  }, [points])

  const chart = useMemo(() => {
    const width = 420
    const height = 140
    const padX = 14
    const padY = 14
    const innerW = width - padX * 2
    const innerH = height - padY * 2

    const max = points.reduce((acc, p) => Math.max(acc, p.cm), 0)
    const safeMax = Math.max(1, max)

    const xForIndex = (idx: number) => {
      if (points.length <= 1) return padX
      return padX + (innerW * idx) / (points.length - 1)
    }
    const yForValue = (value: number) => padY + innerH - (innerH * value) / safeMax

    const linePoints = points.map((p, idx) => ({ x: xForIndex(idx), y: yForValue(p.cm) }))
    const polyline = buildPolyline(linePoints)

    return { width, height, padX, padY, innerW, innerH, safeMax, xForIndex, yForValue, polyline }
  }, [points])

  if (points.length === 0) {
    return <div className="text-sm text-slate-500">{t('statistics.noData')}</div>
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 tracking-wide">{t('customStatistics.widgets.mouse_distance.title')}</div>
          <div className="text-xs text-slate-500 mt-1">{t('customStatistics.widgets.mouse_distance.description')}</div>
        </div>
        <div className="flex items-center gap-2" data-no-drag>
          <Button
            type="button"
            variant={range === 7 ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setRange(7)}
            data-no-drag
          >
            {t('statistics.range.days', { days: 7 })}
          </Button>
          <Button
            type="button"
            variant={range === 30 ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setRange(30)}
            data-no-drag
          >
            {t('statistics.range.days', { days: 30 })}
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 text-xs text-slate-500 tabular-nums">
        <div className={cn('flex items-center gap-2', 'text-slate-700')}>
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: '#8b5cf6' }} aria-hidden="true" />
          <span>{t('customStatistics.mouseDistance')}</span>
        </div>
        <div>
          {t('statistics.trend.metricsDistance', {
            sum: formatCentimeters(metrics.sum),
            avg: formatCentimeters(metrics.avg),
            peak: formatCentimeters(metrics.peak),
          })}
        </div>
      </div>

      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          className="h-36 w-full min-w-[420px]"
          role="img"
          aria-label={t('statistics.trend.ariaLabel', { days: range })}
        >
          <defs>
            <linearGradient id="czMouseDistanceBg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f8fafc" />
              <stop offset="100%" stopColor="#ffffff" />
            </linearGradient>
          </defs>

          <rect x="0" y="0" width={chart.width} height={chart.height} rx="12" fill="url(#czMouseDistanceBg)" />

          {[0.25, 0.5, 0.75].map((k) => {
            const y = chart.padY + chart.innerH * k
            return <line key={k} x1={chart.padX} y1={y} x2={chart.padX + chart.innerW} y2={y} stroke="#e2e8f0" strokeWidth="1" />
          })}

          <polyline
            points={chart.polyline}
            fill="none"
            stroke="#8b5cf6"
            strokeWidth="2.4"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {points.map((p, idx) => {
            const x = chart.xForIndex(idx)
            if (idx === 0 || idx === points.length - 1 || points.length <= 7) {
              return (
                <text
                  key={p.date}
                  x={x}
                  y={chart.height - 6}
                  textAnchor={idx === 0 ? 'start' : idx === points.length - 1 ? 'end' : 'middle'}
                  fontSize="10"
                  fill="#64748b"
                >
                  {formatShortDate(p.date)}
                </text>
              )
            }
            return null
          })}
        </svg>
      </div>
    </div>
  )
}
