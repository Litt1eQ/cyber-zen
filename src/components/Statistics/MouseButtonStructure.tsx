import { useMemo, useState } from 'react'
import type { DailyStats } from '@/types/merit'
import { buildDayIndex, keysInWindow } from '@/lib/statisticsInsights'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type RangeMode = 'day' | '7' | '30' | 'all'

type GroupId = 'left' | 'right' | 'middle' | 'side' | 'other'

const GROUPS: Array<{ id: GroupId; label: string; className: string }> = [
  { id: 'left', label: '左键', className: 'bg-amber-500/85' },
  { id: 'right', label: '右键', className: 'bg-rose-500/80' },
  { id: 'middle', label: '中键', className: 'bg-sky-500/80' },
  { id: 'side', label: '侧键', className: 'bg-violet-500/80' },
  { id: 'other', label: '其他', className: 'bg-slate-400/80' },
] as const

function pct(n: number, d: number): number {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return 0
  return Math.max(0, Math.min(1, n / d))
}

function rangeLabel(mode: RangeMode, endKey: string) {
  if (mode === 'day') return `当日 ${endKey}`
  if (mode === '7') return `近7天（截止 ${endKey}）`
  if (mode === '30') return `近30天（截止 ${endKey}）`
  return '累计'
}

function modeToDays(mode: RangeMode): number | null {
  if (mode === '7') return 7
  if (mode === '30') return 30
  if (mode === 'day') return 1
  return null
}

function groupForCode(code: string): GroupId {
  if (code === 'MouseLeft') return 'left'
  if (code === 'MouseRight') return 'right'
  if (code === 'MouseMiddle') return 'middle'
  if (code === 'MouseButton4' || code === 'MouseButton5' || code === 'MouseX1' || code === 'MouseX2' || code === 'MouseBack' || code === 'MouseForward') {
    return 'side'
  }
  return 'other'
}

function sumCounts(map: Record<string, number> | undefined | null): Record<GroupId, number> {
  const out: Record<GroupId, number> = { left: 0, right: 0, middle: 0, side: 0, other: 0 }
  if (!map) return out
  for (const [code, v] of Object.entries(map)) {
    const n = v ?? 0
    if (!n) continue
    out[groupForCode(code)] += n
  }
  return out
}

function addCounts(a: Record<GroupId, number>, b: Record<GroupId, number>): Record<GroupId, number> {
  return {
    left: a.left + b.left,
    right: a.right + b.right,
    middle: a.middle + b.middle,
    side: a.side + b.side,
    other: a.other + b.other,
  }
}

function totalOf(c: Record<GroupId, number>): number {
  return c.left + c.right + c.middle + c.side + c.other
}

function formatShortDate(dateKey: string): string {
  const parts = dateKey.split('-')
  if (parts.length !== 3) return dateKey
  return `${Number(parts[1])}/${Number(parts[2])}`
}

export function MouseButtonStructure({
  days,
  endKey,
  defaultRange = '30',
}: {
  days: DailyStats[]
  endKey: string
  defaultRange?: RangeMode
}) {
  const [mode, setMode] = useState<RangeMode>(defaultRange)
  const index = useMemo(() => buildDayIndex(days), [days])

  const stats = useMemo(() => {
    const windowDays = modeToDays(mode)
    const list =
      windowDays != null
        ? keysInWindow(endKey, windowDays).map((k) => index.get(k)).filter(Boolean)
        : Array.from(index.values())
    const sums = (list as DailyStats[]).reduce((acc, d) => addCounts(acc, sumCounts(d.mouse_button_counts)), {
      left: 0,
      right: 0,
      middle: 0,
      side: 0,
      other: 0,
    })

    const total = totalOf(sums)
    return { sums, total, windowCount: list.length }
  }, [endKey, index, mode])

  const points = useMemo(() => {
    const daysForTrend = mode === '7' ? 7 : 30
    const keys = keysInWindow(endKey, daysForTrend).reverse()
    const list = keys.map((key) => {
      const day = index.get(key) ?? null
      const sums = sumCounts(day?.mouse_button_counts)
      return { key, sums, total: totalOf(sums) }
    })
    const maxTotal = list.reduce((acc, p) => Math.max(acc, p.total), 0)
    return { list, maxTotal }
  }, [endKey, index, mode])

  const hasAny = stats.total > 0
  const labelEvery = mode === '7' ? 1 : 5

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 tracking-wide">鼠标按键结构</div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">{rangeLabel(mode, endKey)}</div>
        </div>
        <div className="flex items-center gap-2" data-no-drag>
          <Button type="button" size="sm" variant={mode === 'day' ? 'secondary' : 'outline'} onClick={() => setMode('day')} data-no-drag>
            当日
          </Button>
          <Button type="button" size="sm" variant={mode === '7' ? 'secondary' : 'outline'} onClick={() => setMode('7')} data-no-drag>
            7 天
          </Button>
          <Button type="button" size="sm" variant={mode === '30' ? 'secondary' : 'outline'} onClick={() => setMode('30')} data-no-drag>
            30 天
          </Button>
          <Button type="button" size="sm" variant={mode === 'all' ? 'secondary' : 'outline'} onClick={() => setMode('all')} data-no-drag>
            累计
          </Button>
        </div>
      </div>

      {!hasAny ? (
        <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-3 py-5 text-center text-sm text-slate-500">
          暂无鼠标按钮记录
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200/60 bg-white p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold text-slate-900">占比</div>
              <div className="text-xs text-slate-500 tabular-nums">总计 {stats.total.toLocaleString()}</div>
            </div>

            <div className="flex h-2 rounded-full bg-slate-100 overflow-hidden">
              {GROUPS.map((g) => {
                const v = stats.sums[g.id]
                if (!v) return null
                return (
                  <div
                    key={g.id}
                    className={cn('h-full', g.className)}
                    style={{ width: `${pct(v, stats.total) * 100}%` }}
                    title={`${g.label}  ${(pct(v, stats.total) * 100).toFixed(1)}%`}
                    aria-hidden="true"
                  />
                )
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {GROUPS.map((g) => {
                const v = stats.sums[g.id]
                if (!v) return null
                return (
                  <div key={g.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-center gap-2">
                      <span className={cn('h-2.5 w-2.5 rounded-sm', g.className)} aria-hidden="true" />
                      <div className="truncate font-medium text-slate-900">{g.label}</div>
                    </div>
                    <div className="shrink-0 text-[11px] text-slate-500 tabular-nums">
                      {(pct(v, stats.total) * 100).toFixed(1)}% · {v.toLocaleString()}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="text-[11px] text-slate-500">
              注：当前版本仅记录左/右键（其他按钮会被系统层忽略或归为 Other）。
            </div>
          </div>

          {mode === 'all' ? (
            <div className="text-xs text-slate-500">提示：切换到 7/30 天可查看按天趋势。</div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <div className="min-w-0 truncate">按天趋势（堆叠）</div>
                <div className="tabular-nums">峰值 {points.maxTotal.toLocaleString()}/天</div>
              </div>
              <div className="h-36">
                <div className="flex h-full items-end gap-1">
                  {points.list.map((p, idx) => {
                    const totalPct = points.maxTotal > 0 ? (p.total / points.maxTotal) * 100 : 0
                    const leftPct = points.maxTotal > 0 ? (p.sums.left / points.maxTotal) * 100 : 0
                    const rightPct = points.maxTotal > 0 ? (p.sums.right / points.maxTotal) * 100 : 0
                    const other = p.sums.middle + p.sums.side + p.sums.other
                    const otherPct = points.maxTotal > 0 ? (other / points.maxTotal) * 100 : 0
                    return (
                      <div
                        key={p.key}
                        className="flex-1 min-w-0"
                        title={`${p.key}  总计 ${p.total.toLocaleString()}（左 ${p.sums.left.toLocaleString()} / 右 ${p.sums.right.toLocaleString()} / 其他 ${other.toLocaleString()}）`}
                        data-no-drag
                      >
                        <div className="relative h-28 w-full overflow-hidden rounded-md border border-slate-200/60 bg-white">
                          <div className="absolute bottom-0 left-0 right-0 bg-slate-100" style={{ height: `${totalPct}%` }} aria-hidden="true" />
                          <div className="absolute bottom-0 left-0 right-0 bg-slate-400/70" style={{ height: `${otherPct}%` }} aria-hidden="true" />
                          <div className="absolute bottom-0 left-0 right-0 bg-rose-500/80" style={{ height: `${rightPct}%` }} aria-hidden="true" />
                          <div className="absolute bottom-0 left-0 right-0 bg-amber-500/85" style={{ height: `${leftPct}%` }} aria-hidden="true" />
                        </div>
                        <div
                          className={cn(
                            'mt-1 text-[10px] text-slate-500 tabular-nums text-center',
                            idx % labelEvery === 0 || idx === points.list.length - 1 ? '' : 'opacity-0'
                          )}
                        >
                          {formatShortDate(p.key)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm bg-amber-500/85" aria-hidden="true" />
                    左键
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm bg-rose-500/80" aria-hidden="true" />
                    右键
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm bg-slate-400/70" aria-hidden="true" />
                    其他
                  </span>
                </div>
                <div className="tabular-nums">总计 {stats.total.toLocaleString()}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

