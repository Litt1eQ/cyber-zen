import { useMeritStore } from '../../stores/useMeritStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { MonthlyHistoryCalendar } from './MonthlyHistoryCalendar'

export function Statistics() {
  const stats = useMeritStore((state) => state.stats)
  const heatLevelCount = useSettingsStore((state) => state.settings?.heatmap_levels)
  const allDays = stats ? [stats.today, ...stats.history] : []

  return (
    <div className="space-y-2">
      <h3 className="text-slate-600 text-sm mb-2">历史记录</h3>
      {stats ? (
        <MonthlyHistoryCalendar days={allDays} todayKey={stats.today.date} heatLevelCount={heatLevelCount} />
      ) : (
        <div className="rounded-xl p-5 border border-slate-200 bg-white shadow-sm text-slate-500">
          加载中...
        </div>
      )}
    </div>
  )
}
