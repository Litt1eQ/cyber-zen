import { useEffect, useMemo, useRef, useState } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { RankingPanel, type RankingEntry } from '@/components/Statistics/ranking/RankingPanel'
import type { AppInputStats } from '@/lib/statisticsAggregates'
import { COMMANDS } from '@/types/events'

type Entry = { id: string; name?: string | null; total: number; keyboard: number; mouse_single: number }

function toEntries(counts: Record<string, AppInputStats>): Entry[] {
  return Object.entries(counts)
    .map(([id, v]) => ({
      id,
      name: v?.name,
      total: v?.total ?? (v?.keyboard ?? 0) + (v?.mouse_single ?? 0),
      keyboard: v?.keyboard ?? 0,
      mouse_single: v?.mouse_single ?? 0,
    }))
    .filter((e) => (e.total ?? 0) > 0)
}

export function AppInputRanking({
  counts,
  limit = 20,
  modeLabel,
}: {
  counts: Record<string, AppInputStats>
  limit?: number
  modeLabel?: string
}) {
  const requestedRef = useRef<Set<string>>(new Set())
  const [icons, setIcons] = useState<Record<string, string | null>>({})

  const { entries, maxValue } = useMemo(() => {
    const list = toEntries(counts)
    list.sort((a, b) => b.total - a.total)
    return { entries: list, maxValue: list[0]?.total ?? 0 }
  }, [counts])

  useEffect(() => {
    if (!isTauri()) return
    const ids = entries.slice(0, limit).map((e) => e.id)
    for (const id of ids) {
      if (!id) continue
      if (requestedRef.current.has(id)) continue
      requestedRef.current.add(id)

      void invoke<string | null>(COMMANDS.GET_APP_ICON, { appId: id })
        .then((pngBase64) => {
          setIcons((prev) => (id in prev ? prev : { ...prev, [id]: pngBase64 }))
        })
        .catch(() => {
          setIcons((prev) => (id in prev ? prev : { ...prev, [id]: null }))
        })
    }
  }, [entries, limit])

  const panelEntries: RankingEntry[] = useMemo(() => {
    return entries.slice(0, limit).map((e) => {
      const displayName = (e.name ?? '').trim() || e.id
      const icon = icons[e.id]
      const fallbackLetter = displayName.trim().slice(0, 1).toUpperCase()
      return {
        id: e.id,
        value: e.total,
        title: e.name ? `${e.name} (${e.id})` : e.id,
        label: (
          <div className="inline-flex items-center gap-2.5 min-w-0">
            <div className="h-6 w-6 shrink-0 overflow-hidden rounded-md border border-slate-200/60 bg-white">
              {icon ? (
                <img src={`data:image/png;base64,${icon}`} alt="" className="h-full w-full object-contain" />
              ) : (
                <div className="h-full w-full flex items-center justify-center bg-slate-50 text-[11px] font-semibold text-slate-600">
                  {fallbackLetter || '?'}
                </div>
              )}
            </div>
            <div className="truncate font-medium text-slate-900">{displayName}</div>
            <div className="ml-1 truncate text-[11px] text-slate-500 tabular-nums">
              键盘 {e.keyboard.toLocaleString()} · 单击 {e.mouse_single.toLocaleString()}
            </div>
          </div>
        ),
      }
    })
  }, [entries, icons, limit])

  return (
    <RankingPanel
      title="应用输入排行"
      subtitle={`覆盖 ${entries.length.toLocaleString()} 个应用（>0）`}
      entries={panelEntries}
      limit={limit}
      maxValue={maxValue}
      tone="up"
      emptyLabel="暂无应用归因数据"
      headerRight={modeLabel ?? null}
      listContainerClassName="max-h-72 overflow-y-auto pr-2"
      className="p-4"
    />
  )
}
