import { useMemo } from 'react'
import { buildKeySpecIndex, getKeyboardLayout, normalizeKeyboardLayoutId, type KeyboardPlatform } from '@/lib/keyboard'
import { cn } from '@/lib/utils'
import { KeyCombo, type KeyComboPart } from '@/components/ui/key-combo'

type Entry = { code: string; label: string; count: number }

function keyPart(label: string): KeyComboPart[] {
  return [{ type: 'key', label }]
}

function toEntries(counts: Record<string, number>, labelForCode: (code: string) => string): Entry[] {
  return Object.entries(counts)
    .map(([code, count]) => ({ code, count: count ?? 0, label: labelForCode(code) }))
    .filter((e) => e.count > 0)
}

function pct(value: number, max: number): number {
  if (!max || value <= 0) return 0
  return Math.max(0, Math.min(100, (value / max) * 100))
}

function RankPanel({
  title,
  subtitle,
  entries,
  max,
  limit,
  tone,
}: {
  title: string
  subtitle: string
  entries: Entry[]
  max: number
  limit: number
  tone: 'up' | 'down'
}) {
  const badgeClass =
    tone === 'up'
      ? 'bg-emerald-600 text-white'
      : 'bg-rose-600 text-white'
  const barClass =
    tone === 'up'
      ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
      : 'bg-gradient-to-r from-rose-500 to-orange-500'
  const panelClass =
    tone === 'up'
      ? 'border-emerald-200/70 bg-emerald-50/40'
      : 'border-rose-200/70 bg-rose-50/40'

  return (
    <div className={cn('rounded-lg border p-3', panelClass)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-900">{title}</div>
          <div className="mt-1 text-[11px] text-slate-500">{subtitle}</div>
        </div>
        <div className="shrink-0 text-[11px] text-slate-500 tabular-nums">
          {Math.min(entries.length, limit)}/{limit}
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="mt-3 rounded-md border border-slate-200/60 bg-white/70 px-3 py-3 text-center text-xs text-slate-500">
          无记录
        </div>
      ) : (
        <div className="mt-3 space-y-1.5">
          {entries.slice(0, limit).map((e, index) => (
            <div
              key={e.code}
              className={cn(
                'rounded-md border border-slate-200/60 bg-white px-3 py-2.5',
                'transition-colors hover:bg-slate-50/80'
              )}
              title={e.code}
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
                  <div className="min-w-0 truncate">
                    <KeyCombo parts={keyPart(e.label)} size="sm" className="font-medium" />
                  </div>
                </div>
                <div className="shrink-0 tabular-nums text-xs text-slate-500">{e.count.toLocaleString()}</div>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className={cn('h-full rounded-full', barClass)} style={{ width: `${pct(e.count, max).toFixed(2)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function KeyRanking({
  counts,
  platform,
  keyboardLayoutId,
  limit = 10,
}: {
  counts: Record<string, number>
  platform: KeyboardPlatform
  keyboardLayoutId?: string | null
  limit?: number
}) {
  const layoutId = useMemo(() => normalizeKeyboardLayoutId(keyboardLayoutId), [keyboardLayoutId])
  const keyIndex = useMemo(() => buildKeySpecIndex(getKeyboardLayout(layoutId, platform)), [layoutId, platform])

  const labelForCode = useMemo(() => {
    return (code: string) => keyIndex[code]?.label ?? code
  }, [keyIndex])

  const { usedKeysCount, maxCount, top, bottom } = useMemo(() => {
    const entries = toEntries(counts, labelForCode)
    entries.sort((a, b) => b.count - a.count)
    const maxCount = entries[0]?.count ?? 0
    const top = entries.slice(0, limit)

    const bottom = [...entries].sort((a, b) => a.count - b.count).slice(0, limit)
    return { usedKeysCount: entries.length, maxCount, top, bottom }
  }, [counts, labelForCode, limit])

  if (usedKeysCount === 0) {
    return (
      <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-3 py-5 text-center text-sm text-slate-500">
        暂无按键记录
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <RankPanel title="按键最多 Top 10" subtitle={`覆盖 ${usedKeysCount.toLocaleString()} 个按键（>0）`} entries={top} max={maxCount} limit={limit} tone="up" />
        <RankPanel title="按键最少 Top 10" subtitle="仅统计有记录的按键（>0）" entries={bottom} max={maxCount} limit={limit} tone="down" />
      </div>
      <div className="text-[11px] text-slate-500">提示：未使用（0 次）的按键不计入“最少”排行。</div>
    </div>
  )
}

