import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getName, getVersion } from '@tauri-apps/api/app'
import { invoke } from '@tauri-apps/api/core'
import { appDataDir } from '@tauri-apps/api/path'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { openPath, openUrl } from '@tauri-apps/plugin-opener'

import { useInputListener } from '../../hooks/useInputListener'
import { useInputMonitoringPermission } from '../../hooks/useInputMonitoringPermission'
import { useSettingsSync } from '../../hooks/useSettingsSync'
import { useMeritStore } from '../../stores/useMeritStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { COMMANDS } from '../../types/events'
import { Statistics } from '../Statistics'
import { useWindowDragging } from '../../hooks/useWindowDragging'
import { ShortcutRecorder } from './ShortcutRecorder'
import { IconChart, IconInfo, IconKeyboard, IconSettings } from './icons'
import { Switch } from '../ui/switch'
import { Slider } from '../ui/slider'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { Input } from '../ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { isLinux, isMac, isWindows } from '../../utils/platform'
import { SkinManager } from './SkinManager'
import { HEAT_LEVEL_COUNT_DEFAULT, HEAT_LEVEL_COUNT_MAX, HEAT_LEVEL_COUNT_MIN } from '../Statistics/heatScale'
import { KEYBOARD_LAYOUTS, normalizeKeyboardLayoutId } from '@/lib/keyboard'

type SettingsTab = 'general' | 'shortcuts' | 'statistics' | 'about'

type UpdateInfo = { version: string; body?: string | null; date?: string | null }

const OPEN_SOURCE_URL = 'https://github.com/Litt1eQ/cyber-zen'
const MERIT_LABEL_MAX_CHARS = 4
const DEFAULT_MERIT_LABEL = '功德'

export function Settings() {
  const { settings, updateSettings, fetchSettings } = useSettingsStore()
  const { clearHistory, resetAll, stats, fetchStats } = useMeritStore()
  const { isListening, toggleListening, error: listeningError } = useInputListener()
  const inputMonitoring = useInputMonitoringPermission()
  const startDragging = useWindowDragging()
  const [showConfirm, setShowConfirm] = useState<'clear' | 'reset' | null>(null)
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [appInfo, setAppInfo] = useState<{ name: string; version: string } | null>(null)
  const [dataDir, setDataDir] = useState<string>('')
  const [openDataDirError, setOpenDataDirError] = useState<string | null>(null)
  const [autostartBusy, setAutostartBusy] = useState(false)
  const [autostartError, setAutostartError] = useState<string | null>(null)
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

  const meritLabelFocusedRef = useRef(false)
  const [meritLabelDraft, setMeritLabelDraft] = useState('')

  const canToggleListening = isListening || !inputMonitoring.supported || inputMonitoring.authorized

  const autostartSupported = isMac() || isWindows() || isLinux()

  useSettingsSync()

  useEffect(() => {
    if (!settings) return
    if (meritLabelFocusedRef.current) return
    setMeritLabelDraft(settings.merit_pop_label ?? DEFAULT_MERIT_LABEL)
  }, [settings, settings?.merit_pop_label])

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
        { id: 'general' as const, label: '基本设置', icon: IconSettings },
        { id: 'shortcuts' as const, label: '快捷键', icon: IconKeyboard },
        { id: 'statistics' as const, label: '统计分析', icon: IconChart },
        { id: 'about' as const, label: '关于', icon: IconInfo },
      ] satisfies Array<{ id: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }> }>,
    []
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

  if (!settings) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-white">
        <div className="text-slate-500">加载中...</div>
      </div>
    )
  }

  const keyboardLayoutId = normalizeKeyboardLayoutId(settings.keyboard_layout)

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
    try {
      await invoke(COMMANDS.DOWNLOAD_AND_INSTALL_UPDATE)
    } catch (error) {
      setUpdateState({ status: 'error', message: String(error) })
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
              <img src="/logo.png" alt="赛博木鱼" className="h-10 w-10 opacity-90" />
            </div>
            <div className="text-xs font-semibold text-slate-900" data-no-drag>
              赛博木鱼
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
                  {tabs.find((t) => t.id === activeTab)?.label ?? '设置'}
                </h1>
                {activeTab === 'shortcuts' && (
                  <div className="text-sm text-slate-500 mt-2">
                    支持录制后全局生效（可留空表示关闭）
                  </div>
                )}
              </div>

            {activeTab === 'general' && (
              <div className="space-y-8">
                <SettingsSection title="输入监听" description="全局键盘/鼠标事件监听设置">
                  {inputMonitoring.supported && (
                    <SettingCard>
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900">macOS 输入监控权限</div>
                          <div className="text-sm text-slate-500 mt-1">
                            {inputMonitoring.loading
                              ? '检测中...'
                              : inputMonitoring.authorized
                                ? '已授权'
                                : '未授权（无法接收全局键盘/鼠标事件）'}
                          </div>
                          {!inputMonitoring.authorized && !inputMonitoring.loading && (
                            <div className="text-xs text-slate-500 mt-1">
                              如已授权仍无效：请在“输入监控”中移除本应用后重新添加，并重启应用。
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
                                去授权
                              </Button>
                              <Button
                                disabled={inputMonitoring.loading}
                                onClick={inputMonitoring.openSystemSettings}
                                variant="outline"
                                size="sm"
                                data-no-drag
                              >
                                打开系统设置
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
                              刷新
                            </Button>
                          )}
                        </div>
                      </div>
                    </SettingCard>
                  )}

                  <SettingRow
                    title="全局监听状态"
                    description={isListening ? '正在监听所有输入' : '已停止监听'}
                    extra={listeningError?.message}
                    control={
<Button
                        onClick={toggleListening}
                        disabled={!canToggleListening}
                        variant={isListening ? 'destructive' : 'default'}
                        className={isListening ? '' : 'bg-emerald-600 hover:bg-emerald-700'}
                        data-no-drag
                      >
                        {isListening ? '停止' : '启动'}
                      </Button>
                    }
                  />

                  <SettingRow
                    title="键盘输入"
                    description="监听键盘按键"
                    control={
                      <Switch checked={settings.enable_keyboard} onCheckedChange={(v) => updateSettings({ enable_keyboard: v })} data-no-drag />
                    }
                  />

                  <SettingRow
                    title="鼠标单击"
                    description="监听鼠标单击事件"
                    control={
                      <Switch checked={settings.enable_mouse_single} onCheckedChange={(v) => updateSettings({ enable_mouse_single: v })} data-no-drag />
                    }
                  />
                </SettingsSection>

                <SettingsSection title="窗口设置">
                  <SettingRow
                    title="锁定木鱼位置"
                    description="启用后，禁止拖动主窗口（防误触）"
                    control={
                      <Switch
                        checked={settings.lock_window_position ?? false}
                        onCheckedChange={(v) => updateSettings({ lock_window_position: v })}
                        data-no-drag
                      />
                    }
                  />

                  <SettingRow
                    title="窗口穿透"
                    description="启用后，窗口不影响对其他应用程序的操作"
                    control={
                      <Switch
                        checked={settings.window_pass_through}
                        onCheckedChange={(v) => updateSettings({ window_pass_through: v })}
                        data-no-drag
                      />
                    }
                  />

                  <SettingRow
                    title="总在最前"
                    description="窗口始终显示在最前面"
                    control={
                      <Switch checked={settings.always_on_top} onCheckedChange={(v) => updateSettings({ always_on_top: v })} data-no-drag />
                    }
                  />

                  <SettingRow
                    title="停靠边距"
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
                    title="窗口大小"
                    description="仅支持固定档位缩放"
                    control={
                      <Select value={String(settings.window_scale)} onValueChange={(v) => updateSettings({ window_scale: Number(v) })}>
                        <SelectTrigger className="w-28" data-no-drag>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="50">50%</SelectItem>
                          <SelectItem value="75">75%</SelectItem>
                          <SelectItem value="100">100%</SelectItem>
                          <SelectItem value="125">125%</SelectItem>
                          <SelectItem value="150">150%</SelectItem>
                        </SelectContent>
                      </Select>
                    }
                  />

                  <SettingRow
                    title="窗口透明度"
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
                    title="自动淡出"
                    description="鼠标离开后自动降低透明度，靠近时恢复"
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
                        title="淡出透明度"
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
                        title="淡出延迟"
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
                        title="淡出动画"
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
                    title="防误拖（按住再拖）"
                    description={`${Math.round(settings.drag_hold_ms ?? 0)} ms（0 表示关闭）`}
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

                <SettingsSection title="热力图" description="统计页热力图显示偏好">
                  <SettingRow
                    title="键盘配列"
                    description="影响统计页键盘热力图的键位显示"
                    control={
                      <Select value={keyboardLayoutId} onValueChange={(v) => updateSettings({ keyboard_layout: v })}>
                        <SelectTrigger className="w-44" data-no-drag>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {KEYBOARD_LAYOUTS.map((opt) => (
                            <SelectItem key={opt.id} value={opt.id}>
                              {opt.name}
                              {opt.keyCountHint ? ` (${opt.keyCountHint})` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    }
                  />
                  <SettingRow
                    title="颜色分级档位"
                    description={`${settings.heatmap_levels ?? HEAT_LEVEL_COUNT_DEFAULT} 档（${HEAT_LEVEL_COUNT_MIN}-${HEAT_LEVEL_COUNT_MAX}）`}
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
                </SettingsSection>

                <SettingsSection title="外观设置">
                  <SkinManager
                    selectedId={settings.wooden_fish_skin ?? 'rosewood'}
                    onSelect={(id) => updateSettings({ wooden_fish_skin: id })}
                  />

                  <SettingRow
                    title="木鱼透明度"
                    description={`${Math.round(((settings.wooden_fish_opacity ?? 1) as number) * 100)}%（仅影响木鱼与木槌）`}
                    control={
                      <Slider
                        min={0}
                        max={1}
                        step={0.05}
                        value={[settings.wooden_fish_opacity ?? 1]}
                        onValueChange={([v]) => updateSettings({ wooden_fish_opacity: v })}
                        className="w-56"
                        data-no-drag
                      />
                    }
                  />

                  <SettingRow
                    title="功德浮字透明度"
                    description={`${Math.round(((settings.merit_pop_opacity ?? 0.82) as number) * 100)}%`}
                    control={
                      <Slider
                        min={0}
                        max={1}
                        step={0.05}
                        value={[settings.merit_pop_opacity ?? 0.82]}
                        onValueChange={([v]) => updateSettings({ merit_pop_opacity: v })}
                        className="w-56"
                        data-no-drag
                      />
                    }
                  />

                  <SettingRow
                    title="功德浮字文案"
                    description={`示例：${(settings.merit_pop_label ?? DEFAULT_MERIT_LABEL).slice(0, MERIT_LABEL_MAX_CHARS)}+1（文案最多 ${MERIT_LABEL_MAX_CHARS} 字）`}
                    control={
                      <div className="flex items-center gap-2">
                        <Input
                          className="w-28"
                          value={meritLabelDraft}
                          placeholder={DEFAULT_MERIT_LABEL}
                          maxLength={MERIT_LABEL_MAX_CHARS}
                          onFocus={() => {
                            meritLabelFocusedRef.current = true
                          }}
                          onBlur={() => {
                            meritLabelFocusedRef.current = false
                            const trimmed = meritLabelDraft.trim()
                            const normalized =
                              Array.from(trimmed).slice(0, MERIT_LABEL_MAX_CHARS).join('') || DEFAULT_MERIT_LABEL
                            setMeritLabelDraft(normalized)
                            updateSettings({ merit_pop_label: normalized })
                          }}
                          onChange={(e) => {
                            setMeritLabelDraft(e.currentTarget.value)
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter') return
                            e.currentTarget.blur()
                          }}
                          data-no-drag
                        />
                      </div>
                    }
                  />
                </SettingsSection>

                <SettingsSection title="应用设置">
                  <SettingRow
                    title="开机自启动"
                    description={autostartSupported ? '开机后自动启动应用' : '仅支持 macOS / Windows / Linux'}
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
                    title="显示任务栏图标"
                    description="启用后，可在窗口列表中显示"
                    control={
                      <Switch
                        checked={settings.show_taskbar_icon}
                        onCheckedChange={(v) => updateSettings({ show_taskbar_icon: v })}
                        data-no-drag
                      />
                    }
                  />
                </SettingsSection>

                <SettingsSection title="动画设置">
                  <SettingRow
                    title="动画速度"
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

            {activeTab === 'shortcuts' && (
              <div className="space-y-5">
                <ShortcutRecorder
                  title="切换木鱼显示"
                  description="显示/隐藏主窗口"
                  value={settings.shortcut_toggle_main}
                  onChange={(next) => updateSettings({ shortcut_toggle_main: next ? next : null })}
                />
                <ShortcutRecorder
                  title="切换设置窗口"
                  description="显示/隐藏本设置窗口"
                  value={settings.shortcut_toggle_settings}
                  onChange={(next) => updateSettings({ shortcut_toggle_settings: next ? next : null })}
                />
                <ShortcutRecorder
                  title="打开自定义统计"
                  description="快速打开自定义统计窗口"
                  value={settings.shortcut_open_custom_statistics}
                  onChange={(next) => updateSettings({ shortcut_open_custom_statistics: next ? next : null })}
                />
                <ShortcutRecorder
                  title="切换输入监听"
                  description="启动/停止全局输入监听"
                  value={settings.shortcut_toggle_listening}
                  onChange={(next) => updateSettings({ shortcut_toggle_listening: next ? next : null })}
                />
                <ShortcutRecorder
                  title="窗口穿透"
                  description="切换窗口是否穿透鼠标"
                  value={settings.shortcut_toggle_window_pass_through}
                  onChange={(next) => updateSettings({ shortcut_toggle_window_pass_through: next ? next : null })}
                />
                <ShortcutRecorder
                  title="窗口置顶"
                  description="切换窗口是否总在最前"
                  value={settings.shortcut_toggle_always_on_top}
                  onChange={(next) => updateSettings({ shortcut_toggle_always_on_top: next ? next : null })}
                />

                <div className="text-xs text-slate-500 mt-2">
                  说明：建议使用“修饰键 + 字母/数字”或 F1-F12；如与系统/其他应用冲突，可能注册失败或不生效。
                </div>
              </div>
            )}

            {activeTab === 'statistics' && (
              <div className="space-y-8">
                <SettingsSection title="今日概览">
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-4">
                      <StatTile
                        title="今日总计"
                        value={(stats?.today.total ?? 0).toLocaleString()}
                        subtitle={stats?.today.date ? stats.today.date : ''}
                      />
                      <StatTile
                        title="总功德"
                        value={(stats?.total_merit ?? 0).toLocaleString()}
                        subtitle="累计"
                      />
                    </div>

                    <div className="rounded-lg border border-slate-200/60 bg-white shadow-sm p-4">
                      <div className="text-sm text-slate-500">来源分布</div>
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div className="rounded-lg bg-slate-50 border border-slate-200/60 p-3">
                          <div className="text-xs text-slate-500">键盘</div>
                          <div className="text-2xl font-bold text-slate-900 mt-1">
                            {(stats?.today.keyboard ?? 0).toLocaleString()}
                          </div>
                        </div>
                        <div className="rounded-lg bg-slate-50 border border-slate-200/60 p-3">
                          <div className="text-xs text-slate-500">单击</div>
                          <div className="text-2xl font-bold text-slate-900 mt-1">
                            {(stats?.today.mouse_single ?? 0).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </SettingsSection>

                <SettingsSection title="历史统计">
                  <Statistics />
                </SettingsSection>

                <SettingsSection title="自定义统计展示" description="可单独打开一个窗口，自由选择要展示的统计模块">
                  <SettingCard>
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900">自定义统计窗口</div>
                        <div className="text-sm text-slate-500 mt-1">支持在窗口内勾选/排序统计模块，并从托盘/右键菜单/快捷键快速打开。</div>
                      </div>
                      <div className="flex items-center gap-2" data-no-drag>
                        <Button onClick={() => void invoke(COMMANDS.SHOW_CUSTOM_STATISTICS_WINDOW)} data-no-drag>
                          打开
                        </Button>
                      </div>
                    </div>
                  </SettingCard>
                </SettingsSection>
              </div>
            )}

            {activeTab === 'about' && (
              <div className="space-y-8">
                <SettingsSection title="关于应用">
                  <SettingCard>
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900">赛博木鱼</div>
                        <div className="text-sm text-slate-500 mt-1">
                          {appInfo ? `${appInfo.name} v${appInfo.version}` : '加载版本信息...'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2" data-no-drag>
                        <Button
                          onClick={handleCheckUpdate}
                          data-no-drag
                        >
                          检查更新
                        </Button>
                      </div>
                    </div>
                  </SettingCard>
                </SettingsSection>

                <SettingsSection title="开源地址">
                  <SettingRow
                    title="开源地址"
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
                        反馈问题
                      </Button>
                    }
                  />
                </SettingsSection>

                <SettingsSection title="数据目录">
                  <SettingRow
                    title="数据目录"
                    description={dataDir || '加载中...'}
                    control={
<Button
                        onClick={handleOpenDataDir}
                        variant="outline"
                        data-no-drag
                      >
                        打开
                      </Button>
                    }
                  />
                  {openDataDirError && (
                    <div className="text-xs text-red-600 mt-2 break-words">{openDataDirError}</div>
                  )}
                </SettingsSection>

                <SettingsSection title="数据管理">
                  <SettingRow
                    title="清空历史记录"
                    description="保留今日功德数据"
                    control={
<Button
                        onClick={() => setShowConfirm('clear')}
                        variant="outline"
                        data-no-drag
                      >
                        清空
                      </Button>
                    }
                  />

                  <SettingRow
                    title="重置所有数据"
                    description="清空所有功德数据（不可恢复）"
                    control={
<Button
                        onClick={() => setShowConfirm('reset')}
                        variant="destructive"
                        className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200"
                        data-no-drag
                      >
                        重置
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
              <DialogTitle>需要输入监控权限</DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-2">
                  <div>开启 macOS「输入监控」权限后才能接收全局键盘/鼠标事件。</div>
                  <div className="text-xs text-slate-500">
                    如已开启仍无效：请在“输入监控”中移除本应用后重新添加，并重启应用。
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
              稍后
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
              打开系统设置
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

<Dialog open={showConfirm !== null} onOpenChange={(open) => !open && setShowConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {showConfirm === 'clear' ? '确认清空历史记录？' : '确认重置所有数据？'}
            </DialogTitle>
            <DialogDescription>
              {showConfirm === 'clear'
                ? '这将清空所有历史记录，但保留今日功德数据。'
                : '这将清空所有功德数据，此操作不可恢复！'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              onClick={() => setShowConfirm(null)}
              variant="outline"
              className="flex-1"
            >
              取消
            </Button>
            <Button
              onClick={showConfirm === 'clear' ? handleClearHistory : handleResetAll}
              variant="destructive"
              className="flex-1"
            >
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={updateDialogOpen}
        onOpenChange={(open) => {
          setUpdateDialogOpen(open)
          if (!open) setUpdateState({ status: 'idle' })
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {updateState.status === 'checking' && '正在检查更新...'}
              {updateState.status === 'latest' && '已是最新版本'}
              {updateState.status === 'available' && '发现新版本'}
              {updateState.status === 'installing' && '正在更新...'}
              {updateState.status === 'error' && '更新失败'}
              {updateState.status === 'idle' && '检查更新'}
            </DialogTitle>
            <DialogDescription asChild>
              <div>
                {updateState.status === 'available' && (
                  <div className="space-y-2">
                    <div>
                      版本：<span className="font-medium text-slate-900">{updateState.update.version}</span>
                    </div>
                    {updateState.update.body && (
                      <div className="whitespace-pre-wrap break-words text-slate-600">
                        {updateState.update.body}
                      </div>
                    )}
                  </div>
                )}
                {updateState.status === 'latest' && '当前已是最新版本。'}
                {updateState.status === 'checking' && '请稍候...'}
                {updateState.status === 'installing' && '下载并安装完成后会自动重启应用。'}
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
              {updateState.status === 'available' ? '稍后' : '关闭'}
            </Button>
            {updateState.status === 'available' && (
              <Button
                onClick={handleInstallUpdate}
                className="flex-1"
              >
                立即更新
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SettingCard({ children }: { children: React.ReactNode }) {
  return (
    <Card className="p-4">{children}</Card>
  )
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-5">
      <div>
        <div className="text-sm font-semibold text-slate-900 uppercase tracking-wide">{title}</div>
        {description && <div className="text-sm text-slate-500 mt-1.5">{description}</div>}
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  )
}

function SettingRow({
  title,
  description,
  extra,
  control,
}: {
  title: string
  description?: React.ReactNode
  extra?: string
  control: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-slate-200/60 bg-white shadow-sm p-4 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="font-medium text-slate-900">{title}</div>
        {description && <div className="text-sm text-slate-500 mt-1">{description}</div>}
        {extra && <div className="text-xs text-red-600 mt-1">{extra}</div>}
      </div>
      <div className="shrink-0" data-no-drag>
        {control}
      </div>
    </div>
  )
}

function StatTile({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <div className="rounded-lg border border-slate-200/60 bg-white shadow-sm p-4">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="text-3xl font-bold text-slate-900 mt-1">{value}</div>
      {subtitle && <div className="text-xs text-slate-500 mt-2">{subtitle}</div>}
    </div>
  )
}
