import { useCallback } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(
    target.closest(
      [
        '[data-no-drag]',
        'button',
        'a',
        'input',
        'select',
        'textarea',
        '[role="button"]',
        '[role="link"]',
      ].join(',')
    )
  )
}

export function useWindowDragging() {
  return useCallback(async (event: ReactPointerEvent) => {
    if (event.button !== 0) return
    if (isInteractiveTarget(event.target)) return
    try {
      await getCurrentWindow().startDragging()
    } catch {
      // ignore
    }
  }, [])
}
