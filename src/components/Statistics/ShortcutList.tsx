import { useMemo } from 'react'
import {
  buildKeySpecIndex,
  getKeyboardLayout,
  shortcutDisplayParts,
  type KeyboardPlatform,
} from '@/lib/keyboard'
import { cn } from '@/lib/utils'
import { isLinux, isMac, isWindows } from '@/utils/platform'
import { KeyCombo } from '@/components/ui/key-combo'

export function ShortcutList({ counts }: { counts: Record<string, number> }) {
  const platform: KeyboardPlatform = useMemo(() => {
    if (isMac()) return 'mac'
    if (isWindows()) return 'windows'
    if (isLinux()) return 'linux'
    return 'windows'
  }, [])

  const keyIndex = useMemo(() => buildKeySpecIndex(getKeyboardLayout('full_108', platform)), [platform])

  const entries = useMemo(() => {
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 200)
  }, [counts])

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-3 py-5 text-center text-sm text-slate-500">
        暂无快捷键记录
      </div>
    )
  }

  return (
    <div className="max-h-64 overflow-y-auto pr-2">
      <div className="space-y-1">
        {entries.map(([id, count]) => (
          <div
            key={id}
            className={cn(
              'flex items-center justify-between gap-4 rounded-lg border border-slate-200/60 bg-white px-3 py-2.5 text-sm',
              'transition-colors hover:bg-slate-50/80'
            )}
            title={id}
            data-no-drag
          >
            <div className="min-w-0 flex-1 overflow-hidden">
              <KeyCombo parts={shortcutDisplayParts(id, platform, keyIndex)} wrap className="font-medium" />
            </div>
            <div className="w-14 shrink-0 text-right tabular-nums text-slate-500">{count.toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
