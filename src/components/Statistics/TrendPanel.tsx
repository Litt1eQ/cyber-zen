import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DailyStats } from '@/types/merit'
import { Button } from '@/components/ui/button'
import { TrendChart } from './TrendChart'

export function TrendPanel({ days, defaultRange = 7 }: { days: DailyStats[]; defaultRange?: 7 | 30 }) {
  const { t } = useTranslation()
  const [range, setRange] = useState<7 | 30>(defaultRange)

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 tracking-wide">{t('customStatistics.widgets.trend.title')}</div>
          <div className="text-xs text-slate-500 mt-1">{t('customStatistics.widgets.trend.description')}</div>
        </div>
        <div className="flex items-center gap-2" data-no-drag>
          <Button
            type="button"
            variant={range === 7 ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setRange(7)}
            data-no-drag
          >
            {t('statistics.range.days', { days: 7 })}
          </Button>
          <Button
            type="button"
            variant={range === 30 ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setRange(30)}
            data-no-drag
          >
            {t('statistics.range.days', { days: 30 })}
          </Button>
        </div>
      </div>
      <div className="mt-4">
        <TrendChart days={days} rangeDays={range} />
      </div>
    </>
  )
}
