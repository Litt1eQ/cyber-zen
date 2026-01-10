import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { WoodenFish } from './components/WoodenFish'
import { MeritPop } from './components/MeritPop'
import { DEFAULT_WOODEN_FISH_SKIN_ID, WOODEN_FISH_SKINS, type WoodenFishSkinId } from './components/WoodenFish/skins'
import { useDailyReset } from './hooks/useDailyReset'
import { useInputListener } from './hooks/useInputListener'
import { useInputMonitoringPermission } from './hooks/useInputMonitoringPermission'
import { useMeritPopQueue } from './hooks/useMeritPopQueue'
import { useSettingsSync } from './hooks/useSettingsSync'
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts'
import { useMeritStore } from './stores/useMeritStore'
import { useSettingsStore } from './stores/useSettingsStore'
import { showMainQuickMenu } from './utils/quickMenu'
import type { InputEvent } from './types/merit'
import { COMMANDS, EVENTS } from './types/events'
import { getWoodenFishHitTimeoutMs } from './components/WoodenFish/motion'

function App() {
  const fetchStats = useMeritStore((s) => s.fetchStats)
  const fetchSettings = useSettingsStore((s) => s.fetchSettings)
  const settings = useSettingsStore((s) => s.settings)
  useInputListener()
  const inputMonitoring = useInputMonitoringPermission()
  useGlobalShortcuts(settings)

  const [isAnimating, setIsAnimating] = useState(false)
  const permissionPromptShownRef = useRef(false)

  useDailyReset()
  useSettingsSync()

  useEffect(() => {
    fetchSettings()
    fetchStats()
  }, [fetchSettings, fetchStats])

  useEffect(() => {
    if (!settings) return
    if (!inputMonitoring.supported) return
    if (inputMonitoring.loading) return
    if (inputMonitoring.authorized) return
    if (permissionPromptShownRef.current) return

    try {
      if (window.sessionStorage.getItem('cz.input_monitoring_prompt_dismissed') === '1') return
    } catch {
      // ignore
    }

    if (!settings.enable_keyboard && !settings.enable_mouse_single) return

    permissionPromptShownRef.current = true
    void invoke(COMMANDS.SHOW_SETTINGS_WINDOW)
  }, [
    inputMonitoring.authorized,
    inputMonitoring.loading,
    inputMonitoring.supported,
    settings,
  ])

  const windowScale = settings?.window_scale ?? 100
  const popScale = windowScale / 100
  const skinId = (settings?.wooden_fish_skin as WoodenFishSkinId | undefined) ?? DEFAULT_WOODEN_FISH_SKIN_ID
  const skin = WOODEN_FISH_SKINS[skinId] ?? WOODEN_FISH_SKINS[DEFAULT_WOODEN_FISH_SKIN_ID]
  const animationSpeed = settings?.animation_speed ?? 1
  const pulseTimeoutMs = useMemo(() => getWoodenFishHitTimeoutMs(animationSpeed), [animationSpeed])
  const pulseTimeoutRef = useRef<number | null>(null)

  const pulse = () => {
    setIsAnimating(true)
    if (pulseTimeoutRef.current != null) window.clearTimeout(pulseTimeoutRef.current)
    pulseTimeoutRef.current = window.setTimeout(() => {
      pulseTimeoutRef.current = null
      setIsAnimating(false)
    }, pulseTimeoutMs)
  }

  const { active: floating, enqueue } = useMeritPopQueue(() => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 }))

  const debugEnabled = useMemo(() => {
    try {
      return import.meta.env.DEV && localStorage.getItem('cz.debug') === '1'
    } catch {
      return false
    }
  }, [])

  useEffect(() => {
    const unlisten = listen<InputEvent>(EVENTS.INPUT_EVENT, (event) => {
      if (event.payload.origin === 'global') pulse()
      enqueue(event.payload.count, event.payload.source)
    })

    return () => {
      unlisten.then((fn) => fn())
    }
  }, [enqueue])

  const handleHit = async () => {
    pulse()
    enqueue(1, 'mouse_single')
    await invoke(COMMANDS.ADD_MERIT, { source: 'mouse_single', count: 1 })
  }

  return (
    <div
      className="w-full h-full relative overflow-hidden bg-transparent"
      style={{ opacity: (settings?.opacity ?? 0.95) }}
      onContextMenu={(e) => {
        e.preventDefault()
        void showMainQuickMenu()
      }}
    >
      <div className="absolute inset-0 pointer-events-none" />

      <WoodenFish
        isAnimating={isAnimating}
        animationSpeed={animationSpeed}
        windowScale={windowScale}
        onHit={handleHit}
        skin={skin}
      />

      <div
        className="pointer-events-none"
        style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 9999 }}
      >
        <AnimatePresence>
          {floating.map((item) => (
            <MeritPop key={item.id} x={item.x} y={item.y} value={item.value} source={item.source} scale={popScale} />
          ))}
        </AnimatePresence>
      </div>

      {debugEnabled && (
        <>
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
            <div className="w-2 h-2 rounded-full bg-red-500/80" />
          </div>
          {floating[0] && (
            <div
              className="fixed pointer-events-none"
              style={{ left: floating[0].x, top: floating[0].y }}
            >
              <div className="absolute -left-2 top-0 w-4 h-px bg-red-500/80" />
              <div className="absolute left-0 -top-2 w-px h-4 bg-red-500/80" />
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default App
