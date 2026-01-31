import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '@tauri-apps/api/core'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { clearAppLogs, openLogsDirectory, readAppLogs, type AppLogRecord } from '@/lib/appLog'
import { useAppLocaleSync } from '@/hooks/useAppLocaleSync'
import { useSettingsSync } from '@/hooks/useSettingsSync'
import { useWindowDragging } from '@/hooks/useWindowDragging'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { COMMANDS } from '@/types/events'

function formatTime(tsMs: number): string {
  if (!Number.isFinite(tsMs)) return ''
  return new Date(tsMs).toLocaleString()
}

type PerfTiming = {
  samples?: number
  totalNs?: number
  avgNs?: number
}

type PerfSnapshot = {
  supported?: boolean
  enabled?: boolean
  uptimeMs?: number
  counters?: {
    inputEventsTotal?: number
    inputEventsKey?: number
    inputEventsMouseClick?: number
    inputEventsMouseMove?: number
    enqueueTriggersTotal?: number
    batchProcessCalls?: number
    batchProcessTriggers?: number
    persistRequests?: number
    heatmapClicksRecorded?: number
    heatmapEmits?: number
  }
  timings?: {
    keycodeMap?: PerfTiming
    activeAppQuery?: PerfTiming
    clickHeatmap?: PerfTiming
    mouseDistanceMove?: PerfTiming
    mouseDistanceFlush?: PerfTiming
    batchProcess?: PerfTiming
  }
}

function fmtNs(ns?: number): string {
  const v = Number(ns)
  if (!Number.isFinite(v) || v <= 0) return '—'
  if (v < 1_000) return `${v.toFixed(0)} ns`
  if (v < 1_000_000) return `${(v / 1_000).toFixed(1)} µs`
  if (v < 1_000_000_000) return `${(v / 1_000_000).toFixed(2)} ms`
  return `${(v / 1_000_000_000).toFixed(2)} s`
}

function fmtRate(delta: number, dtMs: number): string {
  if (!Number.isFinite(delta) || !Number.isFinite(dtMs) || dtMs <= 0) return '—'
  return `${(delta / (dtMs / 1000)).toFixed(1)}/s`
}

export function Logs() {
  const { t, i18n } = useTranslation()
  const fetchSettings = useSettingsStore((s) => s.fetchSettings)
  useSettingsSync()
  useAppLocaleSync()
  const startDragging = useWindowDragging()
  const [records, setRecords] = useState<AppLogRecord[]>([])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const mountedRef = useRef(true)
  const busyRef = useRef(false)
  const refreshSeqRef = useRef(0)

  const [perf, setPerf] = useState<PerfSnapshot | null>(null)
  const [perfError, setPerfError] = useState<string | null>(null)
  const [perfBusy, setPerfBusy] = useState(false)
  const [perfAutoRefresh, setPerfAutoRefresh] = useState(true)
  const [perfLastUpdatedAt, setPerfLastUpdatedAt] = useState<number | null>(null)
  const prevPerfRef = useRef<{ snap: PerfSnapshot; atMs: number } | null>(null)
  const perfToggleSeqRef = useRef(0)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return records
    return records.filter((r) => `${r.level} ${r.scope} ${r.message}`.toLowerCase().includes(q))
  }, [query, records])

  const refreshPerf = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setPerfBusy(true)
    try {
      setPerfError(null)
      const snap = await invoke<PerfSnapshot>(COMMANDS.GET_PERF_SNAPSHOT)
      if (!mountedRef.current) return
      setPerf(snap)
      setPerfLastUpdatedAt(Date.now())
    } catch (e) {
      if (!mountedRef.current) return
      setPerfError(String(e))
    } finally {
      if (!opts?.silent && mountedRef.current) setPerfBusy(false)
    }
  }, [])

  const setPerfEnabled = useCallback(
    async (enabled: boolean) => {
      const seq = ++perfToggleSeqRef.current
      setPerfBusy(true)
      try {
        setPerfError(null)
        await invoke(COMMANDS.SET_PERF_ENABLED, { enabled })
        if (!mountedRef.current) return
        if (seq !== perfToggleSeqRef.current) return
        await refreshPerf({ silent: true })
      } catch (e) {
        if (!mountedRef.current) return
        if (seq !== perfToggleSeqRef.current) return
        setPerfError(String(e))
      } finally {
        if (mountedRef.current && seq === perfToggleSeqRef.current) setPerfBusy(false)
      }
    },
    [refreshPerf]
  )

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    const seq = ++refreshSeqRef.current
    if (!opts?.silent) setBusy(true)
    try {
      setError(null)
      const next = await readAppLogs({ limit: 1000 })
      if (!mountedRef.current) return
      if (seq !== refreshSeqRef.current) return
      setRecords(next)
    } catch (e) {
      if (!mountedRef.current) return
      if (seq !== refreshSeqRef.current) return
      setError(String(e))
    } finally {
      if (!opts?.silent && mountedRef.current && seq === refreshSeqRef.current) setBusy(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    busyRef.current = busy
  }, [busy])

  useEffect(() => {
    void fetchSettings()
  }, [fetchSettings])

  useEffect(() => {
    try {
      document.title = t('windows.logs')
    } catch {
      // ignore
    }
    void refresh()
    const id = window.setInterval(() => {
      if (document.hidden) return
      if (busyRef.current) return
      void refresh({ silent: true })
    }, 1500)
    return () => window.clearInterval(id)
  }, [i18n.resolvedLanguage, refresh, t])

  useEffect(() => {
    if (!perfAutoRefresh) return
    void refreshPerf({ silent: true })
    const id = window.setInterval(() => {
      if (document.hidden) return
      if (perfBusy) return
      void refreshPerf({ silent: true })
    }, 500)
    return () => window.clearInterval(id)
  }, [perfAutoRefresh, perfBusy, refreshPerf])

  const perfRates = useMemo(() => {
    if (!perf) return null
    const nowMs = Date.now()
    const prev = prevPerfRef.current
    prevPerfRef.current = { snap: perf, atMs: nowMs }

    if (!prev) return null
    const dtMs = nowMs - prev.atMs
    if (dtMs <= 0) return null

    const c = perf.counters ?? {}
    const p = prev.snap.counters ?? {}
    return {
      dtMs,
      inputEventsTotal: fmtRate((c.inputEventsTotal ?? 0) - (p.inputEventsTotal ?? 0), dtMs),
      clicks: fmtRate((c.inputEventsMouseClick ?? 0) - (p.inputEventsMouseClick ?? 0), dtMs),
      moves: fmtRate((c.inputEventsMouseMove ?? 0) - (p.inputEventsMouseMove ?? 0), dtMs),
      keys: fmtRate((c.inputEventsKey ?? 0) - (p.inputEventsKey ?? 0), dtMs),
      triggers: fmtRate((c.enqueueTriggersTotal ?? 0) - (p.enqueueTriggersTotal ?? 0), dtMs),
      heatmapEmits: fmtRate((c.heatmapEmits ?? 0) - (p.heatmapEmits ?? 0), dtMs),
    }
  }, [perf])

  const handleClear = useCallback(async () => {
    setBusy(true)
    try {
      refreshSeqRef.current += 1
      setRecords([])
      setQuery('')
      await clearAppLogs()
      await refresh({ silent: true })
    } catch (e) {
      setError(String(e))
    } finally {
      if (mountedRef.current) setBusy(false)
    }
  }, [refresh])

  return (
    <div className="w-full h-full bg-slate-50 text-slate-900" onPointerDown={startDragging}>
      <div className="h-full flex flex-col px-4 pb-4 pt-6 gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-base font-semibold">{t('logs.title')}</div>
            <div className="text-xs text-slate-500">{t('logs.subtitle')}</div>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => void openLogsDirectory()} disabled={busy} data-no-drag>
              {t('logs.openDir')}
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setClearDialogOpen(true)} disabled={busy} data-no-drag>
              {t('common.clear')}
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('logs.searchPlaceholder')}
            className="max-w-md"
            data-no-drag
          />
          {busy && <div className="text-xs text-slate-500">{t('common.loading')}</div>}
          {error && <div className="text-xs text-red-600">{error}</div>}
        </div>

        <Card className="p-3" data-no-drag>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold">Perf Snapshot</div>
              <div className="text-xs text-slate-500">
                {perf?.supported === false ? 'unsupported' : perf?.enabled ? 'enabled' : 'disabled'} · {perfLastUpdatedAt ? `updated ${new Date(perfLastUpdatedAt).toLocaleTimeString()}` : 'not loaded'}
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-slate-600">Enabled</Label>
                <Switch
                  checked={!!perf?.enabled}
                  onCheckedChange={(v) => void setPerfEnabled(v)}
                  disabled={perf?.supported === false || perfBusy}
                  data-no-drag
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-slate-600">Auto</Label>
                <Switch checked={perfAutoRefresh} onCheckedChange={setPerfAutoRefresh} data-no-drag />
              </div>
              <Button size="sm" variant="outline" onClick={() => void refreshPerf()} disabled={perfBusy} data-no-drag>
                Refresh
              </Button>
            </div>
          </div>

          {perfError && <div className="mt-2 text-xs text-red-600">{perfError}</div>}

          {perf?.supported !== false && !perf?.enabled && (
            <div className="mt-2 text-xs text-slate-500">Enable perf to start collecting counters/timings.</div>
          )}
          {perf?.supported === false && (
            <div className="mt-2 text-xs text-slate-500">
              This build does not include perf counters. Use <span className="font-mono">pnpm tauri dev</span> (debug build), or build with the Cargo feature <span className="font-mono">perf</span>.
            </div>
          )}

          <CardContent className="p-0 pt-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-md border border-slate-200/60 bg-white px-3 py-2">
                <div className="text-xs font-medium text-slate-600">Rates</div>
                <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-xs tabular-nums">
                  <div className="text-slate-500">input</div>
                  <div>{perfRates?.inputEventsTotal ?? '—'}</div>
                  <div className="text-slate-500">click</div>
                  <div>{perfRates?.clicks ?? '—'}</div>
                  <div className="text-slate-500">move</div>
                  <div>{perfRates?.moves ?? '—'}</div>
                  <div className="text-slate-500">key</div>
                  <div>{perfRates?.keys ?? '—'}</div>
                  <div className="text-slate-500">trigger</div>
                  <div>{perfRates?.triggers ?? '—'}</div>
                  <div className="text-slate-500">heatmap emit</div>
                  <div>{perfRates?.heatmapEmits ?? '—'}</div>
                </div>
              </div>

              <div className="rounded-md border border-slate-200/60 bg-white px-3 py-2">
                <div className="text-xs font-medium text-slate-600">Avg Duration</div>
                <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-xs tabular-nums">
                  <div className="text-slate-500">keycode map</div>
                  <div>{fmtNs(perf?.timings?.keycodeMap?.avgNs)}</div>
                  <div className="text-slate-500">active app</div>
                  <div>{fmtNs(perf?.timings?.activeAppQuery?.avgNs)}</div>
                  <div className="text-slate-500">click heatmap</div>
                  <div>{fmtNs(perf?.timings?.clickHeatmap?.avgNs)}</div>
                  <div className="text-slate-500">mouse distance (move)</div>
                  <div>{fmtNs(perf?.timings?.mouseDistanceMove?.avgNs)}</div>
                  <div className="text-slate-500">mouse distance (flush)</div>
                  <div>{fmtNs(perf?.timings?.mouseDistanceFlush?.avgNs)}</div>
                  <div className="text-slate-500">batch process</div>
                  <div>{fmtNs(perf?.timings?.batchProcess?.avgNs)}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex-1 overflow-auto rounded-lg border border-slate-200/60 bg-white shadow-sm">
          <div className="sticky top-0 z-10 border-b border-slate-200/60 bg-white/90 backdrop-blur px-3 py-2 text-xs font-medium text-slate-600 grid grid-cols-[170px_70px_160px_1fr] gap-2">
            <div>{t('logs.columns.time')}</div>
            <div>{t('logs.columns.level')}</div>
            <div>{t('logs.columns.scope')}</div>
            <div>{t('logs.columns.message')}</div>
          </div>
          <div className="divide-y divide-slate-100">
            {filtered.length ? (
              filtered
                .slice()
                .reverse()
                .map((r, idx) => (
                  <div
                    key={`${r.ts_ms}-${idx}`}
                    className="px-3 py-2 text-xs grid grid-cols-[170px_70px_160px_1fr] gap-2 items-start"
                  >
                    <div className="text-slate-500 tabular-nums">{formatTime(r.ts_ms)}</div>
                    <div className="font-medium text-slate-700">{r.level}</div>
                    <div className="text-slate-600 break-words">{r.scope}</div>
                    <div className="text-slate-800 break-words whitespace-pre-wrap">{r.message}</div>
                  </div>
                ))
            ) : (
              <div className="px-3 py-8 text-sm text-slate-500 text-center">{t('logs.empty')}</div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <DialogContent className="max-w-sm" data-no-drag>
          <DialogHeader>
            <DialogTitle>{t('common.clear')}</DialogTitle>
            <DialogDescription>{t('logs.clearConfirm')}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setClearDialogOpen(false)} disabled={busy} data-no-drag>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                setClearDialogOpen(false)
                void handleClear()
              }}
              data-no-drag
            >
              {t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
