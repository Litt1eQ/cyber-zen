import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ACHIEVEMENT_DEFINITIONS } from '@/lib/achievements'
import type { AchievementCadence } from '@/lib/achievements'
import { downloadTextFile } from '@/lib/downloadTextFile'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/stores/useSettingsStore'

const CADENCE_ORDER: AchievementCadence[] = ['daily', 'weekly', 'monthly', 'yearly', 'total']

function formatAchievementTitleArgs(titleArgs: Record<string, unknown> | undefined) {
  if (typeof titleArgs?.target === 'number') {
    return { ...titleArgs, target: titleArgs.target.toLocaleString() }
  }
  return titleArgs ?? {}
}

export function AchievementCustomNamesDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const settings = useSettingsStore((s) => s.settings)
  const updateSettings = useSettingsStore((s) => s.updateSettings)
  const [localNames, setLocalNames] = useState<Record<string, string>>({})
  const saveTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (open) {
      setLocalNames(settings?.achievement_custom_names ?? {})
    }
  }, [open, settings?.achievement_custom_names])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current)
      }
    }
  }, [])

  const persistNames = useCallback(
    (names: Record<string, string>) => {
      if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null
        const cleaned: Record<string, string> = {}
        for (const [id, value] of Object.entries(names)) {
          const trimmed = value.trim()
          if (trimmed) cleaned[id] = trimmed
        }
        void updateSettings({ achievement_custom_names: cleaned })
      }, 300)
    },
    [updateSettings]
  )

  const handleChange = useCallback(
    (id: string, value: string) => {
      setLocalNames((current) => {
        const next = { ...current, [id]: value }
        persistNames(next)
        return next
      })
    },
    [persistNames]
  )

  const handleResetItem = useCallback(
    (id: string) => {
      setLocalNames((current) => {
        const next = { ...current }
        delete next[id]
        persistNames(next)
        return next
      })
    },
    [persistNames]
  )

  const handleResetAll = useCallback(() => {
    if (!window.confirm(t('settings.achievements.customNames.resetAllConfirm'))) return
    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    setLocalNames({})
    void updateSettings({ achievement_custom_names: {} })
  }, [t, updateSettings])

  const handleExport = useCallback(() => {
    const names: Record<string, string> = {}
    for (const [id, value] of Object.entries(localNames)) {
      const trimmed = value.trim()
      if (trimmed) names[id] = trimmed
    }
    downloadTextFile({
      filename: 'achievement-names.json',
      text: JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          names,
        },
        null,
        2
      ),
    })
  }, [localNames])

  const grouped = CADENCE_ORDER.map((cadence) => ({
    cadence,
    label: t(`settings.achievements.cadence.${cadence}`),
    defs: ACHIEVEMENT_DEFINITIONS.filter((definition) => definition.cadence === cadence),
  }))

  const hasAnyCustom = Object.values(localNames).some((value) => value.trim() !== '')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col gap-0 p-0" data-no-drag>
        <DialogHeader className="border-b border-slate-200/70 px-6 py-5">
          <DialogTitle>{t('settings.achievements.customNames.dialogTitle')}</DialogTitle>
          <DialogDescription>{t('settings.achievements.customNames.dialogSubtitle')}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-5">
            {grouped.map(({ cadence, label, defs }) => (
              <section key={cadence} className="space-y-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-600">{label}</div>
                <div className="space-y-1.5">
                  {defs.map((definition) => {
                    const defaultName = t(definition.titleKey, formatAchievementTitleArgs(definition.titleArgs))
                    const customValue = localNames[definition.id] ?? ''
                    const hasCustom = customValue.trim() !== ''

                    return (
                      <div
                        key={definition.id}
                        className="grid grid-cols-[110px_auto_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-slate-200/70 bg-white px-3 py-2"
                      >
                        <span className="truncate text-xs text-slate-500" title={defaultName}>
                          {defaultName}
                        </span>
                        <span className="text-xs text-slate-300">→</span>
                        <Input
                          value={customValue}
                          onChange={(event) => handleChange(definition.id, event.target.value)}
                          placeholder={t('settings.achievements.customNames.inputPlaceholder')}
                          maxLength={40}
                          className="h-8 min-w-0 text-sm"
                          data-no-drag
                        />
                        <button
                          type="button"
                          onClick={() => handleResetItem(definition.id)}
                          disabled={!hasCustom}
                          className={cn(
                            'rounded-md border px-2 py-1 text-xs transition-colors',
                            hasCustom
                              ? 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900'
                              : 'cursor-default border-slate-100 text-slate-300'
                          )}
                          data-no-drag
                        >
                          ↺
                        </button>
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>

        <DialogFooter className="items-stretch gap-2 border-t border-slate-200/70 px-6 py-4 sm:items-center sm:justify-between sm:space-x-0">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleExport} data-no-drag>
              ↓ {t('settings.achievements.customNames.exportJson')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleResetAll}
              disabled={!hasAnyCustom}
              className={cn(hasAnyCustom ? 'border-red-200 text-red-600 hover:bg-red-50' : undefined)}
              data-no-drag
            >
              ↺ {t('settings.achievements.customNames.resetAll')}
            </Button>
          </div>
          <Button type="button" size="sm" onClick={() => onOpenChange(false)} data-no-drag>
            {t('settings.achievements.customNames.done')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
