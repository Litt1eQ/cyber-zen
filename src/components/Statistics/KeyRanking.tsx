import { useMemo } from 'react'
import { buildKeySpecIndex, getKeyboardLayout, normalizeKeyboardLayoutId, type KeyboardPlatform } from '@/lib/keyboard'
import { KeyCombo, type KeyComboPart } from '@/components/ui/key-combo'
import { RankingPanel, type RankingEntry } from '@/components/Statistics/ranking/RankingPanel'

type Entry = { code: string; label: string; count: number }

function keyPart(label: string): KeyComboPart[] {
  return [{ type: 'key', label }]
}

function toEntries(counts: Record<string, number>, labelForCode: (code: string) => string): Entry[] {
  return Object.entries(counts)
    .map(([code, count]) => ({ code, count: count ?? 0, label: labelForCode(code) }))
    .filter((e) => e.count > 0)
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
        <RankingPanel
          title="按键最多 Top 10"
          subtitle={`覆盖 ${usedKeysCount.toLocaleString()} 个按键（>0）`}
          entries={top.map(
            (entry): RankingEntry => ({
              id: entry.code,
              value: entry.count,
              label: <KeyCombo parts={keyPart(entry.label)} size="sm" className="font-medium" />,
              title: entry.code,
            })
          )}
          maxValue={maxCount}
          limit={limit}
          tone="up"
        />
        <RankingPanel
          title="按键最少 Top 10"
          subtitle="仅统计有记录的按键（>0）"
          entries={bottom.map(
            (entry): RankingEntry => ({
              id: entry.code,
              value: entry.count,
              label: <KeyCombo parts={keyPart(entry.label)} size="sm" className="font-medium" />,
              title: entry.code,
            })
          )}
          maxValue={maxCount}
          limit={limit}
          tone="down"
        />
      </div>
      <div className="text-[11px] text-slate-500">提示：未使用（0 次）的按键不计入“最少”排行。</div>
    </div>
  )
}
