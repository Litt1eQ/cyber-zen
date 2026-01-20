import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { resolveMeritLevelProgress } from '@/lib/meritLevel'

export function MeritLevelPanel({ totalMerit }: { totalMerit: number }) {
  const { t } = useTranslation()
  const state = useMemo(() => resolveMeritLevelProgress(totalMerit), [totalMerit])
  const progressPct = Math.round(state.progress01 * 100)
  const currentName = t(state.currentLevel.nameKey, { defaultValue: state.currentLevel.fallbackName })
  const nextName = state.nextLevel
    ? t(state.nextLevel.nameKey, { defaultValue: state.nextLevel.fallbackName })
    : t('statistics.level.maxName')

  const progressRightLabel =
    state.nextMinMerit == null
      ? t('statistics.level.reachedMax')
      : t('statistics.level.remaining', { value: state.remainingToNext?.toLocaleString() ?? '0' })

  return (
    <div className="mt-4 rounded-2xl border border-amber-200/40 bg-white/70 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="text-xs font-medium text-slate-600">{t('statistics.level.title')}</div>
          <div className="mt-1 flex items-center gap-2 min-w-0">
            <div className="shrink-0 rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 tabular-nums">
              {t('statistics.level.levelNumber', { level: state.levelNumber })}
            </div>
            <div className="min-w-0 text-sm font-semibold text-slate-900 truncate">
              {currentName}
            </div>
          </div>
          <div className="mt-1 text-[11px] text-slate-500 tabular-nums">
            {state.nextMinMerit == null
              ? t('statistics.level.maxHint')
              : t('statistics.level.progress', {
                  current: totalMerit.toLocaleString(),
                  next: state.nextMinMerit.toLocaleString(),
                })}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-[11px] text-slate-500">{t('statistics.level.nextTitle')}</div>
          <div className="mt-1 text-sm font-semibold text-slate-700">
            {nextName}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200/80">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-400"
            style={{ width: `${progressPct}%` }}
            aria-label={t('statistics.level.progressAria', { value: progressPct })}
          />
        </div>

        <div className="mt-2 flex items-center justify-between gap-4 text-[11px] text-slate-500 tabular-nums">
          <div>{t('statistics.level.percent', { value: progressPct })}</div>
          <div className="truncate">{progressRightLabel}</div>
        </div>
      </div>
    </div>
  )
}
