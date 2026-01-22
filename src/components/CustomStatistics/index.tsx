import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import type { MeritStats } from '@/types/merit'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useMeritStore } from '@/stores/useMeritStore'
import { useSettingsSync } from '@/hooks/useSettingsSync'
import { useDailyReset } from '@/hooks/useDailyReset'
import { useWindowDragging } from '@/hooks/useWindowDragging'
import { useAppLocaleSync } from '@/hooks/useAppLocaleSync'
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
  const { t, i18n } = useTranslation()
  const startDragging = useWindowDragging()
  const { settings, fetchSettings, updateSettings } = useSettingsStore()
  const { stats, fetchStats, updateStats } = useMeritStore()
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const visibleRef = useRef(true)

  useSettingsSync()
  useDailyReset()
  useAppLocaleSync()

  useEffect(() => {
    const update = () => {
      visibleRef.current = !document.hidden
    }
    update()
    document.addEventListener('visibilitychange', update)
    return () => {
      document.removeEventListener('visibilitychange', update)
    }
  }, [])

  useEffect(() => {
    try {
      document.title = t('windows.customStatistics')
    } catch {
      // ignore
    }
  }, [i18n.resolvedLanguage, t])

  useEffect(() => {
    fetchSettings()
    fetchStats()
  }, [fetchSettings, fetchStats])

  useEffect(() => {
    const unsubscribe = listen<MeritStats>(EVENTS.MERIT_UPDATED, (event) => {
      if (!visibleRef.current) return
      updateStats(event.payload)
    })
    return () => {
      unsubscribe.then((fn) => fn())
    }
  }, [updateStats])

  useEffect(() => {
    const appWindow = getCurrentWebviewWindow()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return

      if (
        event.key === 'Escape' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey
      ) {
        if (customizeOpen) return
        event.preventDefault()
        void appWindow.close()
        return
      }

      const isCloseCombo =
        (isMac() ? event.metaKey : event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'w'
      if (isCloseCombo) {
        event.preventDefault()
        void appWindow.close()
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [customizeOpen])

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
        <div className="text-slate-500">{t('common.loading')}</div>
      </div>
    )
  }

  return (
    <div className="w-full h-full bg-slate-50 text-slate-900 flex flex-col">
      <div className="border-b border-slate-200/60 bg-white/70 backdrop-blur" data-tauri-drag-region onPointerDown={startDragging}>
        <div className="mx-auto w-full max-w-4xl px-6 pt-6 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-slate-900">{t('customStatistics.title')}</h1>
              <div className="text-xs text-slate-500 mt-1 tabular-nums">
                {t('customStatistics.todaySummary', {
                  today: stats.today.total.toLocaleString(),
                  total: stats.total_merit.toLocaleString(),
                })}
              </div>
            </div>
            <div className="flex items-center gap-2" data-no-drag>
              <Button type="button" variant="outline" onClick={() => setCustomizeOpen(true)} data-no-drag>
                {t('customStatistics.customize')}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl px-6 py-5 space-y-4">
          {enabledWidgets.length === 0 ? (
            <Card className="p-5 text-slate-500">{t('customStatistics.empty')}</Card>
          ) : (
            enabledWidgets.map((id) => {
              const widget = CUSTOM_STATISTICS_WIDGETS.find((w) => w.id === id)
              if (!widget) return null
              const isHeatmap = id === 'keyboard_heatmap_total'
              const isCalendar = id === 'calendar'
              return (
                <div key={id}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-semibold text-slate-900">{t(widget.titleKey)}</div>
                    {isHeatmap ? (
                      <div className="flex items-center gap-2" data-no-drag>
                        <div className="text-xs text-slate-500">
                          {range === 'all'
                            ? t('customStatistics.mode.cumulative')
                            : t('customStatistics.mode.daily')}
                        </div>
                        <KeyboardHeatmapShareDialog
                          unshiftedCounts={scopedAggregates.keyCountsUnshifted}
                          shiftedCounts={scopedAggregates.keyCountsShifted}
                          heatLevelCount={settings.heatmap_levels}
                          layoutId={settings.keyboard_layout}
                          platform={platform}
                          dateKey={stats.today.date}
                          modeLabel={
                            range === 'all'
                              ? t('customStatistics.mode.cumulative')
                              : t('customStatistics.mode.daily')
                          }
                          meritValue={range === 'all' ? stats.total_merit : stats.today.total}
                          meritLabel={
                            range === 'all'
                              ? t('customStatistics.meritLabel.cumulative')
                              : t('customStatistics.meritLabel.today')
                          }
                        />
                      </div>
                    ) : (
                      widget.descriptionKey && <div className="text-xs text-slate-500">{t(widget.descriptionKey)}</div>
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
                          <div className="text-sm font-semibold text-slate-900 tracking-wide">{t('customStatistics.todayOverview')}</div>
                          <div className="mt-1 text-xs text-slate-500">{stats.today.date}</div>
                          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="rounded-lg border border-slate-200/60 bg-white p-3">
                              <div className="text-xs text-slate-500">{t('customStatistics.total')}</div>
                              <div className="mt-1 text-xl font-bold text-slate-900 tabular-nums">{stats.today.total.toLocaleString()}</div>
                            </div>
                            <div className="rounded-lg border border-slate-200/60 bg-white p-3">
                              <div className="text-xs text-slate-500">{t('customStatistics.keyboard')}</div>
                              <div className="mt-1 text-xl font-bold text-slate-900 tabular-nums">{stats.today.keyboard.toLocaleString()}</div>
                            </div>
                            <div className="rounded-lg border border-slate-200/60 bg-white p-3">
                              <div className="text-xs text-slate-500">{t('customStatistics.click')}</div>
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
            <DialogTitle>{t('customStatistics.customizeDialog.title')}</DialogTitle>
            <DialogDescription>{t('customStatistics.customizeDialog.description')}</DialogDescription>
          </DialogHeader>

          <Card className="p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="font-medium text-slate-900">{t('customStatistics.customizeDialog.range.title')}</div>
                <div className="text-sm text-slate-500 mt-1">{t('customStatistics.customizeDialog.range.description')}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0" data-no-drag>
                <Button
                  type="button"
                  size="sm"
                  variant={range === 'today' ? 'secondary' : 'outline'}
                  onClick={() => void updateSettings({ custom_statistics_range: 'today' })}
                  data-no-drag
                >
                  {t('customStatistics.customizeDialog.range.today')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={range === 'all' ? 'secondary' : 'outline'}
                  onClick={() => void updateSettings({ custom_statistics_range: 'all' })}
                  data-no-drag
                >
                  {t('customStatistics.customizeDialog.range.all')}
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
                      <div className="font-medium text-slate-900">{t(w.titleKey)}</div>
                      {w.descriptionKey && <div className="text-sm text-slate-500 mt-1">{t(w.descriptionKey)}</div>}
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
                            {t('customStatistics.customizeDialog.moveUp')}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={idx < 0 || idx >= enabledWidgets.length - 1}
                            onClick={() => void moveWidget(w.id, 1)}
                            data-no-drag
                          >
                            {t('customStatistics.customizeDialog.moveDown')}
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
              {t('customStatistics.customizeDialog.resetDefault')}
            </Button>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => setCustomizeOpen(false)} data-no-drag>
                {t('common.close')}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
