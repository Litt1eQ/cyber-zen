import { useMemo } from 'react'
import { cn } from '@/lib/utils'

type HourBucket = { total: number; keyboard: number; mouse_single: number }

function normalizeHourly(hourly: HourBucket[] | undefined | null): HourBucket[] {
  const out: HourBucket[] = Array.from({ length: 24 }, () => ({ total: 0, keyboard: 0, mouse_single: 0 }))
  if (!hourly) return out
  for (let i = 0; i < Math.min(24, hourly.length); i++) {
    const b = hourly[i]
    if (!b) continue
    out[i] = {
      total: b.total ?? 0,
      keyboard: b.keyboard ?? 0,
      mouse_single: b.mouse_single ?? 0,
    }
  }
  return out
}

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}`
}

export function HourlyDistribution({ hourly }: { hourly?: HourBucket[] | null }) {
  const buckets = useMemo(() => normalizeHourly(hourly), [hourly])
  const maxTotal = useMemo(() => buckets.reduce((acc, b) => Math.max(acc, b.total), 0), [buckets])
  const hasAny = maxTotal > 0

  if (!hasAny) {
    return (
      <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-3 py-5 text-center text-sm text-slate-500">
        暂无小时分布（仅新版本开始记录）
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm bg-teal-500" aria-hidden="true" />
            键盘
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" aria-hidden="true" />
            单击
          </span>
        </div>
        <div className="tabular-nums">峰值 {maxTotal.toLocaleString()}/小时</div>
      </div>

      <div className="h-28">
        <div className="flex h-full items-end gap-1">
          {buckets.map((b, hour) => {
            const total = b.total
            const k = Math.min(b.keyboard, total)
            const m = Math.min(b.mouse_single, Math.max(0, total - k))
            const totalPct = maxTotal > 0 ? (total / maxTotal) * 100 : 0
            const kPct = maxTotal > 0 ? (k / maxTotal) * 100 : 0
            const mPct = maxTotal > 0 ? (m / maxTotal) * 100 : 0
            return (
              <div
                key={hour}
                className="flex-1 min-w-0"
                title={`${hourLabel(hour)}:00  总计 ${total.toLocaleString()}（键盘 ${k.toLocaleString()} / 单击 ${m.toLocaleString()}）`}
                data-no-drag
              >
                <div className="relative h-24 w-full overflow-hidden rounded-md border border-slate-200/60 bg-white">
                  <div
                    className="absolute bottom-0 left-0 right-0 bg-slate-100"
                    style={{ height: `${totalPct}%` }}
                    aria-hidden="true"
                  />
                  <div
                    className="absolute bottom-0 left-0 right-0 bg-amber-500/80"
                    style={{ height: `${mPct}%` }}
                    aria-hidden="true"
                  />
                  <div
                    className="absolute bottom-0 left-0 right-0 bg-teal-500/85"
                    style={{ height: `${kPct}%` }}
                    aria-hidden="true"
                  />
                </div>
                <div className={cn('mt-1 text-[10px] text-slate-500 tabular-nums text-center', hour % 2 === 0 ? '' : 'opacity-0')}>
                  {hourLabel(hour)}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

