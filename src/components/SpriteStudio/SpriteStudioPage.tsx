import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { SpriteSheetStudio } from './SpriteSheetStudio'
import { useWindowDragging } from '@/hooks/useWindowDragging'
import { useSettingsSync } from '@/hooks/useSettingsSync'
import { useAppLocaleSync } from '@/hooks/useAppLocaleSync'
import { useSettingsStore } from '@/stores/useSettingsStore'

export function SpriteStudioPage() {
  const { t, i18n } = useTranslation()
  const fetchSettings = useSettingsStore((s) => s.fetchSettings)
  useSettingsSync()
  useAppLocaleSync()
  const startDragging = useWindowDragging()

  useEffect(() => {
    void fetchSettings()
  }, [fetchSettings])

  useEffect(() => {
    try {
      document.title = t('windows.spriteStudio')
    } catch {
      // ignore
    }
  }, [i18n.resolvedLanguage, t])

  return (
    <div className="w-full h-full bg-slate-50 text-slate-900 flex flex-col">
      <div
        className="border-b border-slate-200/60 bg-white/70 backdrop-blur"
        data-tauri-drag-region
        onPointerDown={startDragging}
      >
        <div className="mx-auto max-w-6xl px-6 py-4">
          <div className="min-w-0">
            <div className="text-lg font-semibold text-slate-900">{t('settings.skins.studio.title')}</div>
            <div className="text-sm text-slate-500 mt-1">{t('settings.skins.studio.subtitle')}</div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl px-6 py-6">
          <SpriteSheetStudio />
        </div>
      </div>
    </div>
  )
}
