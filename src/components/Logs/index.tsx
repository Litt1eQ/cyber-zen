import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { clearAppLogs, openLogsDirectory, readAppLogs, type AppLogRecord } from '@/lib/appLog'
import { useAppLocaleSync } from '@/hooks/useAppLocaleSync'
import { useSettingsSync } from '@/hooks/useSettingsSync'
import { useWindowDragging } from '@/hooks/useWindowDragging'
import { useSettingsStore } from '@/stores/useSettingsStore'

function formatTime(tsMs: number): string {
  if (!Number.isFinite(tsMs)) return ''
  return new Date(tsMs).toLocaleString()
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return records
    return records.filter((r) => `${r.level} ${r.scope} ${r.message}`.toLowerCase().includes(q))
  }, [query, records])

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
