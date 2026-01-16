import { useId, useMemo, type ComponentType } from 'react'
import { Keyboard, Mouse } from 'lucide-react'
import type { MeritStats } from '@/types/merit'
import { cn } from '@/lib/utils'
import { Card } from '../ui/card'

type BreakdownItem = {
  label: string
  value: number
  icon: ComponentType<{ className?: string }>
  accent: { from: string; to: string }
}

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, n))
}

function StatRing({
  percent,
  accent,
  icon: Icon,
  ariaLabel,
}: {
  percent: number
  accent: { from: string; to: string }
  icon: ComponentType<{ className?: string }>
  ariaLabel: string
}) {
  const pct = clampPercent(percent)
  const id = useId()
  const r = 14
  const circumference = 2 * Math.PI * r
  const dash = (pct / 100) * circumference
  return (
    <div
      className="relative h-12 w-12 shrink-0 aspect-square"
      aria-label={ariaLabel}
    >
      <svg className="h-full w-full" viewBox="0 0 36 36" aria-hidden="true">
        <defs>
          <linearGradient id={`${id}-ring`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={accent.from} />
            <stop offset="100%" stopColor={accent.to} />
          </linearGradient>
        </defs>
        <circle cx="18" cy="18" r={r} fill="none" stroke="rgba(226,232,240,0.9)" strokeWidth="4" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke={`url(#${id}-ring)`}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          transform="rotate(-90 18 18)"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/60 bg-white/90 shadow-sm">
          <Icon className="h-5 w-5 text-slate-600" />
        </div>
      </div>
    </div>
  )
}

function BreakdownTile({ item, total }: { item: BreakdownItem; total: number }) {
  const percent = total > 0 ? (item.value / total) * 100 : 0
  return (
    <div className="rounded-2xl border border-amber-200/40 bg-white/70 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <StatRing
            percent={percent}
            accent={item.accent}
            icon={item.icon}
            ariaLabel={`${item.label} 占比 ${Math.round(clampPercent(percent))}%`}
          />
          <div className="min-w-0">
            <div className="text-xs text-slate-500">{item.label}</div>
            <div className="mt-1 text-2xl font-semibold leading-none tabular-nums bg-gradient-to-r from-amber-700 to-amber-500 bg-clip-text text-transparent">
              {item.value.toLocaleString()}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function TodayOverviewPanel({ stats }: { stats: MeritStats | null | undefined }) {
  const todayTotal = stats?.today.total ?? 0
  const breakdownItems = useMemo<BreakdownItem[]>(
    () => [
      {
        label: '键盘',
        value: stats?.today.keyboard ?? 0,
        icon: Keyboard,
        accent: { from: '#60a5fa', to: '#2563eb' },
      },
      {
        label: '单击',
        value: stats?.today.mouse_single ?? 0,
        icon: Mouse,
        accent: { from: '#fbbf24', to: '#d97706' },
      },
    ],
    [stats?.today.keyboard, stats?.today.mouse_single]
  )

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
      <Card
        className={cn(
          'p-5 md:col-span-8 rounded-2xl border-amber-200/40',
          'bg-gradient-to-br from-white via-amber-50/70 to-amber-100/40'
        )}
      >
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-700">今日总计</div>
            <div className="mt-1 text-xs text-slate-500 tabular-nums">{stats?.today.date ?? ''}</div>
            <div className="mt-4 text-sm text-slate-600">来源分布</div>
          </div>
          <div className="text-5xl font-semibold leading-none tabular-nums bg-gradient-to-r from-amber-700 to-amber-500 bg-clip-text text-transparent">
            {todayTotal.toLocaleString()}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {breakdownItems.map((item) => (
            <BreakdownTile key={item.label} item={item} total={todayTotal} />
          ))}
        </div>
      </Card>

      <Card
        className={cn(
          'p-5 md:col-span-4 rounded-2xl border-amber-200/40',
          'bg-gradient-to-br from-white via-amber-50/70 to-amber-100/40'
        )}
      >
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-700">总功德</div>
            <div className="mt-1 text-xs text-slate-500">累计</div>
          </div>
          <div className="text-4xl font-semibold leading-none tabular-nums bg-gradient-to-r from-amber-700 to-amber-500 bg-clip-text text-transparent">
            {(stats?.total_merit ?? 0).toLocaleString()}
          </div>
        </div>
      </Card>
    </div>
  )
}
