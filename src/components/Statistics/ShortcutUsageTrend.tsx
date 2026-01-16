import { useMemo, useState } from 'react'
import type { DailyStats } from '@/types/merit'
import { buildDayIndex, keysInWindow } from '@/lib/statisticsInsights'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { isLinux, isMac, isWindows } from '@/utils/platform'
import { buildKeySpecIndex, getKeyboardLayout, shortcutDisplayParts, type KeyboardPlatform } from '@/lib/keyboard'
import { KeyCombo } from '@/components/ui/key-combo'

type RangeDays = 7 | 30

function formatShortDate(dateKey: string): string {
  const parts = dateKey.split('-')
  if (parts.length !== 3) return dateKey
  return `${Number(parts[1])}/${Number(parts[2])}`
}

function sumCountMap(map: Record<string, number> | undefined | null): number {
  if (!map) return 0
  let sum = 0
  for (const v of Object.values(map)) sum += v ?? 0
  return sum
}

function mergeCounts(maps: Array<Record<string, number> | undefined | null>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const map of maps) {
    if (!map) continue
    for (const [key, value] of Object.entries(map)) {
      if (!value) continue
      out[key] = (out[key] ?? 0) + value
    }
  }
  return out
}

function pct(n: number, d: number): number {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return 0
  return Math.max(0, Math.min(1, n / d))
}

const COLORS = ['bg-indigo-600', 'bg-indigo-500', 'bg-violet-500', 'bg-fuchsia-500', 'bg-sky-500'] as const

export function ShortcutUsageTrend({
  days,
  endKey,
  defaultRangeDays = 30,
}: {
  days: DailyStats[]
  endKey: string
  defaultRangeDays?: RangeDays
}) {
  const [rangeDays, setRangeDays] = useState<RangeDays>(defaultRangeDays)

  const platform: KeyboardPlatform = useMemo(() => {
    if (isMac()) return 'mac'
    if (isWindows()) return 'windows'
    if (isLinux()) return 'linux'
    return 'windows'
  }, [])

  const keyIndex = useMemo(() => buildKeySpecIndex(getKeyboardLayout('full_108', platform)), [platform])

  const index = useMemo(() => buildDayIndex(days), [days])

  const series = useMemo(() => {
    const keys = keysInWindow(endKey, rangeDays).reverse()
    const points = keys.map((key) => {
      const day = index.get(key) ?? null
      const total = sumCountMap(day?.shortcut_counts)
      return { key, total }
    })
    const maxTotal = points.reduce((acc, p) => Math.max(acc, p.total), 0)
    const sumTotal = points.reduce((acc, p) => acc + p.total, 0)
    const avg = points.length ? sumTotal / points.length : 0
    return { points, maxTotal, sumTotal, avg }
  }, [endKey, index, rangeDays])

  const top = useMemo(() => {
    const windowDays = keysInWindow(endKey, rangeDays).map((k) => index.get(k) ?? null)
    const merged = mergeCounts(windowDays.map((d) => d?.shortcut_counts))
    const entries = Object.entries(merged)
      .filter(([, v]) => (v ?? 0) > 0)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))

    const total = entries.reduce((acc, [, v]) => acc + (v ?? 0), 0)
    const top5 = entries.slice(0, 5).map(([id, count], idx) => ({
      id,
      count: count ?? 0,
      share: pct(count ?? 0, total),
      color: COLORS[idx] ?? 'bg-slate-400',
    }))
    const topSum = top5.reduce((acc, e) => acc + e.count, 0)
    return { total, top5, other: Math.max(0, total - topSum) }
  }, [endKey, index, rangeDays])

  const hasAny = series.maxTotal > 0
  const labelEvery = rangeDays === 7 ? 1 : 5

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 tracking-wide">快捷键使用趋势</div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">按天快捷键次数 · 截止 {endKey}</div>
        </div>
        <div className="flex items-center gap-2" data-no-drag>
          <Button type="button" size="sm" variant={rangeDays === 7 ? 'secondary' : 'outline'} onClick={() => setRangeDays(7)} data-no-drag>
            7 天
          </Button>
          <Button type="button" size="sm" variant={rangeDays === 30 ? 'secondary' : 'outline'} onClick={() => setRangeDays(30)} data-no-drag>
            30 天
          </Button>
        </div>
      </div>

      {!hasAny ? (
        <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-3 py-5 text-center text-sm text-slate-500">
          暂无快捷键记录
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <div className="min-w-0 truncate">柱高：快捷键次数（Ctrl/Alt/Meta + 非修饰键）</div>
            <div className="tabular-nums">
              合计 {series.sumTotal.toLocaleString()} · 日均 {Math.round(series.avg).toLocaleString()} · 峰值 {series.maxTotal.toLocaleString()}
            </div>
          </div>

          <div className="h-36">
            <div className="flex h-full items-end gap-1">
              {series.points.map((p, idx) => {
                const pct = series.maxTotal > 0 ? (p.total / series.maxTotal) * 100 : 0
                return (
                  <div
                    key={p.key}
                    className="flex-1 min-w-0"
                    title={`${p.key}  快捷键 ${p.total.toLocaleString()}`}
                    data-no-drag
                  >
                    <div className="relative h-28 w-full overflow-hidden rounded-md border border-slate-200/60 bg-white">
                      <div className="absolute bottom-0 left-0 right-0 bg-slate-100" style={{ height: `${pct}%` }} aria-hidden="true" />
                      <div className="absolute bottom-0 left-0 right-0 bg-indigo-500/85" style={{ height: `${pct}%` }} aria-hidden="true" />
                    </div>
                    <div
                      className={cn(
                        'mt-1 text-[10px] text-slate-500 tabular-nums text-center',
                        idx % labelEvery === 0 || idx === series.points.length - 1 ? '' : 'opacity-0'
                      )}
                    >
                      {formatShortDate(p.key)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200/60 bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold text-slate-900">Top 快捷键占比（近 {rangeDays} 天）</div>
              <div className="text-xs text-slate-500 tabular-nums">总计 {top.total.toLocaleString()}</div>
            </div>

            {top.total <= 0 ? (
              <div className="mt-3 text-sm text-slate-500">暂无</div>
            ) : (
              <>
                <div className="mt-3 flex h-2 rounded-full bg-slate-100 overflow-hidden">
                  {top.top5.map((e) => (
                    <div
                      key={e.id}
                      className={cn('h-full', e.color)}
                      style={{ width: `${e.share * 100}%` }}
                      title={`${e.id}  ${(e.share * 100).toFixed(1)}%`}
                      aria-hidden="true"
                    />
                  ))}
                  {top.other > 0 ? (
                    <div
                      className="h-full bg-slate-300"
                      style={{ width: `${pct(top.other, top.total) * 100}%` }}
                      title={`其他  ${(pct(top.other, top.total) * 100).toFixed(1)}%`}
                      aria-hidden="true"
                    />
                  ) : null}
                </div>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {top.top5.map((e) => (
                    <div key={e.id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex items-center gap-2">
                        <span className={cn('h-2.5 w-2.5 rounded-sm', e.color)} aria-hidden="true" />
                        <div className="min-w-0">
                          <KeyCombo parts={shortcutDisplayParts(e.id, platform, keyIndex)} wrap className="font-medium" />
                        </div>
                      </div>
                      <div className="shrink-0 text-[11px] text-slate-500 tabular-nums">
                        {(e.share * 100).toFixed(1)}% · {e.count.toLocaleString()}
                      </div>
                    </div>
                  ))}
                  {top.other > 0 ? (
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-sm bg-slate-300" aria-hidden="true" />
                        <div className="truncate text-sm font-medium text-slate-700">其他</div>
                      </div>
                      <div className="shrink-0 text-[11px] text-slate-500 tabular-nums">
                        {(pct(top.other, top.total) * 100).toFixed(1)}% · {top.other.toLocaleString()}
                      </div>
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
