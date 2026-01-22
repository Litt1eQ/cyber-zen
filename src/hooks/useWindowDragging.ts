import { useCallback } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'

function getClosestElement(target: EventTarget | null): Element | null {
  if (!target) return null
  if (target instanceof Element) return target
  if (target instanceof Node) return target.parentElement
  return null
}

function isInteractiveTarget(target: EventTarget | null) {
  const el = getClosestElement(target)
  if (!el) return false
  return Boolean(
    el.closest(
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
    if (event.currentTarget instanceof Element) {
      const targetNode = event.target instanceof Node ? event.target : null
      if (!targetNode || !event.currentTarget.contains(targetNode)) return
    }
    if (isInteractiveTarget(event.target)) return
    try {
      await getCurrentWindow().startDragging()
    } catch {
      // ignore
    }
  }, [])
}
