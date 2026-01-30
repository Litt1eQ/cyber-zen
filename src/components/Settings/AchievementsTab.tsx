import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Circle, Flame, Keyboard, MousePointerClick, Sparkles, Sunrise, Trophy, CalendarDays, Move } from 'lucide-react'
import type { DailyStats, DailyStatsLite, MeritStats, MeritStatsLite } from '@/types/merit'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { ACHIEVEMENT_DEFINITIONS, computeAchievementMetrics, computeAchievementSummary, computeAchievementsByCadence } from '@/lib/achievements'
import type { AchievementCadence, AchievementComputed, AchievementIcon } from '@/lib/achievements'
import { Button } from '@/components/ui/button'
import { useAchievementStore } from '@/stores/useAchievementStore'
import { useAchievementsSync } from '@/hooks/useAchievementsSync'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useDisplayMonitors } from '@/hooks/useDisplayMonitors'
import { useMeritDaysLiteStore } from '@/stores/useMeritDaysLiteStore'

function iconFor(kind: AchievementIcon) {
  switch (kind) {
    case 'sunrise':
      return Sunrise
    case 'keyboard':
      return Keyboard
    case 'mouse':
      return MousePointerClick
    case 'move':
      return Move
    case 'calendar':
      return CalendarDays
    case 'flame':
      return Flame
    case 'trophy':
      return Trophy
    case 'sparkles':
    default:
      return Sparkles
  }
}

function resetHintKeyForCadence(cadence: AchievementCadence) {
  switch (cadence) {
    case 'daily':
      return 'settings.achievements.resetHint.daily'
    case 'weekly':
      return 'settings.achievements.resetHint.weekly'
    case 'monthly':
      return 'settings.achievements.resetHint.monthly'
    case 'yearly':
      return 'settings.achievements.resetHint.yearly'
    case 'total':
      return 'settings.achievements.resetHint.total'
  }
}

export function AchievementsTab({ stats }: { stats: MeritStatsLite | null }) {
  const { t, i18n } = useTranslation()
  const [cadence, setCadence] = useState<AchievementCadence>('daily')
  const settings = useSettingsStore((s) => s.settings)
  const monitors = useDisplayMonitors()
  const { today: todayLite, history: historyLite, fetchRecentDaysLite } = useMeritDaysLiteStore()
  const achievementState = useAchievementStore((s) => s.state)
  const fetchAchievementState = useAchievementStore((s) => s.fetchState)
  const clearHistory = useAchievementStore((s) => s.clearHistory)
  useAchievementsSync()

  useEffect(() => {
    fetchAchievementState()
  }, [fetchAchievementState])

  useEffect(() => {
    fetchRecentDaysLite(420)
  }, [fetchRecentDaysLite])

  const vm = useMemo(() => {
    if (!stats) return null
    const inflate = (day: DailyStatsLite): DailyStats => ({
      date: day.date,
      total: day.total ?? 0,
      keyboard: day.keyboard ?? 0,
      mouse_single: day.mouse_single ?? 0,
      first_event_at_ms: day.first_event_at_ms ?? null,
      last_event_at_ms: day.last_event_at_ms ?? null,
      mouse_move_distance_px: day.mouse_move_distance_px ?? 0,
      mouse_move_distance_px_by_display: day.mouse_move_distance_px_by_display ?? {},
      hourly: day.hourly ?? [],
      key_counts: {},
      key_counts_unshifted: {},
      key_counts_shifted: {},
      shortcut_counts: {},
      mouse_button_counts: {},
      app_input_counts: {},
    })

    const today = todayLite ? inflate(todayLite) : inflate(stats.today)
    const history = historyLite.map(inflate).filter((d) => d.date !== today.date)
    const full: MeritStats = { total_merit: stats.total_merit, today, history }

    const metrics = computeAchievementMetrics(full, { settings, monitors: monitors.monitors })
    const summary = computeAchievementSummary(metrics)
    const byCadence = computeAchievementsByCadence(ACHIEVEMENT_DEFINITIONS, metrics)
    return { summary, byCadence }
  }, [historyLite, monitors.monitors, settings, stats, todayLite])

  const defsById = useMemo(() => {
    const map = new Map<string, (typeof ACHIEVEMENT_DEFINITIONS)[number]>()
    for (const d of ACHIEVEMENT_DEFINITIONS) map.set(d.id, d)
    return map
  }, [])

  const timeFmt = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(i18n.resolvedLanguage ?? undefined, { dateStyle: 'medium', timeStyle: 'short' })
    } catch {
      return null
    }
  }, [i18n.resolvedLanguage])

  if (!vm) {
    return (
      <div className="space-y-6">
        <Card className="p-5">
          <div className="text-sm text-slate-500">{t('common.loading')}</div>
        </Card>
      </div>
    )
  }

  const history = achievementState?.unlock_history ?? []

  return (
    <div className="space-y-8">
      <Card className="p-5 overflow-hidden border-slate-200/60 bg-gradient-to-br from-white via-white to-blue-50/40">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
                <Trophy className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900">{t('settings.achievements.headerTitle')}</div>
                <div className="text-xs text-slate-500 mt-0.5">{t('settings.achievements.headerSubtitle')}</div>
              </div>
            </div>
          </div>

          <div className="hidden sm:grid grid-cols-4 gap-3">
            <SummaryPill label={t('settings.achievements.summary.today')} value={vm.summary.todayTotal} tone="blue" />
            <SummaryPill label={t('settings.achievements.summary.week')} value={vm.summary.weekTotal} tone="slate" />
            <SummaryPill label={t('settings.achievements.summary.month')} value={vm.summary.monthTotal} tone="slate" />
            <SummaryPill label={t('settings.achievements.summary.streak')} value={vm.summary.currentStreakDays} suffix={t('settings.achievements.summary.days')} tone="amber" />
          </div>
        </div>
      </Card>

      <Tabs value={cadence} onValueChange={(v) => setCadence(v as AchievementCadence)}>
        <div className="flex items-center justify-between gap-4">
          <TabsList className="bg-slate-100/70">
            <TabsTrigger value="daily">{t('settings.achievements.cadence.daily')}</TabsTrigger>
            <TabsTrigger value="weekly">{t('settings.achievements.cadence.weekly')}</TabsTrigger>
            <TabsTrigger value="monthly">{t('settings.achievements.cadence.monthly')}</TabsTrigger>
            <TabsTrigger value="yearly">{t('settings.achievements.cadence.yearly')}</TabsTrigger>
            <TabsTrigger value="total">{t('settings.achievements.cadence.total')}</TabsTrigger>
          </TabsList>
          <div className="text-xs text-slate-500">{t(resetHintKeyForCadence(cadence))}</div>
        </div>

        <TabsContent value="daily" className="mt-4">
          <AchievementGrid items={vm.byCadence.daily} />
        </TabsContent>
        <TabsContent value="weekly" className="mt-4">
          <AchievementGrid items={vm.byCadence.weekly} />
        </TabsContent>
        <TabsContent value="monthly" className="mt-4">
          <AchievementGrid items={vm.byCadence.monthly} />
        </TabsContent>
        <TabsContent value="yearly" className="mt-4">
          <AchievementGrid items={vm.byCadence.yearly} />
        </TabsContent>
        <TabsContent value="total" className="mt-4">
          <AchievementGrid items={vm.byCadence.total} />
        </TabsContent>
      </Tabs>

      <Card className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="font-medium text-slate-900">{t('settings.achievements.history.title')}</div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void clearHistory()}
            disabled={!history.length}
            data-no-drag
          >
            {t('settings.achievements.history.clear')}
          </Button>
        </div>

        {!history.length ? (
          <div className="text-sm text-slate-500 mt-3">{t('settings.achievements.history.empty')}</div>
        ) : (
          <div className="mt-3 divide-y divide-slate-200/60">
            {history.slice(0, 30).map((rec) => {
              const def = defsById.get(rec.achievement_id)
              const Icon = def ? iconFor(def.icon) : Trophy
              const rawArgs = def?.titleArgs ?? {}
              const titleArgs =
                typeof (rawArgs as { target?: unknown }).target === 'number'
                  ? { ...rawArgs, target: ((rawArgs as { target: number }).target).toLocaleString() }
                  : rawArgs
              const title = def ? t(def.titleKey, titleArgs) : rec.achievement_id
              const when = timeFmt ? timeFmt.format(new Date(rec.unlocked_at_ms)) : new Date(rec.unlocked_at_ms).toLocaleString()
              return (
                <div key={`${rec.achievement_id}::${rec.cadence}::${rec.period_key}::${rec.unlocked_at_ms}`} className="py-2.5 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-lg bg-slate-100 border border-slate-200/60 flex items-center justify-center text-slate-700">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{title}</div>
                      <div className="text-xs text-slate-500 mt-0.5 tabular-nums">{when}</div>
                    </div>
                  </div>
                  <div className="shrink-0 text-[11px] text-slate-500 tabular-nums">
                    {t(`settings.achievements.cadence.${rec.cadence}` as const)} · {rec.period_key}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

function SummaryPill({
  label,
  value,
  suffix,
  tone,
}: {
  label: string
  value: number
  suffix?: string
  tone: 'blue' | 'slate' | 'amber'
}) {
  const toneCls =
    tone === 'blue'
      ? 'bg-blue-50 text-blue-700 border-blue-100'
      : tone === 'amber'
        ? 'bg-amber-50 text-amber-800 border-amber-100'
        : 'bg-slate-50 text-slate-700 border-slate-200/60'
  return (
    <div className={cn('rounded-xl border px-3 py-2 min-w-[96px]', toneCls)}>
      <div className="text-[11px] font-medium opacity-80">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums">
        {value.toLocaleString()}
        {suffix ? <span className="ml-1 text-[11px] font-medium opacity-80">{suffix}</span> : null}
      </div>
    </div>
  )
}

function AchievementGrid({ items }: { items: AchievementComputed[] }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {items.map((a) => (
        <AchievementCard key={a.id} achievement={a} />
      ))}
    </div>
  )
}

function AchievementCard({ achievement }: { achievement: AchievementComputed }) {
  const { t } = useTranslation()
  const Icon = iconFor(achievement.icon)
  const { current, target, completed, detail, parts } = achievement.progress
  const pct = target > 0 ? Math.max(0, Math.min(100, (current / target) * 100)) : 0
  const fmtArgs = { target: target.toLocaleString() }

  return (
    <Card
      className={cn(
        'p-4 relative overflow-hidden',
        completed ? 'border-emerald-200/70 bg-gradient-to-br from-emerald-50/60 via-white to-white' : 'bg-white'
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute -top-20 -right-20 h-40 w-40 rounded-full blur-2xl opacity-60',
          completed ? 'bg-emerald-200' : 'bg-blue-200'
        )}
      />

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0 flex items-start gap-3">
          <div
            className={cn(
              'h-10 w-10 rounded-xl flex items-center justify-center border shadow-sm',
              completed ? 'bg-emerald-100 text-emerald-700 border-emerald-200/60' : 'bg-slate-100 text-slate-700 border-slate-200/60'
            )}
          >
            <Icon className="h-5 w-5" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="font-semibold text-slate-900 truncate">{t(achievement.titleKey, { ...(achievement.titleArgs ?? {}), ...fmtArgs })}</div>
              {completed ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-100/70 border border-emerald-200/60 rounded-full px-2 py-0.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {t('settings.achievements.state.completed')}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-100/70 border border-slate-200/60 rounded-full px-2 py-0.5">
                  <Circle className="h-3.5 w-3.5" />
                  {t('settings.achievements.state.inProgress')}
                </span>
              )}
            </div>
            <div className="text-sm text-slate-500 mt-1">{t(achievement.descriptionKey, { ...(achievement.descriptionArgs ?? {}), ...fmtArgs })}</div>
          </div>
        </div>
      </div>

      <div className="relative mt-4">
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            className={cn('h-full rounded-full', completed ? 'bg-emerald-500' : 'bg-blue-500')}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
          <div className="min-w-0 truncate tabular-nums">
            {parts?.length ? (
              <div className="flex items-center gap-2">
                {parts.map((p) => (
                  <span key={p.kind} className="inline-flex items-center gap-1">
                    {p.kind === 'keyboard' ? <Keyboard className="h-3.5 w-3.5" /> : null}
                    {p.kind === 'mouse' ? <MousePointerClick className="h-3.5 w-3.5" /> : null}
                    {p.current.toLocaleString()} / {p.target.toLocaleString()}
                  </span>
                ))}
              </div>
            ) : detail ? (
              detail
            ) : (
              `${Math.min(current, target).toLocaleString()} / ${target.toLocaleString()}`
            )}
          </div>
          <div className="shrink-0 tabular-nums">{Math.round(pct)}%</div>
        </div>
      </div>
    </Card>
  )
}
