import { useEffect, useState } from 'react'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia?.(query).matches ?? false
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia?.(query)
    if (!mq) return

    const onChange = () => setMatches(mq.matches)
    onChange()

    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    }

    mq.addListener(onChange)
    return () => mq.removeListener(onChange)
  }, [query])

  return matches
}

