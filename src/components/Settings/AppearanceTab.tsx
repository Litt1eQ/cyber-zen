import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { Settings } from '@/types/merit'
import { SettingsSection, SettingRow } from '@/components/Settings/SettingsLayout'
import { SkinManager } from '@/components/Settings/SkinManager'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'

const MERIT_LABEL_MAX_CHARS = 4
const DEFAULT_MERIT_LABEL = '功德'

export function AppearanceTab({
  settings,
  updateSettings,
}: {
  settings: Settings
  updateSettings: (settings: Partial<Settings>) => Promise<void>
}) {
  const { t } = useTranslation()
  const meritLabelFocusedRef = useRef(false)
  const [meritLabelDraft, setMeritLabelDraft] = useState('')

  useEffect(() => {
    if (meritLabelFocusedRef.current) return
    setMeritLabelDraft(settings.merit_pop_label ?? DEFAULT_MERIT_LABEL)
  }, [settings.merit_pop_label])

  return (
    <div className="space-y-8">
      <SettingsSection title={t('settings.sections.appearance.title')}>
        <SkinManager
          selectedId={settings.wooden_fish_skin ?? 'rosewood'}
          onSelect={(id) => updateSettings({ wooden_fish_skin: id })}
        />

        <SettingRow
          title={t('settings.appearance.woodenFishOpacity')}
          description={`${Math.round(((settings.wooden_fish_opacity ?? 1) as number) * 100)}% ${t('settings.appearance.woodenFishOpacityDesc')}`}
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
          title={t('settings.appearance.meritPopOpacity')}
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
          title={t('settings.appearance.meritPopLabel')}
          description={t('settings.appearance.meritPopLabelExample', {
            example: `${(settings.merit_pop_label ?? DEFAULT_MERIT_LABEL).slice(0, MERIT_LABEL_MAX_CHARS)}+1`,
            max: MERIT_LABEL_MAX_CHARS,
          })}
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
    </div>
  )
}

