import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DailyStats } from '@/types/merit'
import { buildDayIndex, sumPeriod } from '@/lib/statisticsInsights'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type RangeMode = 'day' | '7' | '30' | '365' | 'all'

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

function fmtPct(p: number): string {
  return `${Math.round(clamp01(p) * 100)}%`
}

function sumAll(index: Map<string, DailyStats>) {
  let total = 0
  let keyboard = 0
  let mouse_single = 0
  for (const day of index.values()) {
    total += day?.total ?? 0
    keyboard += day?.keyboard ?? 0
    mouse_single += day?.mouse_single ?? 0
  }
  return { total, keyboard, mouse_single }
}

function rangeLabel(
  t: (key: string, options?: Record<string, unknown>) => string,
  mode: RangeMode,
  endKey: string,
) {
  if (mode === 'day') return t('statistics.range.dayWithDate', { date: endKey })
  if (mode === '7') return t('statistics.range.lastDaysWithEnd', { days: 7, date: endKey })
  if (mode === '30') return t('statistics.range.lastDaysWithEnd', { days: 30, date: endKey })
  if (mode === '365') return t('statistics.range.lastYearWithEnd', { date: endKey })
  return t('customStatistics.mode.cumulative')
}

function modeToDays(mode: RangeMode): number | null {
  if (mode === '7') return 7
  if (mode === '30') return 30
  if (mode === '365') return 365
  if (mode === 'day') return 1
  return null
}

export function InputSourceShare({
  days,
  endKey,
  defaultRange = '30',
}: {
  days: DailyStats[]
  endKey: string
  defaultRange?: RangeMode
}) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<RangeMode>(defaultRange)
  const index = useMemo(() => buildDayIndex(days), [days])

  const counters = useMemo(() => {
    const windowDays = modeToDays(mode)
    if (windowDays != null) return sumPeriod(index, endKey, windowDays)
    return sumAll(index)
  }, [endKey, index, mode])

  const total = Math.max(0, counters.total)
  const keyboard = Math.max(0, counters.keyboard)
  const mouse = Math.max(0, counters.mouse_single)
  const denom = total > 0 ? total : 1
  const keyboardShare = clamp01(keyboard / denom)
  const mouseShare = clamp01(mouse / denom)
  const hasAny = total > 0

  const chart = useMemo(() => {
    const size = 120
    const strokeWidth = 14
    const r = (size - strokeWidth) / 2
    const cx = size / 2
    const cy = size / 2
    const circ = 2 * Math.PI * r
    const kLen = circ * keyboardShare
    const mLen = circ * mouseShare
    return { size, strokeWidth, r, cx, cy, circ, kLen, mLen }
  }, [keyboardShare, mouseShare])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 tracking-wide">{t('customStatistics.widgets.source_share.title')}</div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">{rangeLabel(t, mode, endKey)}</div>
        </div>
        <div className="flex items-center gap-2" data-no-drag>
          <Button type="button" size="sm" variant={mode === 'day' ? 'secondary' : 'outline'} onClick={() => setMode('day')} data-no-drag>
            {t('statistics.range.day')}
          </Button>
          <Button type="button" size="sm" variant={mode === '7' ? 'secondary' : 'outline'} onClick={() => setMode('7')} data-no-drag>
            {t('statistics.range.days', { days: 7 })}
          </Button>
          <Button type="button" size="sm" variant={mode === '30' ? 'secondary' : 'outline'} onClick={() => setMode('30')} data-no-drag>
            {t('statistics.range.days', { days: 30 })}
          </Button>
          <Button type="button" size="sm" variant={mode === 'all' ? 'secondary' : 'outline'} onClick={() => setMode('all')} data-no-drag>
            {t('customStatistics.mode.cumulative')}
          </Button>
        </div>
      </div>

      {!hasAny ? (
        <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-3 py-5 text-center text-sm text-slate-500">
          {t('statistics.noData')}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-[140px_minmax(0,1fr)] gap-4 items-center">
          <div className="flex items-center justify-center">
            <svg
              viewBox={`0 0 ${chart.size} ${chart.size}`}
              className="h-[120px] w-[120px]"
              role="img"
              aria-label={t('statistics.inputSourceShare.ariaLabel')}
            >
              <g transform={`rotate(-90 ${chart.cx} ${chart.cy})`}>
                <circle
                  cx={chart.cx}
                  cy={chart.cy}
                  r={chart.r}
                  fill="none"
                  stroke="#e2e8f0"
                  strokeWidth={chart.strokeWidth}
                />
                <circle
                  cx={chart.cx}
                  cy={chart.cy}
                  r={chart.r}
                  fill="none"
                  stroke="#0d9488"
                  strokeWidth={chart.strokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={`${chart.kLen} ${chart.circ}`}
                  strokeDashoffset={0}
                />
                <circle
                  cx={chart.cx}
                  cy={chart.cy}
                  r={chart.r}
                  fill="none"
                  stroke="#d97706"
                  strokeWidth={chart.strokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={`${chart.mLen} ${chart.circ}`}
                  strokeDashoffset={-chart.kLen}
                />
              </g>
              <text x={chart.cx} y={chart.cy - 2} textAnchor="middle" fontSize="16" fontWeight="700" fill="#0f172a">
                {total.toLocaleString()}
              </text>
              <text x={chart.cx} y={chart.cy + 18} textAnchor="middle" fontSize="10" fill="#64748b">
                {t('customStatistics.total')}
              </text>
            </svg>
          </div>

          <div className="space-y-2">
            <div className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(160px,1fr))]">
              <div className="rounded-lg border border-slate-200/60 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-2 text-[11px] text-slate-500">
                    <span className="h-2.5 w-2.5 rounded-sm bg-teal-500" aria-hidden="true" />
                    {t('customStatistics.keyboard')}
                  </div>
                  <div className="text-[11px] text-slate-500 tabular-nums">{fmtPct(keyboardShare)}</div>
                </div>
                <div className="mt-1 text-lg font-bold text-slate-900 tabular-nums">{keyboard.toLocaleString()}</div>
                <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full bg-teal-500" style={{ width: `${keyboardShare * 100}%` }} aria-hidden="true" />
                </div>
              </div>

              <div className="rounded-lg border border-slate-200/60 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-2 text-[11px] text-slate-500">
                    <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" aria-hidden="true" />
                    {t('customStatistics.click')}
                  </div>
                  <div className="text-[11px] text-slate-500 tabular-nums">{fmtPct(mouseShare)}</div>
                </div>
                <div className="mt-1 text-lg font-bold text-slate-900 tabular-nums">{mouse.toLocaleString()}</div>
                <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full bg-amber-500" style={{ width: `${mouseShare * 100}%` }} aria-hidden="true" />
                </div>
              </div>
            </div>

            <div className={cn('text-xs text-slate-500 tabular-nums', total !== keyboard + mouse && 'text-slate-400')}>
              {total !== keyboard + mouse
                ? t('statistics.notes.totalMismatch', {
                    total: total.toLocaleString(),
                    sum: (keyboard + mouse).toLocaleString(),
                  })
                : ' '}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
