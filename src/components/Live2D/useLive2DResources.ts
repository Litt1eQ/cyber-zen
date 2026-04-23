import { useEffect, useMemo, useRef, useState } from 'react'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { COMMANDS, EVENTS } from '@/types/events'
import type { Live2DInputEvent, Live2DResourceManifest } from '@/types/live2d'
import {
  pressResource,
  releaseResource,
  type Live2DResourceEntry,
  type PressedLive2DResourceMap,
} from './live2dResources'

type Live2DResourceState = {
  backgroundSrc: string | null
  overlaySrcs: string[]
}

export function useLive2DResources(uuid: string | null, enabled: boolean): Live2DResourceState {
  const supportedRef = useRef<Record<string, Live2DResourceEntry>>({})
  const [backgroundSrc, setBackgroundSrc] = useState<string | null>(null)
  const [pressedResources, setPressedResources] = useState<PressedLive2DResourceMap>({})

  useEffect(() => {
    let cancelled = false

    supportedRef.current = {}
    setBackgroundSrc(null)
    setPressedResources({})

    if (!uuid) return

    void invoke<Live2DResourceManifest>(COMMANDS.GET_LIVE2D_MODEL_RESOURCES, { uuid })
      .then((manifest) => {
        if (cancelled) return

        supportedRef.current = Object.fromEntries(
          manifest.overlay_images.map((image) => [
            image.key,
            {
              group: image.group,
              src: convertFileSrc(image.path),
            },
          ]),
        )
        setBackgroundSrc(manifest.background_path ? convertFileSrc(manifest.background_path) : null)
      })
      .catch(() => {
        if (cancelled) return
        supportedRef.current = {}
        setBackgroundSrc(null)
      })

    return () => {
      cancelled = true
    }
  }, [uuid])

  useEffect(() => {
    setPressedResources({})

    if (!enabled) return

    const unlistenPromise = listen<Live2DInputEvent>(EVENTS.LIVE2D_INPUT_EVENT, (event) => {
      const payload = event.payload

      if (payload.kind === 'key_down') {
        setPressedResources((current) => pressResource(current, payload.code, supportedRef.current))
        return
      }

      if (payload.kind === 'key_up') {
        setPressedResources((current) => releaseResource(current, payload.code))
        return
      }

      if (payload.kind === 'mouse_button_down') {
        setPressedResources((current) => pressResource(current, payload.button, supportedRef.current))
        return
      }

      if (payload.kind === 'mouse_button_up') {
        setPressedResources((current) => releaseResource(current, payload.button))
      }
    })

    return () => {
      setPressedResources({})
      void unlistenPromise.then((fn) => fn()).catch(() => {})
    }
  }, [enabled])

  const overlaySrcs = useMemo(
    () => Object.values(pressedResources).map((item) => item.src),
    [pressedResources],
  )

  return {
    backgroundSrc,
    overlaySrcs,
  }
}
