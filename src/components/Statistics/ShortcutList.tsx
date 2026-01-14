import { useMemo } from 'react'
import {
  buildKeySpecIndex,
  getKeyboardLayout,
  shortcutDisplayParts,
  type KeyboardPlatform,
} from '@/lib/keyboard'
import { isLinux, isMac, isWindows } from '@/utils/platform'
import { KeyCombo } from '@/components/ui/key-combo'
import { RankingPanel, type RankingEntry } from '@/components/Statistics/ranking/RankingPanel'

export function ShortcutList({
  counts,
  modeLabel,
}: {
  counts: Record<string, number>
  modeLabel?: string
}) {
  const platform: KeyboardPlatform = useMemo(() => {
    if (isMac()) return 'mac'
    if (isWindows()) return 'windows'
    if (isLinux()) return 'linux'
    return 'windows'
  }, [])

  const keyIndex = useMemo(() => buildKeySpecIndex(getKeyboardLayout('full_108', platform)), [platform])

  const sorted = useMemo(() => {
    return Object.entries(counts)
      .filter(([, v]) => (v ?? 0) > 0)
      .sort((a, b) => b[1] - a[1])
  }, [counts])

  const maxCount = sorted[0]?.[1] ?? 0

  const entries: RankingEntry[] = useMemo(() => {
    return sorted.map(([id, count]) => ({
      id,
      value: count,
      label: <KeyCombo parts={shortcutDisplayParts(id, platform, keyIndex)} wrap className="font-medium" />,
      title: id,
    }))
  }, [keyIndex, platform, sorted])

  const headerRight = useMemo(() => {
    return modeLabel ?? null
  }, [modeLabel])

  return (
    <RankingPanel
      title="快捷键排行"
      subtitle={`覆盖 ${sorted.length.toLocaleString()} 个快捷键（>0）`}
      entries={entries}
      limit={entries.length}
      maxValue={maxCount}
      tone="up"
      emptyLabel="暂无快捷键记录"
      headerRight={headerRight}
      listContainerClassName="max-h-72 overflow-y-auto pr-2"
      className="p-4"
    />
  )
}
