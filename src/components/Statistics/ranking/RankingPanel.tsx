import { cn } from '@/lib/utils'

export type RankingTone = 'up' | 'down'

export type RankingEntry = {
  id: string
  value: number
  label: React.ReactNode
  title?: string
  segments?: Array<{
    value: number
    className: string
    title?: string
  }>
}

function pct(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0 || value <= 0) return 0
  return Math.max(0, Math.min(100, (value / max) * 100))
}

export function RankingPanel({
  title,
  subtitle,
  entries,
  limit,
  maxValue,
  tone,
  emptyLabel = '无记录',
  headerRight,
  listContainerClassName,
  className,
}: {
  title: string
  subtitle?: string
  entries: RankingEntry[]
  limit: number
  maxValue?: number
  tone: RankingTone
  emptyLabel?: string
  headerRight?: React.ReactNode
  listContainerClassName?: string
  className?: string
}) {
  const badgeClass = tone === 'up' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
  const barClass =
    tone === 'up'
      ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
      : 'bg-gradient-to-r from-rose-500 to-orange-500'
  const panelClass = tone === 'up' ? 'border-emerald-200/70 bg-emerald-50/40' : 'border-rose-200/70 bg-rose-50/40'

  const max = maxValue ?? entries.reduce((acc, entry) => Math.max(acc, entry.value || 0), 0)

  return (
    <div className={cn('rounded-lg border p-3', panelClass, className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-900">{title}</div>
          {subtitle ? <div className="mt-1 text-[11px] text-slate-500">{subtitle}</div> : null}
        </div>
        <div className="shrink-0 text-[11px] text-slate-500 tabular-nums">
          {headerRight ?? `${Math.min(entries.length, limit)}/${limit}`}
        </div>
      </div>

      {entries.length === 0 ? (
        <div
          className="mt-3 rounded-md border border-slate-200/60 bg-white/70 px-3 py-3 text-center text-xs text-slate-500"
          data-no-drag
        >
          {emptyLabel}
        </div>
      ) : (
        <div className={cn('mt-3', listContainerClassName)}>
          <div className="space-y-1.5">
            {entries.slice(0, limit).map((entry, index) => (
              <div
                key={entry.id}
                className={cn(
                  'rounded-md border border-slate-200/60 bg-white px-3 py-2.5',
                  'transition-colors hover:bg-slate-50/80'
                )}
                title={entry.title}
                data-no-drag
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex items-center gap-2.5">
                    <div
                      className={cn(
                        'h-5 w-5 shrink-0 rounded-md text-[11px] font-bold tabular-nums',
                        'flex items-center justify-center shadow-sm',
                        badgeClass
                      )}
                      aria-hidden="true"
                    >
                      {index + 1}
                    </div>
                    <div className="min-w-0 truncate">{entry.label}</div>
                  </div>
                  <div className="shrink-0 tabular-nums text-xs text-slate-500">{(entry.value || 0).toLocaleString()}</div>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  {entry.segments?.length ? (
                    (() => {
                      const cleanSegments = entry.segments.filter((s) => (s.value ?? 0) > 0)
                      const segTotal = cleanSegments.reduce((acc, s) => acc + (s.value ?? 0), 0)
                      const totalPct = pct(entry.value, max)
                      if (cleanSegments.length === 0 || segTotal <= 0 || totalPct <= 0) {
                        return <div className={cn('h-full rounded-full', barClass)} style={{ width: `${totalPct.toFixed(2)}%` }} />
                      }
                      return (
                        <div className="h-full overflow-hidden rounded-full" style={{ width: `${totalPct.toFixed(2)}%` }}>
                          <div className="flex h-full w-full">
                            {cleanSegments.map((seg, segIndex) => {
                              const segPct = Math.max(0, Math.min(100, (seg.value / segTotal) * 100))
                              return (
                                <div
                                  key={`${entry.id}-seg-${segIndex}`}
                                  className={cn('h-full', seg.className)}
                                  style={{ width: `${segPct.toFixed(2)}%` }}
                                  title={seg.title}
                                  aria-hidden="true"
                                />
                              )
                            })}
                          </div>
                        </div>
                      )
                    })()
                  ) : (
                    <div className={cn('h-full rounded-full', barClass)} style={{ width: `${pct(entry.value, max).toFixed(2)}%` }} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
