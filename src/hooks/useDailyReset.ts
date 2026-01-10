import { useEffect } from 'react'
import { useMeritStore } from '../stores/useMeritStore'

export function useDailyReset() {
  const fetchStats = useMeritStore((state) => state.fetchStats)

  useEffect(() => {
    const checkAndReset = () => {
      fetchStats()
    }

    checkAndReset()

    const now = new Date()
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const msUntilMidnight = tomorrow.getTime() - now.getTime()

    const timeoutId = setTimeout(() => {
      checkAndReset()

      const intervalId = setInterval(checkAndReset, 24 * 60 * 60 * 1000)

      return () => clearInterval(intervalId)
    }, msUntilMidnight)

    return () => clearTimeout(timeoutId)
  }, [fetchStats])
}
