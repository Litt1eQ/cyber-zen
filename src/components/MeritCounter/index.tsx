import { useMeritStore } from '../../stores/useMeritStore'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'

export function MeritCounter() {
  const { t } = useTranslation()
  const stats = useMeritStore((state) => state.stats)

  if (!stats) return null

  return (
    <div className="w-full px-6 py-4 space-y-3 window-no-drag">
      <div className="bg-gradient-to-r from-amber-900/40 to-amber-800/40 backdrop-blur-sm rounded-2xl p-4 shadow-lg border border-amber-700/30">
        <div className="flex justify-between items-center">
          <div className="flex-1">
            <div className="text-amber-300 text-xs mb-1">{t('customStatistics.meritLabel.today')}</div>
            <motion.div
              key={stats.today.total}
              initial={{ scale: 1.2, color: '#fbbf24' }}
              animate={{ scale: 1, color: '#fcd34d' }}
              transition={{ duration: 0.3 }}
              className="text-2xl font-bold"
            >
              {stats.today.total.toLocaleString()}
            </motion.div>
          </div>

          <div className="h-12 w-px bg-amber-700/30"></div>

          <div className="flex-1 text-right">
            <div className="text-amber-300 text-xs mb-1">{t('customStatistics.meritLabel.cumulative')}</div>
            <div className="text-2xl font-bold text-amber-400">
              {stats.total_merit.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatItem label={t('customStatistics.keyboard')} value={stats.today.keyboard} />
        <StatItem label={t('customStatistics.click')} value={stats.today.mouse_single} />
      </div>
    </div>
  )
}

function StatItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-amber-900/20 backdrop-blur-sm rounded-xl p-3 border border-amber-700/20">
      <div className="text-amber-400/70 text-xs mb-1">{label}</div>
      <div className="text-lg font-semibold text-amber-300">{value.toLocaleString()}</div>
    </div>
  )
}
