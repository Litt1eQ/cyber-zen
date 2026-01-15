import { useCallback, useEffect, useMemo, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import type { MeritStats } from '@/types/merit'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useMeritStore } from '@/stores/useMeritStore'
import { useSettingsSync } from '@/hooks/useSettingsSync'
import { useDailyReset } from '@/hooks/useDailyReset'
import { useWindowDragging } from '@/hooks/useWindowDragging'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { EVENTS } from '@/types/events'
import { buildStatisticsAggregates } from '@/lib/statisticsAggregates'
import {
  CUSTOM_STATISTICS_WIDGETS,
  DEFAULT_CUSTOM_STATISTICS_WIDGETS,
  isKnownWidgetId,
  type CustomStatisticsWidgetId,
} from './registry'
import { KeyboardHeatmapShareDialog } from '@/components/Statistics/KeyboardHeatmapShareDialog'
import { isLinux, isMac, isWindows } from '@/utils/platform'
import { MonthlyHistoryCalendar } from '@/components/Statistics/MonthlyHistoryCalendar'
import { KeyboardHeatmap } from '@/components/Statistics/KeyboardHeatmap'

function normalizeWidgetList(ids: Array<string | null | undefined> | null | undefined): CustomStatisticsWidgetId[] {
  const out: CustomStatisticsWidgetId[] = []
  const seen = new Set<string>()
  for (const raw of ids ?? []) {
    const id = raw?.trim()
    if (!id) continue
    if (!isKnownWidgetId(id)) continue
    if (seen.has(id)) continue
    out.push(id)
    seen.add(id)
  }
  return out.length ? out : [...DEFAULT_CUSTOM_STATISTICS_WIDGETS]
}

function move<T>(items: T[], from: number, to: number): T[] {
  if (from === to) return items
  if (from < 0 || from >= items.length) return items
  if (to < 0 || to >= items.length) return items
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item!)
  return next
}

export function CustomStatistics() {
  const startDragging = useWindowDragging()
  const { settings, fetchSettings, updateSettings } = useSettingsStore()
  const { stats, fetchStats, updateStats } = useMeritStore()
  const [customizeOpen, setCustomizeOpen] = useState(false)

  useSettingsSync()
  useDailyReset()

  useEffect(() => {
    fetchSettings()
    fetchStats()
  }, [fetchSettings, fetchStats])

  useEffect(() => {
    const unsubscribe = listen<MeritStats>(EVENTS.MERIT_UPDATED, (event) => {
      updateStats(event.payload)
    })
    return () => {
      unsubscribe.then((fn) => fn())
    }
  }, [updateStats])

  const allDays = useMemo(() => (stats ? [stats.today, ...stats.history] : []), [stats])

  const enabledWidgets = useMemo(
    () => normalizeWidgetList(settings?.custom_statistics_widgets),
    [settings?.custom_statistics_widgets],
  )

  const setEnabledWidgets = useCallback(
    async (next: CustomStatisticsWidgetId[]) => {
      await updateSettings({ custom_statistics_widgets: next })
    },
    [updateSettings],
  )

  const toggleWidget = useCallback(
    async (id: CustomStatisticsWidgetId, enabled: boolean) => {
      const current = enabledWidgets
      const next = enabled ? (current.includes(id) ? current : [...current, id]) : current.filter((x) => x !== id)
      await setEnabledWidgets(next.length ? next : [...DEFAULT_CUSTOM_STATISTICS_WIDGETS])
    },
    [enabledWidgets, setEnabledWidgets],
  )

  const moveWidget = useCallback(
    async (id: CustomStatisticsWidgetId, delta: -1 | 1) => {
      const idx = enabledWidgets.indexOf(id)
      if (idx < 0) return
      const next = move(enabledWidgets, idx, idx + delta)
      await setEnabledWidgets(next)
    },
    [enabledWidgets, setEnabledWidgets],
  )

  const platform = isMac() ? 'mac' : isWindows() ? 'windows' : isLinux() ? 'linux' : 'windows'
  const range = settings?.custom_statistics_range === 'all' ? 'all' : 'today'
  const scopedAggregates = useMemo(() => {
    const scopedDays = range === 'all' ? allDays : stats ? [stats.today] : []
    return buildStatisticsAggregates(scopedDays)
  }, [allDays, range, stats])

  if (!settings || !stats) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-white">
        <div className="text-slate-500">加载中...</div>
      </div>
    )
  }

  return (
    <div className="w-full h-full bg-slate-50 text-slate-900 flex flex-col">
      <div className="border-b border-slate-200/60 bg-white/70 backdrop-blur" data-tauri-drag-region onPointerDown={startDragging}>
        <div className="mx-auto w-full max-w-4xl px-6 pt-5 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-slate-900">自定义统计</h1>
              <div className="text-xs text-slate-500 mt-1 tabular-nums">
                今日 {stats.today.total.toLocaleString()} · 总功德 {stats.total_merit.toLocaleString()}
              </div>
            </div>
            <div className="flex items-center gap-2" data-no-drag>
              <Button type="button" variant="outline" onClick={() => setCustomizeOpen(true)} data-no-drag>
                自定义
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl px-6 py-5 space-y-4">
          {enabledWidgets.length === 0 ? (
            <Card className="p-5 text-slate-500">未选择任何统计模块</Card>
          ) : (
            enabledWidgets.map((id) => {
              const widget = CUSTOM_STATISTICS_WIDGETS.find((w) => w.id === id)
              if (!widget) return null
              const isHeatmap = id === 'keyboard_heatmap_total'
              const isCalendar = id === 'calendar'
              return (
                <div key={id}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-semibold text-slate-900">{widget.title}</div>
                    {isHeatmap ? (
                      <div className="flex items-center gap-2" data-no-drag>
                        <div className="text-xs text-slate-500">{range === 'all' ? '累计' : '当日'}</div>
                        <KeyboardHeatmapShareDialog
                          unshiftedCounts={scopedAggregates.keyCountsUnshifted}
                          shiftedCounts={scopedAggregates.keyCountsShifted}
                          heatLevelCount={settings.heatmap_levels}
                          layoutId={settings.keyboard_layout}
                          platform={platform}
                          dateKey={stats.today.date}
                          modeLabel={range === 'all' ? '累计' : '当日'}
                          meritValue={range === 'all' ? stats.total_merit : stats.today.total}
                          meritLabel={range === 'all' ? '累计功德' : '今日功德'}
                        />
                      </div>
                    ) : (
                      widget.description && <div className="text-xs text-slate-500">{widget.description}</div>
                    )}
                  </div>
                  <div className="w-full overflow-x-auto">
                    {isCalendar ? (
                      range === 'all' ? (
                        <MonthlyHistoryCalendar
                          days={allDays}
                          todayKey={stats.today.date}
                          heatLevelCount={settings.heatmap_levels}
                          keyboardLayoutId={settings.keyboard_layout}
                          variant="calendar_only"
                        />
                      ) : (
                        <Card className="p-4">
                          <div className="text-sm font-semibold text-slate-900 tracking-wide">今日概览</div>
                          <div className="mt-1 text-xs text-slate-500">{stats.today.date}</div>
                          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="rounded-lg border border-slate-200/60 bg-white p-3">
                              <div className="text-xs text-slate-500">总计</div>
                              <div className="mt-1 text-xl font-bold text-slate-900 tabular-nums">{stats.today.total.toLocaleString()}</div>
                            </div>
                            <div className="rounded-lg border border-slate-200/60 bg-white p-3">
                              <div className="text-xs text-slate-500">键盘</div>
                              <div className="mt-1 text-xl font-bold text-slate-900 tabular-nums">{stats.today.keyboard.toLocaleString()}</div>
                            </div>
                            <div className="rounded-lg border border-slate-200/60 bg-white p-3">
                              <div className="text-xs text-slate-500">单击</div>
                              <div className="mt-1 text-xl font-bold text-slate-900 tabular-nums">{stats.today.mouse_single.toLocaleString()}</div>
                            </div>
                          </div>
                        </Card>
                      )
                    ) : isHeatmap ? (
                      <Card className="p-4">
                        <KeyboardHeatmap
                          unshiftedCounts={scopedAggregates.keyCountsUnshifted}
                          shiftedCounts={scopedAggregates.keyCountsShifted}
                          heatLevelCount={settings.heatmap_levels}
                          layoutId={settings.keyboard_layout}
                        />
                      </Card>
                    ) : (
                      widget.render({ stats, settings, allDays, aggregates: scopedAggregates })
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      <Dialog open={customizeOpen} onOpenChange={setCustomizeOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>自定义展示</DialogTitle>
            <DialogDescription>选择要展示的统计模块，并调整顺序与展示范围（配置会自动保存）。</DialogDescription>
          </DialogHeader>

          <Card className="p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="font-medium text-slate-900">展示范围</div>
                <div className="text-sm text-slate-500 mt-1">影响键盘热力图/排行/鼠标/快捷键/小时分布等模块的数据范围。</div>
              </div>
              <div className="flex items-center gap-2 shrink-0" data-no-drag>
                <Button
                  type="button"
                  size="sm"
                  variant={range === 'today' ? 'secondary' : 'outline'}
                  onClick={() => void updateSettings({ custom_statistics_range: 'today' })}
                  data-no-drag
                >
                  当天
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={range === 'all' ? 'secondary' : 'outline'}
                  onClick={() => void updateSettings({ custom_statistics_range: 'all' })}
                  data-no-drag
                >
                  全部
                </Button>
              </div>
            </div>
          </Card>

          <div className="space-y-3">
            {CUSTOM_STATISTICS_WIDGETS.map((w) => {
              const enabled = enabledWidgets.includes(w.id)
              const idx = enabledWidgets.indexOf(w.id)
              return (
                <Card key={w.id} className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900">{w.title}</div>
                      {w.description && <div className="text-sm text-slate-500 mt-1">{w.description}</div>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0" data-no-drag>
                      {enabled && (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={idx <= 0}
                            onClick={() => void moveWidget(w.id, -1)}
                            data-no-drag
                          >
                            上移
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={idx < 0 || idx >= enabledWidgets.length - 1}
                            onClick={() => void moveWidget(w.id, 1)}
                            data-no-drag
                          >
                            下移
                          </Button>
                        </>
                      )}
                      <Switch checked={enabled} onCheckedChange={(v) => void toggleWidget(w.id, v)} data-no-drag />
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>

          <DialogFooter className="flex items-center justify-between gap-3">
            <Button type="button" variant="outline" onClick={() => void setEnabledWidgets([...DEFAULT_CUSTOM_STATISTICS_WIDGETS])} data-no-drag>
              恢复默认
            </Button>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => setCustomizeOpen(false)} data-no-drag>
                关闭
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
