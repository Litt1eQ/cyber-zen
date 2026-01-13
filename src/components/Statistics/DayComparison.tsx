import { useMemo } from 'react'
import type { DailyStats } from '../../types/merit'
import { buildKeySpecIndex, getUSQwertyLayout, shortcutDisplay, type KeyboardPlatform } from '@/lib/keyboard'
import { cn } from '@/lib/utils'

type DeltaEntry = { id: string; base: number; reference: number; delta: number }

function toMap(obj: Record<string, number> | undefined | null): Record<string, number> {
  return obj ?? {}
}

function deltaEntries(
  base: Record<string, number> | undefined | null,
  reference: Record<string, number> | undefined | null
): DeltaEntry[] {
  const b = toMap(base)
  const r = toMap(reference)
  const keys = new Set<string>([...Object.keys(b), ...Object.keys(r)])
  const out: DeltaEntry[] = []
  for (const id of keys) {
    const bv = b[id] ?? 0
    const rv = r[id] ?? 0
    const d = bv - rv
    if (!d) continue
    out.push({ id, base: bv, reference: rv, delta: d })
  }
  out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  return out
}

function deltaLabel(delta: number): string {
  if (delta > 0) return `+${delta.toLocaleString()}`
  return delta.toLocaleString()
}

function takeTop(entries: DeltaEntry[], predicate: (d: number) => boolean, limit: number): DeltaEntry[] {
  return entries.filter((e) => predicate(e.delta)).slice(0, limit)
}

export function DayComparison({
  title,
  base,
  reference,
  platform,
}: {
  title: string
  base?: DailyStats
  reference?: DailyStats
  platform: KeyboardPlatform
}) {
  const keyIndex = useMemo(() => buildKeySpecIndex(getUSQwertyLayout(platform)), [platform])

  const summary = useMemo(() => {
    const bTotal = base?.total ?? 0
    const rTotal = reference?.total ?? 0
    const bK = base?.keyboard ?? 0
    const rK = reference?.keyboard ?? 0
    const bM = base?.mouse_single ?? 0
    const rM = reference?.mouse_single ?? 0
    return {
      total: { base: bTotal, reference: rTotal, delta: bTotal - rTotal },
      keyboard: { base: bK, reference: rK, delta: bK - rK },
      mouse: { base: bM, reference: rM, delta: bM - rM },
    }
  }, [base, reference])

  const keyDeltas = useMemo(() => deltaEntries(base?.key_counts, reference?.key_counts), [base?.key_counts, reference?.key_counts])
  const shortcutDeltas = useMemo(
    () => deltaEntries(base?.shortcut_counts, reference?.shortcut_counts),
    [base?.shortcut_counts, reference?.shortcut_counts]
  )

  const keyUp = useMemo(() => takeTop(keyDeltas, (d) => d > 0, 8), [keyDeltas])
  const keyDown = useMemo(() => takeTop(keyDeltas, (d) => d < 0, 8), [keyDeltas])
  const shortcutUp = useMemo(() => takeTop(shortcutDeltas, (d) => d > 0, 8), [shortcutDeltas])
  const shortcutDown = useMemo(() => takeTop(shortcutDeltas, (d) => d < 0, 8), [shortcutDeltas])

  if (!base) {
    return (
      <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-3 py-5 text-center text-sm text-slate-500">
        暂无当日数据
      </div>
    )
  }

  if (!reference) {
    return (
      <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-3 py-5 text-center text-sm text-slate-500">
        {title}：无对比数据
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="text-sm font-semibold text-slate-900">{title}</div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatDelta
          label="总计"
          value={summary.total.delta}
          base={summary.total.base}
          reference={summary.total.reference}
        />
        <StatDelta
          label="键盘"
          value={summary.keyboard.delta}
          base={summary.keyboard.base}
          reference={summary.keyboard.reference}
        />
        <StatDelta
          label="单击"
          value={summary.mouse.delta}
          base={summary.mouse.base}
          reference={summary.mouse.reference}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DeltaGroup
          title="Top 按键变化"
          up={keyUp.map((e) => ({
            id: e.id,
            label: keyIndex[e.id]?.label ?? e.id,
            delta: e.delta,
          }))}
          down={keyDown.map((e) => ({
            id: e.id,
            label: keyIndex[e.id]?.label ?? e.id,
            delta: e.delta,
          }))}
        />

        <DeltaGroup
          title="Top 快捷键变化"
          up={shortcutUp.map((e) => ({
            id: e.id,
            label: shortcutDisplay(e.id, platform, keyIndex),
            delta: e.delta,
          }))}
          down={shortcutDown.map((e) => ({
            id: e.id,
            label: shortcutDisplay(e.id, platform, keyIndex),
            delta: e.delta,
          }))}
        />
      </div>
    </div>
  )
}

function StatDelta({
  label,
  value,
  base,
  reference,
}: {
  label: string
  value: number
  base: number
  reference: number
}) {
  const good = value > 0
  const bad = value < 0
  return (
    <div className="rounded-lg border border-slate-200/60 bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={cn('mt-1 text-2xl font-bold tabular-nums', good ? 'text-emerald-600' : bad ? 'text-rose-600' : 'text-slate-900')}>
        {deltaLabel(value)}
      </div>
      <div className="mt-1 text-xs text-slate-500 tabular-nums">
        {reference.toLocaleString()} → {base.toLocaleString()}
      </div>
    </div>
  )
}

function DeltaGroup({
  title,
  up,
  down,
}: {
  title: string
  up: Array<{ id: string; label: string; delta: number }>
  down: Array<{ id: string; label: string; delta: number }>
}) {
  const hasAny = up.length > 0 || down.length > 0
  if (!hasAny) {
    return (
      <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-3 py-5 text-center text-sm text-slate-500">
        {title}：暂无变化
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-slate-200/60 bg-white p-4">
      <div className="text-xs text-slate-500">{title}</div>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <DeltaList title="增长" entries={up} tone="up" />
        <DeltaList title="下降" entries={down} tone="down" />
      </div>
    </div>
  )
}

function DeltaList({
  title,
  entries,
  tone,
}: {
  title: string
  entries: Array<{ id: string; label: string; delta: number }>
  tone: 'up' | 'down'
}) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-slate-500">{title}</div>
      {entries.length === 0 ? (
        <div className="mt-2 rounded-md border border-slate-200/60 bg-slate-50 px-3 py-3 text-center text-xs text-slate-500">
          无
        </div>
      ) : (
        <div className="mt-2 space-y-1">
          {entries.map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between gap-3 rounded-md border border-slate-200/60 bg-white px-3 py-2"
              title={e.id}
              data-no-drag
            >
              <div className="min-w-0 truncate text-sm font-medium text-slate-900">{e.label}</div>
              <div className={cn('tabular-nums text-sm', tone === 'up' ? 'text-emerald-600' : 'text-rose-600')}>
                {deltaLabel(e.delta)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
