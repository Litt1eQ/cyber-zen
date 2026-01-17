import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { DailyStats } from '../../types/merit'
import { buildKeySpecIndex, getKeyboardLayout, shortcutDisplayParts, type KeyboardPlatform } from '@/lib/keyboard'
import { cn } from '@/lib/utils'
import { KeyCombo } from '@/components/ui/key-combo'

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
  const { t } = useTranslation()
  const keyIndex = useMemo(() => buildKeySpecIndex(getKeyboardLayout('full_108', platform)), [platform])

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
        {t('statistics.dayComparison.noBase')}
      </div>
    )
  }

  if (!reference) {
    return (
      <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-3 py-5 text-center text-sm text-slate-500">
        {t('statistics.dayComparison.noReference', { title })}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="text-sm font-semibold text-slate-900">{title}</div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatDelta
          label={t('customStatistics.total')}
          value={summary.total.delta}
          base={summary.total.base}
          reference={summary.total.reference}
        />
        <StatDelta
          label={t('customStatistics.keyboard')}
          value={summary.keyboard.delta}
          base={summary.keyboard.base}
          reference={summary.keyboard.reference}
        />
        <StatDelta
          label={t('customStatistics.click')}
          value={summary.mouse.delta}
          base={summary.mouse.base}
          reference={summary.mouse.reference}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DeltaGroup
          title={t('statistics.dayComparison.topKeyChanges')}
          up={keyUp.map((e) => ({
            id: e.id,
            label: <KeyCombo parts={[{ type: 'key', label: keyIndex[e.id]?.label ?? e.id }]} />,
            delta: e.delta,
          }))}
          down={keyDown.map((e) => ({
            id: e.id,
            label: <KeyCombo parts={[{ type: 'key', label: keyIndex[e.id]?.label ?? e.id }]} />,
            delta: e.delta,
          }))}
        />

        <DeltaGroup
          title={t('statistics.dayComparison.topShortcutChanges')}
          up={shortcutUp.map((e) => ({
            id: e.id,
            label: <KeyCombo parts={shortcutDisplayParts(e.id, platform, keyIndex)} wrap />,
            delta: e.delta,
          }))}
          down={shortcutDown.map((e) => ({
            id: e.id,
            label: <KeyCombo parts={shortcutDisplayParts(e.id, platform, keyIndex)} wrap />,
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
  up: Array<{ id: string; label: ReactNode; delta: number }>
  down: Array<{ id: string; label: ReactNode; delta: number }>
}) {
  const { t } = useTranslation()
  const hasAny = up.length > 0 || down.length > 0
  if (!hasAny) {
    return (
      <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-3 py-5 text-center text-sm text-slate-500">
        {t('statistics.dayComparison.noChange', { title })}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-slate-200/60 bg-white p-4">
      <div className="text-xs text-slate-500">{title}</div>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <DeltaList title={t('statistics.dayComparison.increase')} entries={up} tone="up" />
        <DeltaList title={t('statistics.dayComparison.decrease')} entries={down} tone="down" />
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
  entries: Array<{ id: string; label: ReactNode; delta: number }>
  tone: 'up' | 'down'
}) {
  const { t } = useTranslation()
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-slate-500">{title}</div>
      {entries.length === 0 ? (
        <div className="mt-2 rounded-md border border-slate-200/60 bg-slate-50 px-3 py-3 text-center text-xs text-slate-500">
          {t('statistics.dayComparison.none')}
        </div>
      ) : (
        <div className="mt-2 space-y-1">
          {entries.map((e) => (
            <div
              key={e.id}
              className={cn(
                'flex items-center justify-between gap-4 rounded-lg border border-slate-200/60 bg-white px-3 py-2.5 text-sm',
                'transition-colors hover:bg-slate-50/80'
              )}
              title={e.id}
              data-no-drag
            >
              <div className="min-w-0 flex-1 overflow-hidden">{e.label}</div>
              <div
                className={cn(
                  'w-16 shrink-0 text-right tabular-nums',
                  tone === 'up' ? 'text-emerald-600' : 'text-rose-600'
                )}
              >
                {deltaLabel(e.delta)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
