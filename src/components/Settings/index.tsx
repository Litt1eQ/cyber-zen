import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getName, getVersion } from '@tauri-apps/api/app'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { appDataDir } from '@tauri-apps/api/path'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { openPath, openUrl } from '@tauri-apps/plugin-opener'

import { useInputListener } from '../../hooks/useInputListener'
import { useInputMonitoringPermission } from '../../hooks/useInputMonitoringPermission'
import { useSettingsSync } from '../../hooks/useSettingsSync'
import { useMeritStore } from '../../stores/useMeritStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { COMMANDS, EVENTS } from '../../types/events'
import { Statistics } from '../Statistics'
import { useWindowDragging } from '../../hooks/useWindowDragging'
import { ShortcutRecorder } from './ShortcutRecorder'
import { IconChart, IconInfo, IconKeyboard, IconPalette, IconSettings, IconTrophy } from './icons'
import { Switch } from '../ui/switch'
import { Slider } from '../ui/slider'
import { Button } from '../ui/button'
import { TodayOverviewPanel } from '../Statistics/TodayOverviewPanel'
import { Input } from '../ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { isLinux, isMac, isWindows } from '../../utils/platform'
import { HEAT_LEVEL_COUNT_DEFAULT, HEAT_LEVEL_COUNT_MAX, HEAT_LEVEL_COUNT_MIN } from '../Statistics/heatScale'
import { KEYBOARD_LAYOUTS, normalizeKeyboardLayoutId } from '@/lib/keyboard'
import { useAppLocaleSync } from '@/hooks/useAppLocaleSync'
import { MouseDistanceCalibration } from '@/components/Settings/MouseDistanceCalibration'
import { AchievementsTab } from '@/components/Settings/AchievementsTab'
import { getSystemNotificationPermission, isSystemNotificationSupported, requestSystemNotificationPermission } from '@/lib/notifications'
import { AppearanceTab } from '@/components/Settings/AppearanceTab'
import { SettingCard, SettingRow, SettingsSection } from '@/components/Settings/SettingsLayout'

type SettingsTab = 'general' | 'appearance' | 'shortcuts' | 'achievements' | 'statistics' | 'about'

type UpdateInfo = { version: string; body?: string | null; date?: string | null }
type UpdateDownloadEventPayload =
  | { type: 'started'; downloaded: number; total: number | null }
  | { type: 'progress'; downloaded: number; total: number | null }
  | { type: 'finished'; downloaded: number; total: number | null }

const OPEN_SOURCE_URL = 'https://github.com/Litt1eQ/cyber-zen'
const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const
  const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** idx
  const precision = idx === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(precision)} ${units[idx]}`
}
export function Settings() {
  const { t, i18n } = useTranslation()
  const { settings, updateSettings, fetchSettings } = useSettingsStore()
  const { clearHistory, resetAll, stats, fetchStats } = useMeritStore()
  const { isListening, toggleListening, error: listeningError } = useInputListener()
  const inputMonitoring = useInputMonitoringPermission()
  const startDragging = useWindowDragging()
  useAppLocaleSync()
  const [showConfirm, setShowConfirm] = useState<'clear' | 'reset' | null>(null)
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [appInfo, setAppInfo] = useState<{ name: string; version: string } | null>(null)
  const [dataDir, setDataDir] = useState<string>('')
  const [openDataDirError, setOpenDataDirError] = useState<string | null>(null)
  const [autostartBusy, setAutostartBusy] = useState(false)
  const [autostartError, setAutostartError] = useState<string | null>(null)
  const [achievementNotifyBusy, setAchievementNotifyBusy] = useState(false)
  const [achievementNotifyError, setAchievementNotifyError] = useState<string | null>(null)
  const [achievementNotifyDialogOpen, setAchievementNotifyDialogOpen] = useState(false)
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | null>(null)
  const [inputPermissionDialogOpen, setInputPermissionDialogOpen] = useState(false)
  const [inputPermissionDialogBusy, setInputPermissionDialogBusy] = useState(false)
  const inputPermissionPromptShownRef = useRef(false)
  const inputPermissionDialogPreviousAlwaysOnTopRef = useRef<boolean | null>(null)
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false)
  const [updateState, setUpdateState] = useState<
    | { status: 'idle' }
    | { status: 'checking' }
    | { status: 'latest' }
    | { status: 'available'; update: UpdateInfo }
    | { status: 'installing'; update: UpdateInfo }
    | { status: 'error'; message: string }
  >({ status: 'idle' })
  const [updateDownload, setUpdateDownload] = useState<UpdateDownloadEventPayload | null>(null)

  const logsTapRef = useRef<{ count: number; lastMs: number }>({ count: 0, lastMs: 0 })
  const windowScaleCommitTokenRef = useRef(0)
  const [clickHeatmapColsDraft, setClickHeatmapColsDraft] = useState('')
  const [clickHeatmapRowsDraft, setClickHeatmapRowsDraft] = useState('')
  const [windowScaleDraft, setWindowScaleDraft] = useState<number | null>(null)

  const canToggleListening = isListening || !inputMonitoring.supported || inputMonitoring.authorized

  const autostartSupported = isMac() || isWindows() || isLinux()

  useSettingsSync()

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const perm = await getSystemNotificationPermission()
      if (!cancelled) setNotificationPermission(perm)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    try {
      document.title = t('windows.settings')
    } catch {
      // ignore
    }
  }, [i18n.resolvedLanguage, t])

  useEffect(() => {
    if (!settings) return
    setClickHeatmapColsDraft(String(settings.click_heatmap_grid_cols ?? 64))
    setClickHeatmapRowsDraft(String(settings.click_heatmap_grid_rows ?? 36))
  }, [settings, settings?.click_heatmap_grid_cols, settings?.click_heatmap_grid_rows])

  const openInputPermissionDialog = useCallback(async () => {
    if (inputPermissionDialogOpen) return
    const appWindow = getCurrentWebviewWindow()
    try {
      inputPermissionDialogPreviousAlwaysOnTopRef.current = await appWindow.isAlwaysOnTop()
    } catch {
      inputPermissionDialogPreviousAlwaysOnTopRef.current = null
    }
    try {
      await appWindow.setAlwaysOnTop(true)
    } catch {
      // ignore
    }
    setInputPermissionDialogOpen(true)
  }, [inputPermissionDialogOpen])

  const closeInputPermissionDialog = useCallback(async (dismissed: boolean) => {
    setInputPermissionDialogOpen(false)
    if (dismissed) {
      try {
        window.sessionStorage.setItem('cz.input_monitoring_prompt_dismissed', '1')
      } catch {
        // ignore
      }
    }
    const appWindow = getCurrentWebviewWindow()
    const previous = inputPermissionDialogPreviousAlwaysOnTopRef.current
    inputPermissionDialogPreviousAlwaysOnTopRef.current = null
    try {
      await appWindow.setAlwaysOnTop(previous ?? false)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (!inputPermissionDialogOpen) return
    if (!inputMonitoring.authorized) return
    void closeInputPermissionDialog(false)
  }, [closeInputPermissionDialog, inputMonitoring.authorized, inputPermissionDialogOpen])

  useEffect(() => {
    fetchSettings()
    fetchStats()
  }, [fetchSettings, fetchStats])

  useEffect(() => {
    if (!settings) return
    if (!inputMonitoring.supported) return
    if (inputMonitoring.loading) return
    if (inputMonitoring.authorized) return
    if (!settings.enable_keyboard && !settings.enable_mouse_single) return
    if (inputPermissionPromptShownRef.current) return

    try {
      if (window.sessionStorage.getItem('cz.input_monitoring_prompt_dismissed') === '1') return
    } catch {
      // ignore
    }

    inputPermissionPromptShownRef.current = true
    setActiveTab('general')
    void openInputPermissionDialog()
  }, [
    inputMonitoring.authorized,
    inputMonitoring.loading,
    inputMonitoring.supported,
    openInputPermissionDialog,
    settings,
  ])

  useEffect(() => {
    let cancelled = false
    void Promise.all([getName(), getVersion()])
      .then(([name, version]) => {
        if (cancelled) return
        setAppInfo({ name, version })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void appDataDir()
      .then((dir) => {
        if (cancelled) return
        setDataDir(dir)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const tabs = useMemo(
    () =>
      [
        { id: 'general' as const, label: t('settings.tabs.general'), icon: IconSettings },
        { id: 'appearance' as const, label: t('settings.tabs.appearance'), icon: IconPalette },
        { id: 'shortcuts' as const, label: t('settings.tabs.shortcuts'), icon: IconKeyboard },
        { id: 'achievements' as const, label: t('settings.tabs.achievements'), icon: IconTrophy },
        { id: 'statistics' as const, label: t('settings.tabs.statistics'), icon: IconChart },
        { id: 'about' as const, label: t('settings.tabs.about'), icon: IconInfo },
      ] satisfies Array<{ id: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }> }>,
    [t]
  )

  useEffect(() => {
    if (!autostartSupported) return
    if (!settings) return

    let cancelled = false
    void (async () => {
      try {
        const enabled = await invoke<boolean>(COMMANDS.AUTOSTART_IS_ENABLED)
        if (cancelled) return
        if (settings.launch_on_startup !== enabled) {
          await updateSettings({ launch_on_startup: enabled })
        }
      } catch (error) {
        if (cancelled) return
        setAutostartError(String(error))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [autostartSupported, settings?.launch_on_startup, updateSettings])

  useEffect(() => {
    if (!updateDialogOpen) return
    const unlisten = listen<UpdateDownloadEventPayload>(EVENTS.APP_UPDATE_DOWNLOAD, (event) => {
      setUpdateDownload(event.payload)
    })
    return () => {
      unlisten.then((fn) => fn()).catch(() => {})
    }
  }, [updateDialogOpen])

  if (!settings) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-white">
        <div className="text-slate-500">{t('common.loading')}</div>
      </div>
    )
  }

  const keyboardLayoutId = normalizeKeyboardLayoutId(settings.keyboard_layout)
  const windowScaleValue = windowScaleDraft ?? settings.window_scale

  const handleToggleAutostart = async (enabled: boolean) => {
    if (!autostartSupported) return
    setAutostartBusy(true)
    setAutostartError(null)
    try {
      if (enabled) {
        await invoke(COMMANDS.AUTOSTART_ENABLE)
      } else {
        await invoke(COMMANDS.AUTOSTART_DISABLE)
      }
      await updateSettings({ launch_on_startup: enabled })
    } catch (error) {
      setAutostartError(String(error))
    } finally {
      setAutostartBusy(false)
    }
  }

  const handleClearHistory = async () => {
    await clearHistory()
    setShowConfirm(null)
  }

  const handleResetAll = async () => {
    await resetAll()
    setShowConfirm(null)
  }

  const handleOpenDataDir = async () => {
    setOpenDataDirError(null)
    try {
      const dir = await appDataDir()
      await openPath(dir)
    } catch (error) {
      setOpenDataDirError(String(error))
    }
  }

  const handleCheckUpdate = async () => {
    setUpdateDialogOpen(true)
    setUpdateDownload(null)
    setUpdateState({ status: 'checking' })
    try {
      const update = await invoke<UpdateInfo | null>(COMMANDS.CHECK_UPDATE)
      if (!update) {
        setUpdateState({ status: 'latest' })
        return
      }
      setUpdateState({ status: 'available', update })
    } catch (error) {
      setUpdateState({ status: 'error', message: String(error) })
    }
  }

  const handleInstallUpdate = async () => {
    if (updateState.status !== 'available') return
    setUpdateState({ status: 'installing', update: updateState.update })
    setUpdateDownload({ type: 'started', downloaded: 0, total: null })
    try {
      await invoke(COMMANDS.DOWNLOAD_AND_INSTALL_UPDATE)
    } catch (error) {
      setUpdateState({ status: 'error', message: String(error) })
    }
  }

  const openNotificationSystemSettings = async () => {
    try {
      await invoke<void>(COMMANDS.OPEN_NOTIFICATION_SETTINGS)
    } catch (e) {
      setAchievementNotifyError(String(e))
    }
  }

  const handleVersionSecretTap = () => {
    const now = Date.now()
    const state = logsTapRef.current
    if (now - state.lastMs > 1500) state.count = 0
    state.lastMs = now
    state.count += 1
    if (state.count >= 5) {
      state.count = 0
      void invoke(COMMANDS.SHOW_LOGS_WINDOW)
    }
  }

  return (
    <div className="w-full h-full bg-slate-50 text-slate-900">
      <div className="flex h-full">
        <aside
          className="w-28 shrink-0 border-r border-slate-200/60 bg-gradient-to-b from-slate-100 via-slate-50 to-white ml-2"
          data-tauri-drag-region
          onPointerDown={startDragging}
        >
          <div className="settings-sidebar-header px-3 pb-6 flex flex-col items-center gap-2">
            <div className="h-16 w-16 rounded-2xl bg-white shadow-md border border-slate-200/60 flex items-center justify-center" data-no-drag>
              <img src="/logo.png" alt={t('app.name')} className="h-10 w-10 opacity-90" />
            </div>
            <div className="text-xs font-semibold text-slate-900" data-no-drag>
              {t('app.name')}
            </div>
          </div>

          <nav className="px-3 pb-4 space-y-3">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={[
                  'w-full aspect-square rounded-2xl p-4 transition-colors border',
                  'flex flex-col items-center justify-center gap-2.5',
                  activeTab === t.id
                    ? 'bg-blue-50 border-blue-100 text-blue-600'
                    : 'bg-transparent border-transparent text-slate-500 hover:bg-slate-50 hover:border-slate-200',
                ].join(' ')}
                data-no-drag
              >
                <t.icon className="h-6 w-6 shrink-0" />
                <div className="text-[11px] font-medium whitespace-nowrap leading-tight">{t.label}</div>
              </button>
            ))}
          </nav>
        </aside>

        <main
          className="flex-1 min-w-0 overflow-y-auto bg-slate-50/50"
          data-tauri-drag-region
          onPointerDown={startDragging}
        >
          <div className="settings-main-content pl-8 pr-16 pb-8">
            <div className="max-w-4xl">
              <div className="mb-6">
                <h1 className="text-xl font-bold text-slate-900">
                  {tabs.find((t) => t.id === activeTab)?.label ?? t('settings.titleFallback')}
                </h1>
                {activeTab === 'shortcuts' && (
                  <div className="text-sm text-slate-500 mt-2">
                    {t('settings.shortcutsHint')}
                  </div>
                )}
              </div>

            {activeTab === 'general' && (
              <div className="space-y-8">
                <SettingsSection
                  title={t('settings.sections.inputListening.title')}
                  description={t('settings.sections.inputListening.description')}
                >
                  {inputMonitoring.supported && (
                    <SettingCard>
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900">{t('settings.inputMonitoring.macPermissionTitle')}</div>
                          <div className="text-sm text-slate-500 mt-1">
                            {inputMonitoring.loading
                              ? t('settings.inputMonitoring.detecting')
                              : inputMonitoring.authorized
                                ? t('settings.inputMonitoring.authorized')
                                : t('settings.inputMonitoring.unauthorized')}
                          </div>
                          {!inputMonitoring.authorized && !inputMonitoring.loading && (
                            <div className="text-xs text-slate-500 mt-1">
                              {t('settings.inputMonitoring.fixHint')}
                            </div>
                          )}
                          {inputMonitoring.lastError && (
                            <div className="text-xs text-red-600 mt-1">{inputMonitoring.lastError}</div>
                          )}
                        </div>

                        <div className="flex items-center gap-2" data-no-drag>
                          {!inputMonitoring.authorized && !inputMonitoring.loading && (
                            <>
                              <Button
                                disabled={inputMonitoring.loading}
                                onClick={async () => {
                                  await openInputPermissionDialog()
                                }}
                                size="sm"
                                data-no-drag
                              >
                                {t('settings.inputMonitoring.goAuthorize')}
                              </Button>
                              <Button
                                disabled={inputMonitoring.loading}
                                onClick={inputMonitoring.openSystemSettings}
                                variant="outline"
                                size="sm"
                                data-no-drag
                              >
                                {t('settings.inputMonitoring.openSystemSettings')}
                              </Button>
                            </>
                          )}
                          {inputMonitoring.authorized && (
                            <Button
                              disabled={inputMonitoring.loading}
                              onClick={inputMonitoring.refresh}
                              variant="outline"
                              size="sm"
                              data-no-drag
                            >
                              {t('settings.inputMonitoring.refresh')}
                            </Button>
                          )}
                        </div>
                      </div>
                    </SettingCard>
                  )}

                  <SettingRow
                    title={t('settings.inputMonitoring.globalListeningStatus')}
                    description={
                      isListening
                        ? t('settings.inputMonitoring.listeningAll')
                        : t('settings.inputMonitoring.stopped')
                    }
                    extra={listeningError?.message}
                    control={
<Button
                        onClick={toggleListening}
                        disabled={!canToggleListening}
                        variant={isListening ? 'destructive' : 'default'}
                        className={isListening ? '' : 'bg-emerald-600 hover:bg-emerald-700'}
                        data-no-drag
                      >
                        {isListening ? t('settings.inputMonitoring.stop') : t('settings.inputMonitoring.start')}
                      </Button>
                    }
                  />

                  <SettingRow
                    title={t('settings.inputMonitoring.keyboardInput')}
                    description={t('settings.inputMonitoring.keyboardInputDesc')}
                    control={
                      <Switch checked={settings.enable_keyboard} onCheckedChange={(v) => updateSettings({ enable_keyboard: v })} data-no-drag />
                    }
                  />

                  <SettingRow
                    title={t('settings.inputMonitoring.mouseClick')}
                    description={t('settings.inputMonitoring.mouseClickDesc')}
                    control={
                      <Switch checked={settings.enable_mouse_single} onCheckedChange={(v) => updateSettings({ enable_mouse_single: v })} data-no-drag />
                    }
                  />
                </SettingsSection>

                <SettingsSection
                  title={t('settings.keyboardPiano.title')}
                  description={t('settings.keyboardPiano.description')}
                >
                  <SettingRow
                    title={t('settings.keyboardPiano.enabled')}
                    control={
                      <Switch
                        checked={settings.keyboard_piano_enabled ?? false}
                        onCheckedChange={(v) => updateSettings({ keyboard_piano_enabled: v })}
                        data-no-drag
                      />
                    }
                  />

                  <SettingRow
                    title={t('settings.keyboardPiano.volume')}
                    description={`${Math.round((settings.keyboard_piano_volume ?? 0.25) * 100)}%`}
                    control={
                      <Slider
                        min={0}
                        max={100}
                        step={1}
                        disabled={!(settings.keyboard_piano_enabled ?? false)}
                        value={[Math.round((settings.keyboard_piano_volume ?? 0.25) * 100)]}
                        onValueChange={([v]) => updateSettings({ keyboard_piano_volume: Math.round(v) / 100 })}
                        className="w-56"
                        data-no-drag
                      />
                    }
                  />

                  <SettingRow
                    title={t('settings.keyboardPiano.scale')}
                    control={
                      <Select
                        value={settings.keyboard_piano_scale ?? 'pentatonic_major'}
                        onValueChange={(v) => updateSettings({ keyboard_piano_scale: v as 'pentatonic_major' | 'major' | 'chromatic' })}
                        disabled={!(settings.keyboard_piano_enabled ?? false)}
                      >
                        <SelectTrigger className="w-56" data-no-drag>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pentatonic_major">{t('settings.keyboardPiano.scales.pentatonic_major')}</SelectItem>
                          <SelectItem value="major">{t('settings.keyboardPiano.scales.major')}</SelectItem>
                          <SelectItem value="chromatic">{t('settings.keyboardPiano.scales.chromatic')}</SelectItem>
                        </SelectContent>
                      </Select>
                    }
                  />

                  <SettingRow
                    title={t('settings.keyboardPiano.wave')}
                    control={
                      <Select
                        value={settings.keyboard_piano_wave ?? 'triangle'}
                        onValueChange={(v) => updateSettings({ keyboard_piano_wave: v as 'sine' | 'triangle' | 'square' | 'sawtooth' })}
                        disabled={!(settings.keyboard_piano_enabled ?? false)}
                      >
                        <SelectTrigger className="w-56" data-no-drag>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="triangle">{t('settings.keyboardPiano.waves.triangle')}</SelectItem>
                          <SelectItem value="sine">{t('settings.keyboardPiano.waves.sine')}</SelectItem>
                          <SelectItem value="square">{t('settings.keyboardPiano.waves.square')}</SelectItem>
                          <SelectItem value="sawtooth">{t('settings.keyboardPiano.waves.sawtooth')}</SelectItem>
                        </SelectContent>
                      </Select>
                    }
                  />
                </SettingsSection>

                <SettingsSection
                  title={t('settings.sections.mouseDistance.title')}
                  description={t('settings.sections.mouseDistance.description')}
                >
                  <MouseDistanceCalibration settings={settings} stats={stats} updateSettings={updateSettings} />
                </SettingsSection>

                <SettingsSection title={t('settings.sections.window.title')}>
                  <SettingRow
                    title={t('settings.window.lockPosition')}
                    description={t('settings.window.lockPositionDesc')}
                    control={
                      <Switch
                        checked={settings.lock_window_position ?? false}
                        onCheckedChange={(v) => updateSettings({ lock_window_position: v })}
                        data-no-drag
                      />
                    }
                  />

                  <SettingRow
                    title={t('settings.window.passThrough')}
                    description={t('settings.window.passThroughDesc')}
                    control={
                      <Switch
                        checked={settings.window_pass_through}
                        onCheckedChange={(v) => updateSettings({ window_pass_through: v })}
                        data-no-drag
                      />
                    }
                  />

                  <SettingRow
                    title={t('settings.window.alwaysOnTop')}
                    description={t('settings.window.alwaysOnTopDesc')}
                    control={
                      <Switch checked={settings.always_on_top} onCheckedChange={(v) => updateSettings({ always_on_top: v })} data-no-drag />
                    }
                  />

                  <SettingRow
                    title={t('settings.window.dockMargin')}
                    description={`${Math.round(settings.dock_margin_px ?? 0)} px`}
                    control={
                      <Slider
                        min={0}
                        max={48}
                        step={1}
                        value={[settings.dock_margin_px ?? 0]}
                        onValueChange={([v]) => updateSettings({ dock_margin_px: Math.round(v) })}
                        className="w-56"
                        data-no-drag
                      />
                    }
                  />

                  <SettingRow
                    title={t('settings.window.scale')}
                    description={`${windowScaleValue}% · ${t('settings.window.scaleDesc')}`}
                    control={
                      <Slider
                        min={50}
                        max={150}
                        step={1}
                        value={[windowScaleValue]}
                        onValueChange={([v]) => setWindowScaleDraft(Math.round(v))}
                        onValueCommit={([v]) => {
                          const next = Math.round(v)
                          const token = (windowScaleCommitTokenRef.current += 1)
                          setWindowScaleDraft(next)
                          void updateSettings({ window_scale: next }).finally(() => {
                            if (windowScaleCommitTokenRef.current === token) {
                              setWindowScaleDraft(null)
                            }
                          })
                        }}
                        className="w-56"
                        data-no-drag
                      />
                    }
                  />

                  <SettingRow
                    title={t('settings.window.opacity')}
                    description={`${Math.round(settings.opacity * 100)}%`}
                    control={
                      <Slider
                        min={0.3}
                        max={1}
                        step={0.05}
                        value={[settings.opacity]}
                        onValueChange={([v]) => updateSettings({ opacity: v })}
                        className="w-56"
                        data-no-drag
                      />
                    }
                  />

                  <SettingRow
                    title={t('settings.window.autoFade')}
                    description={t('settings.window.autoFadeDesc')}
                    control={
                      <Switch
                        checked={settings.auto_fade_enabled ?? false}
                        onCheckedChange={(v) => updateSettings({ auto_fade_enabled: v })}
                        data-no-drag
                      />
                    }
                  />

                  {(settings.auto_fade_enabled ?? false) && (
                    <>
                      <SettingRow
                        title={t('settings.window.autoFadeIdleOpacity')}
                        description={`${Math.round(((settings.auto_fade_idle_opacity ?? 0.35) as number) * 100)}%`}
                        control={
                          <Slider
                            min={0.05}
                            max={1}
                            step={0.05}
                            value={[settings.auto_fade_idle_opacity ?? 0.35]}
                            onValueChange={([v]) => updateSettings({ auto_fade_idle_opacity: v })}
                            className="w-56"
                            data-no-drag
                          />
                        }
                      />
                      <SettingRow
                        title={t('settings.window.autoFadeDelay')}
                        description={`${Math.round(settings.auto_fade_delay_ms ?? 800)} ms`}
                        control={
                          <Slider
                            min={0}
                            max={3000}
                            step={100}
                            value={[settings.auto_fade_delay_ms ?? 800]}
                            onValueChange={([v]) => updateSettings({ auto_fade_delay_ms: Math.round(v) })}
                            className="w-56"
                            data-no-drag
                          />
                        }
                      />
                      <SettingRow
                        title={t('settings.window.autoFadeDuration')}
                        description={`${Math.round(settings.auto_fade_duration_ms ?? 180)} ms`}
                        control={
                          <Slider
                            min={0}
                            max={800}
                            step={20}
                            value={[settings.auto_fade_duration_ms ?? 180]}
                            onValueChange={([v]) => updateSettings({ auto_fade_duration_ms: Math.round(v) })}
                            className="w-56"
                            data-no-drag
                          />
                        }
                      />
                    </>
                  )}

                  <SettingRow
                    title={t('settings.window.dragHold')}
                    description={`${Math.round(settings.drag_hold_ms ?? 0)} ms ${t('settings.window.dragHoldDescSuffix')}`}
                    control={
                      <Slider
                        min={0}
                        max={400}
                        step={20}
                        value={[settings.drag_hold_ms ?? 0]}
                        onValueChange={([v]) => updateSettings({ drag_hold_ms: Math.round(v) })}
                        className="w-56"
                        data-no-drag
                      />
                    }
                  />
                </SettingsSection>

                <SettingsSection
                  title={t('settings.sections.heatmap.title')}
                  description={t('settings.sections.heatmap.description')}
                >
                  <SettingRow
                    title={t('settings.heatmap.keyboardLayout')}
                    description={t('settings.heatmap.keyboardLayoutDesc')}
                    control={
                      <Select value={keyboardLayoutId} onValueChange={(v) => updateSettings({ keyboard_layout: v })}>
                        <SelectTrigger className="w-44" data-no-drag>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {KEYBOARD_LAYOUTS.map((opt) => (
                            <SelectItem key={opt.id} value={opt.id}>
                              {t(opt.nameKey)}
                              {opt.keyCountHint ? ` (${opt.keyCountHint})` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    }
                  />
                  <SettingRow
                    title={t('settings.heatmap.levels')}
                    description={t('settings.heatmap.levelsDesc', {
                      value: settings.heatmap_levels ?? HEAT_LEVEL_COUNT_DEFAULT,
                      min: HEAT_LEVEL_COUNT_MIN,
                      max: HEAT_LEVEL_COUNT_MAX,
                    })}
                    control={
                      <Slider
                        min={HEAT_LEVEL_COUNT_MIN}
                        max={HEAT_LEVEL_COUNT_MAX}
                        step={1}
                        value={[settings.heatmap_levels ?? HEAT_LEVEL_COUNT_DEFAULT]}
                        onValueChange={([v]) => updateSettings({ heatmap_levels: Math.round(v) })}
                        className="w-56"
                        data-no-drag
                      />
                    }
                  />

                  <SettingRow
                    title={t('settings.clickHeatmap.grid')}
                    description={t('settings.clickHeatmap.gridDesc', {
                      cols: settings.click_heatmap_grid_cols ?? 64,
                      rows: settings.click_heatmap_grid_rows ?? 36,
                    })}
                    control={
                      <div className="flex items-center gap-2" data-no-drag>
                        <Input
                          className="w-20 tabular-nums"
                          inputMode="numeric"
                          value={clickHeatmapColsDraft}
                          onChange={(e) => setClickHeatmapColsDraft(e.currentTarget.value)}
                          onBlur={() => {
                            const n = Math.round(Number(clickHeatmapColsDraft))
                            const cols = Number.isFinite(n) ? Math.min(240, Math.max(8, n)) : 64
                            setClickHeatmapColsDraft(String(cols))
                            updateSettings({ click_heatmap_grid_cols: cols })
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter') return
                            e.currentTarget.blur()
                          }}
                          aria-label={t('settings.clickHeatmap.colsAria')}
                        />
                        <span className="text-xs text-slate-500">×</span>
                        <Input
                          className="w-20 tabular-nums"
                          inputMode="numeric"
                          value={clickHeatmapRowsDraft}
                          onChange={(e) => setClickHeatmapRowsDraft(e.currentTarget.value)}
                          onBlur={() => {
                            const n = Math.round(Number(clickHeatmapRowsDraft))
                            const rows = Number.isFinite(n) ? Math.min(180, Math.max(6, n)) : 36
                            setClickHeatmapRowsDraft(String(rows))
                            updateSettings({ click_heatmap_grid_rows: rows })
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter') return
                            e.currentTarget.blur()
                          }}
                          aria-label={t('settings.clickHeatmap.rowsAria')}
                        />
                      </div>
                    }
                  />
                </SettingsSection>

                <SettingsSection title={t('settings.sections.app.title')}>
                  <SettingRow
                    title={t('settings.language.title')}
                    description={t('settings.language.description')}
                    control={
                      <Select
                        value={settings.app_locale ?? 'system'}
                        onValueChange={(v) => updateSettings({ app_locale: v as any })}
                      >
                        <SelectTrigger className="w-44" data-no-drag>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="system">{t('settings.language.system')}</SelectItem>
                          <SelectItem value="en">{t('settings.language.en')}</SelectItem>
                          <SelectItem value="zh-CN">{t('settings.language.zhCN')}</SelectItem>
                          <SelectItem value="zh-TW">{t('settings.language.zhTW')}</SelectItem>
                        </SelectContent>
                      </Select>
                    }
                  />
                  <SettingRow
                    title={t('settings.app.autostart')}
                    description={autostartSupported ? t('settings.app.autostartDescSupported') : t('settings.app.autostartDescUnsupported')}
                    extra={autostartError ?? undefined}
                    control={
                      <Switch
                        checked={settings.launch_on_startup}
                        disabled={!autostartSupported || autostartBusy}
                        onCheckedChange={(v) => void handleToggleAutostart(v)}
                        data-no-drag
                      />
                    }
                  />

                  <SettingRow
                    title={t('settings.app.showTaskbarIcon')}
                    description={t('settings.app.showTaskbarIconDesc')}
                    control={
                      <Switch
                        checked={settings.show_taskbar_icon}
                        onCheckedChange={(v) => updateSettings({ show_taskbar_icon: v })}
                        data-no-drag
                      />
                    }
                  />
                  <SettingRow
                    title={t('settings.app.achievementNotifications')}
                    description={
                      isSystemNotificationSupported()
                        ? notificationPermission === 'denied'
                          ? t('settings.app.achievementNotificationsPermissionDenied')
                          : t('settings.app.achievementNotificationsDesc')
                        : t('settings.app.achievementNotificationsUnsupported')
                    }
                    extra={achievementNotifyError ?? undefined}
                    control={
                      <div className="flex items-center gap-2" data-no-drag>
                        {notificationPermission === 'denied' && (isMac() || isWindows()) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void openNotificationSystemSettings()}
                            data-no-drag
                          >
                            {t('common.openSystemSettings')}
                          </Button>
                        )}
                        <Switch
                          checked={settings.achievement_notifications_enabled ?? false}
                          disabled={!isSystemNotificationSupported() || achievementNotifyBusy}
                          onCheckedChange={(enabled) => {
                            void (async () => {
                              setAchievementNotifyError(null)
                              if (!enabled) {
                                await updateSettings({ achievement_notifications_enabled: false })
                                return
                              }
                              if (!isSystemNotificationSupported()) {
                                setAchievementNotifyError(t('settings.app.achievementNotificationsUnsupported'))
                                return
                              }
                              setAchievementNotifyBusy(true)
                              try {
                                const perm = await requestSystemNotificationPermission()
                                setNotificationPermission(perm)
                                if (perm !== 'granted') {
                                  setAchievementNotifyError(t('settings.app.achievementNotificationsPermissionDenied'))
                                  setAchievementNotifyDialogOpen(true)
                                  await updateSettings({ achievement_notifications_enabled: false })
                                  return
                                }
                                await updateSettings({ achievement_notifications_enabled: true })
                              } finally {
                                setAchievementNotifyBusy(false)
                              }
                            })()
                          }}
                          data-no-drag
                        />
                      </div>
                    }
                  />
                </SettingsSection>

                <SettingsSection title={t('settings.sections.animation.title')}>
                  <SettingRow
                    title={t('settings.animation.speed')}
                    description={`${settings.animation_speed}x`}
                    control={
                      <Slider
                        min={0.5}
                        max={2}
                        step={0.1}
                        value={[settings.animation_speed]}
                        onValueChange={([v]) => updateSettings({ animation_speed: v })}
                        className="w-56"
                        data-no-drag
                      />
                    }
                  />
                </SettingsSection>

              </div>
            )}

            {activeTab === 'appearance' && (
              <AppearanceTab settings={settings} updateSettings={updateSettings} />
            )}

            {activeTab === 'shortcuts' && (
              <div className="space-y-5">
                <ShortcutRecorder
                  title={t('settings.shortcuts.toggleMain')}
                  description={t('settings.shortcuts.toggleMainDesc')}
                  value={settings.shortcut_toggle_main}
                  onChange={(next) => updateSettings({ shortcut_toggle_main: next ? next : null })}
                />
                <ShortcutRecorder
                  title={t('settings.shortcuts.toggleSettings')}
                  description={t('settings.shortcuts.toggleSettingsDesc')}
                  value={settings.shortcut_toggle_settings}
                  onChange={(next) => updateSettings({ shortcut_toggle_settings: next ? next : null })}
                />
                <ShortcutRecorder
                  title={t('settings.shortcuts.openCustomStatistics')}
                  description={t('settings.shortcuts.openCustomStatisticsDesc')}
                  value={settings.shortcut_open_custom_statistics}
                  onChange={(next) => updateSettings({ shortcut_open_custom_statistics: next ? next : null })}
                />
                <ShortcutRecorder
                  title={t('settings.shortcuts.closeCustomStatistics')}
                  description={t('settings.shortcuts.closeCustomStatisticsDesc')}
                  value={settings.shortcut_close_custom_statistics}
                  onChange={(next) => updateSettings({ shortcut_close_custom_statistics: next ? next : null })}
                />
                <ShortcutRecorder
                  title={t('settings.shortcuts.toggleListening')}
                  description={t('settings.shortcuts.toggleListeningDesc')}
                  value={settings.shortcut_toggle_listening}
                  onChange={(next) => updateSettings({ shortcut_toggle_listening: next ? next : null })}
                />
                <ShortcutRecorder
                  title={t('settings.shortcuts.toggleWindowPassThrough')}
                  description={t('settings.shortcuts.toggleWindowPassThroughDesc')}
                  value={settings.shortcut_toggle_window_pass_through}
                  onChange={(next) => updateSettings({ shortcut_toggle_window_pass_through: next ? next : null })}
                />
                <ShortcutRecorder
                  title={t('settings.shortcuts.toggleAlwaysOnTop')}
                  description={t('settings.shortcuts.toggleAlwaysOnTopDesc')}
                  value={settings.shortcut_toggle_always_on_top}
                  onChange={(next) => updateSettings({ shortcut_toggle_always_on_top: next ? next : null })}
                />

                <div className="text-xs text-slate-500 mt-2">
                  {t('settings.shortcuts.hint')}
                </div>
              </div>
            )}

            {activeTab === 'achievements' && (
              <AchievementsTab stats={stats} />
            )}

            {activeTab === 'statistics' && (
              <div className="space-y-8">
                <SettingsSection title={t('settings.sections.todayOverview.title')}>
                  <TodayOverviewPanel stats={stats} />
                </SettingsSection>

                <SettingsSection title={t('settings.sections.history.title')}>
                  <Statistics />
                </SettingsSection>

                <SettingsSection
                  title={t('settings.sections.customStatistics.title')}
                  description={t('settings.sections.customStatistics.description')}
                >
                  <SettingCard>
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900">{t('settings.customStatistics.windowTitle')}</div>
                        <div className="text-sm text-slate-500 mt-1">{t('settings.customStatistics.windowDesc')}</div>
                      </div>
                      <div className="flex items-center gap-2" data-no-drag>
                        <Button onClick={() => void invoke(COMMANDS.SHOW_CUSTOM_STATISTICS_WINDOW)} data-no-drag>
                          {t('settings.customStatistics.open')}
                        </Button>
                      </div>
                    </div>
                  </SettingCard>
                </SettingsSection>
              </div>
            )}

            {activeTab === 'about' && (
              <div className="space-y-8">
                <SettingsSection title={t('settings.sections.aboutApp.title')}>
                  <SettingCard>
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900">{t('settings.about.appName')}</div>
                        <div className="text-sm text-slate-500 mt-1 cursor-default select-none" onClick={handleVersionSecretTap} data-no-drag>
                          {appInfo ? `${appInfo.name} v${appInfo.version}` : t('settings.about.loadingVersion')}
                        </div>
                      </div>
                      <div className="flex items-center gap-2" data-no-drag>
                        <Button
                          onClick={handleCheckUpdate}
                          data-no-drag
                        >
                          {t('settings.about.checkUpdate')}
                        </Button>
                      </div>
                    </div>
                  </SettingCard>

                  <SettingCard>
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900">{t('settings.about.autoUpdate.title')}</div>
                        <div className="text-sm text-slate-500 mt-1">{t('settings.about.autoUpdate.description')}</div>
                      </div>
                      <div data-no-drag>
                        <Switch
                          checked={settings.auto_update_enabled ?? false}
                          onCheckedChange={(v) => updateSettings({ auto_update_enabled: v })}
                          data-no-drag
                        />
                      </div>
                    </div>
                  </SettingCard>
                </SettingsSection>

                <SettingsSection title={t('settings.sections.openSource.title')}>
                  <SettingRow
                    title={t('settings.sections.openSource.title')}
                    description={
                      <a
                        href={OPEN_SOURCE_URL}
                        className="underline underline-offset-2 hover:text-slate-700"
                        onClick={(e) => {
                          e.preventDefault()
                          void openUrl(OPEN_SOURCE_URL)
                        }}
                      >
                        {OPEN_SOURCE_URL}
                      </a>
                    }
                    control={
                      <Button
                        onClick={() => void openUrl(`${OPEN_SOURCE_URL}/issues`)}
                        variant="outline"
                        className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                        data-no-drag
                      >
                        {t('settings.about.issueFeedback')}
                      </Button>
                    }
                  />
                </SettingsSection>

                <SettingsSection title={t('settings.sections.dataDir.title')}>
                  <SettingRow
                    title={t('settings.sections.dataDir.title')}
                    description={dataDir || t('settings.about.dataDirLoading')}
                    control={
<Button
                        onClick={handleOpenDataDir}
                        variant="outline"
                        data-no-drag
                      >
                        {t('common.open')}
                      </Button>
                    }
                  />
                  {openDataDirError && (
                    <div className="text-xs text-red-600 mt-2 break-words">{openDataDirError}</div>
                  )}
                </SettingsSection>

                <SettingsSection title={t('settings.sections.dataManage.title')}>
                  <SettingRow
                    title={t('settings.about.clearHistory')}
                    description={t('settings.about.clearHistoryDesc')}
                    control={
<Button
                        onClick={() => setShowConfirm('clear')}
                        variant="outline"
                        data-no-drag
                      >
                        {t('settings.about.clear')}
                      </Button>
                    }
                  />

                  <SettingRow
                    title={t('settings.about.resetAll')}
                    description={t('settings.about.resetAllDesc')}
                    control={
<Button
                        onClick={() => setShowConfirm('reset')}
                        variant="destructive"
                        className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200"
                        data-no-drag
                      >
                        {t('settings.about.reset')}
                      </Button>
                    }
                  />
                </SettingsSection>
              </div>
            )}
            </div>
          </div>
        </main>
      </div>

      <Dialog
        open={inputPermissionDialogOpen}
        onOpenChange={(open) => {
          if (inputPermissionDialogBusy) return
          if (open) {
            setInputPermissionDialogOpen(true)
            return
          }
          void closeInputPermissionDialog(true)
        }}
      >
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{t('settings.inputMonitoring.permissionDialogTitle')}</DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-2">
                  <div>{t('settings.inputMonitoring.permissionDialogBody')}</div>
                  <div className="text-xs text-slate-500">
                    {t('settings.inputMonitoring.fixHint')}
                  </div>
                  {inputMonitoring.lastError && (
                    <div className="text-xs text-red-600">{inputMonitoring.lastError}</div>
                  )}
                </div>
              </DialogDescription>
            </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              disabled={inputPermissionDialogBusy}
              onClick={() => void closeInputPermissionDialog(true)}
              className="flex-1"
            >
              {t('common.later')}
            </Button>
            <Button
              disabled={inputPermissionDialogBusy}
              className="flex-1"
              onClick={async () => {
                setInputPermissionDialogBusy(true)
                try {
                  await inputMonitoring.request()
                  await closeInputPermissionDialog(false)
                } finally {
                  setInputPermissionDialogBusy(false)
                }
              }}
            >
              {t('settings.inputMonitoring.openSystemSettings')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={achievementNotifyDialogOpen}
        onOpenChange={(open) => setAchievementNotifyDialogOpen(open)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('settings.app.achievementNotificationsDialogTitle')}</DialogTitle>
            <DialogDescription>
              {t('settings.app.achievementNotificationsDialogBody')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              onClick={() => setAchievementNotifyDialogOpen(false)}
              variant="outline"
              className="flex-1"
              disabled={achievementNotifyBusy}
            >
              {t('common.close')}
            </Button>
            {(isMac() || isWindows()) && (
              <Button
                onClick={() => void openNotificationSystemSettings()}
                className="flex-1"
                disabled={achievementNotifyBusy}
              >
                {t('common.openSystemSettings')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

<Dialog open={showConfirm !== null} onOpenChange={(open) => !open && setShowConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {showConfirm === 'clear'
                ? t('settings.about.confirmClearTitle')
                : t('settings.about.confirmResetTitle')}
            </DialogTitle>
            <DialogDescription>
              {showConfirm === 'clear'
                ? t('settings.about.confirmClearBody')
                : t('settings.about.confirmResetBody')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              onClick={() => setShowConfirm(null)}
              variant="outline"
              className="flex-1"
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={showConfirm === 'clear' ? handleClearHistory : handleResetAll}
              variant="destructive"
              className="flex-1"
            >
              {t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={updateDialogOpen}
        onOpenChange={(open) => {
          setUpdateDialogOpen(open)
          if (!open) {
            setUpdateState({ status: 'idle' })
            setUpdateDownload(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {updateState.status === 'checking' && t('settings.about.update.checking')}
              {updateState.status === 'latest' && t('settings.about.update.latest')}
              {updateState.status === 'available' && t('settings.about.update.available')}
              {updateState.status === 'installing' && t('settings.about.update.installing')}
              {updateState.status === 'error' && t('settings.about.update.error')}
              {updateState.status === 'idle' && t('settings.about.update.idle')}
            </DialogTitle>
            <DialogDescription asChild>
              <div>
                {updateState.status === 'available' && (
                  <div className="space-y-2">
                    <div>
                      {t('settings.about.update.version', { version: updateState.update.version })}
                    </div>
                    {updateState.update.body && (
                      <div className="whitespace-pre-wrap break-words text-slate-600">
                        {updateState.update.body}
                      </div>
                    )}
                  </div>
                )}
                {updateState.status === 'latest' && t('settings.about.update.latestBody')}
                {updateState.status === 'checking' && t('settings.about.update.checkingBody')}
                {updateState.status === 'installing' && (
                  <div className="space-y-3">
                    <div>{t('settings.about.update.installingBody')}</div>
                    <div className="space-y-2">
                      {updateDownload?.total ? (
                        <>
                          <div className="h-2 w-full rounded bg-slate-200 overflow-hidden">
                            <div
                              className="h-full bg-blue-500"
                              style={{
                                width: `${Math.min(
                                  100,
                                  Math.round((updateDownload.downloaded / updateDownload.total) * 100)
                                )}%`,
                              }}
                            />
                          </div>
                          <div className="text-xs text-slate-500">
                            {t('settings.about.update.progress', {
                              percent: Math.min(100, Math.round((updateDownload.downloaded / updateDownload.total) * 100)),
                              downloaded: formatBytes(updateDownload.downloaded),
                              total: formatBytes(updateDownload.total),
                            })}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="h-2 w-full rounded bg-slate-200 overflow-hidden">
                            <div className="h-full w-1/3 bg-blue-500 animate-pulse" />
                          </div>
                          {updateDownload?.downloaded ? (
                            <div className="text-xs text-slate-500">
                              {t('settings.about.update.progressUnknownTotal', {
                                downloaded: formatBytes(updateDownload.downloaded),
                              })}
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                )}
                {updateState.status === 'error' && updateState.message}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              onClick={() => setUpdateDialogOpen(false)}
              variant="outline"
              className="flex-1"
              disabled={updateState.status === 'checking' || updateState.status === 'installing'}
            >
              {updateState.status === 'available' ? t('common.later') : t('common.close')}
            </Button>
            {updateState.status === 'available' && (
              <Button
                onClick={handleInstallUpdate}
                className="flex-1"
              >
                {t('settings.about.update.updateNow')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
