import { useEffect, useRef } from 'react'
import { useMeritStore } from '../stores/useMeritStore'

export function useDailyReset() {
  const fetchStats = useMeritStore((state) => state.fetchStats)
  const timeoutRef = useRef<number | null>(null)
  const intervalRef = useRef<number | null>(null)

  useEffect(() => {
    const checkAndReset = () => {
      fetchStats()
    }

    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    if (intervalRef.current != null) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    checkAndReset()

    const now = new Date()
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const msUntilMidnight = tomorrow.getTime() - now.getTime()

    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null
      checkAndReset()

      intervalRef.current = window.setInterval(checkAndReset, 24 * 60 * 60 * 1000)
    }, msUntilMidnight)

    return () => {
      if (timeoutRef.current != null) window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
      if (intervalRef.current != null) window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [fetchStats])
}
