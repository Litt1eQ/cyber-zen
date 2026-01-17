export const SUPPORTED_LOCALES = ['en', 'zh-CN', 'zh-TW'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

export type AppLocalePreference = 'system' | SupportedLocale

function normalizeLocaleTag(tag: string): string {
  return tag.trim().replace('_', '-')
}

export function resolveSupportedLocaleFromSystemLocaleTag(
  systemLocaleTag: string | null | undefined,
): SupportedLocale {
  const tag = normalizeLocaleTag(systemLocaleTag ?? '')
  if (!tag) return 'en'
  const lower = tag.toLowerCase()

  if (lower.startsWith('zh')) {
    // Prefer Traditional for HK/MO/TW or explicit Hant scripts.
    if (
      lower.includes('-tw') ||
      lower.includes('-hk') ||
      lower.includes('-mo') ||
      lower.includes('-hant')
    ) {
      return 'zh-TW'
    }
    return 'zh-CN'
  }

  return 'en'
}

export function resolveSupportedLocaleFromNavigator(): SupportedLocale {
  try {
    const candidates = (navigator.languages?.length ? navigator.languages : [navigator.language]) ?? []
    for (const raw of candidates) {
      const resolved = resolveSupportedLocaleFromSystemLocaleTag(raw)
      if (resolved) return resolved
    }
  } catch {
    // ignore
  }
  return 'en'
}

export function resolveLocalePreference(
  preference: string | null | undefined,
): AppLocalePreference {
  const normalized = normalizeLocaleTag(preference ?? '')
  if (!normalized || normalized === 'system') return 'system'
  if ((SUPPORTED_LOCALES as readonly string[]).includes(normalized)) {
    return normalized as SupportedLocale
  }
  return 'system'
}

export function resolveEffectiveLocale(preference: string | null | undefined): SupportedLocale {
  const pref = resolveLocalePreference(preference)
  if (pref === 'system') return resolveSupportedLocaleFromNavigator()
  return pref
}

