import { useMemo } from 'react'
import type { DailyStats } from '../../types/merit'
import { cn } from '@/lib/utils'

type SeriesKey = 'total' | 'keyboard' | 'mouse_single'

const SERIES: Array<{ key: SeriesKey; label: string; stroke: string; className: string }> = [
  { key: 'total', label: '总计', stroke: '#2563eb', className: 'text-blue-600' },
  { key: 'keyboard', label: '键盘', stroke: '#0d9488', className: 'text-teal-600' },
  { key: 'mouse_single', label: '单击', stroke: '#d97706', className: 'text-amber-600' },
]

type Point = { date: string; total: number; keyboard: number; mouse_single: number }

function formatShortDate(dateKey: string): string {
  const parts = dateKey.split('-')
  if (parts.length !== 3) return dateKey
  return `${Number(parts[1])}/${Number(parts[2])}`
}

function buildPolyline(points: Array<{ x: number; y: number }>): string {
  return points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
}

export function TrendChart({
  days,
  rangeDays,
}: {
  days: DailyStats[]
  rangeDays: 7 | 30
}) {
  const points = useMemo(() => {
    const byDate = new Map<string, Point>()
    for (const day of days) {
      const existing = byDate.get(day.date)
      const next: Point = {
        date: day.date,
        total: day.total ?? 0,
        keyboard: day.keyboard ?? 0,
        mouse_single: day.mouse_single ?? 0,
      }
      if (!existing || existing.total < next.total) byDate.set(day.date, next)
    }

    const sorted = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
    return sorted.slice(Math.max(0, sorted.length - rangeDays))
  }, [days, rangeDays])

  const metrics = useMemo(() => {
    const totalSum = points.reduce((acc, p) => acc + p.total, 0)
    const maxTotal = points.reduce((acc, p) => Math.max(acc, p.total), 0)
    const avg = points.length ? totalSum / points.length : 0
    return { totalSum, maxTotal, avg }
  }, [points])

  const chart = useMemo(() => {
    const width = 420
    const height = 140
    const padX = 14
    const padY = 14
    const innerW = width - padX * 2
    const innerH = height - padY * 2

    const max = points.reduce((acc, p) => Math.max(acc, p.total, p.keyboard, p.mouse_single), 0)
    const safeMax = Math.max(1, max)

    const xForIndex = (idx: number) => {
      if (points.length <= 1) return padX
      return padX + (innerW * idx) / (points.length - 1)
    }
    const yForValue = (value: number) => padY + innerH - (innerH * value) / safeMax

    const polylines = SERIES.map((series) => {
      const linePoints = points.map((p, idx) => ({ x: xForIndex(idx), y: yForValue(p[series.key]) }))
      return { ...series, d: buildPolyline(linePoints) }
    })

    return { width, height, padX, padY, innerW, innerH, safeMax, xForIndex, yForValue, polylines }
  }, [points])

  if (points.length === 0) {
    return <div className="text-sm text-slate-500">暂无数据</div>
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-xs">
          {SERIES.map((s) => (
            <div key={s.key} className={cn('flex items-center gap-2', s.className)}>
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.stroke }} aria-hidden="true" />
              <span>{s.label}</span>
            </div>
          ))}
        </div>
        <div className="text-xs text-slate-500 tabular-nums">
          合计 {metrics.totalSum.toLocaleString()} · 日均 {Math.round(metrics.avg).toLocaleString()} · 峰值 {metrics.maxTotal.toLocaleString()}
        </div>
      </div>

      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          className="h-36 w-full min-w-[420px]"
          role="img"
          aria-label={`${rangeDays} 天趋势图`}
        >
          <defs>
            <linearGradient id="czTrendBg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f8fafc" />
              <stop offset="100%" stopColor="#ffffff" />
            </linearGradient>
          </defs>

          <rect x="0" y="0" width={chart.width} height={chart.height} rx="12" fill="url(#czTrendBg)" />

          {[0.25, 0.5, 0.75].map((t) => {
            const y = chart.padY + chart.innerH * t
            return <line key={t} x1={chart.padX} y1={y} x2={chart.padX + chart.innerW} y2={y} stroke="#e2e8f0" strokeWidth="1" />
          })}

          {chart.polylines.map((p) => (
            <polyline
              key={p.key}
              points={p.d}
              fill="none"
              stroke={p.stroke}
              strokeWidth="2.4"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

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

