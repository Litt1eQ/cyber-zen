import { useEffect } from 'react'
import i18n from '@/i18n'
import { resolveEffectiveLocale } from '@/i18n/locale'
import { useSettingsStore } from '@/stores/useSettingsStore'

export function useAppLocaleSync() {
  const appLocale = useSettingsStore((s) => s.settings?.app_locale)

  useEffect(() => {
    const next = resolveEffectiveLocale(appLocale)
    if (i18n.resolvedLanguage !== next) {
      void i18n.changeLanguage(next)
    }
    try {
      document.documentElement.lang = next
    } catch {
      // ignore
    }
  }, [appLocale])
}

