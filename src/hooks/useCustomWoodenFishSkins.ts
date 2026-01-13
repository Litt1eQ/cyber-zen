import { useCallback, useEffect, useMemo, useState } from 'react'
import { invoke, convertFileSrc, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { CustomWoodenFishSkin } from '../types/skins'
import { COMMANDS, EVENTS } from '../types/events'
import { createWoodenFishSkinFromUrls, type WoodenFishSkin } from '../components/WoodenFish/skins'

export type CustomWoodenFishSkinResolved = CustomWoodenFishSkin & {
  muyu_src: string
  hammer_src: string
  skin: WoodenFishSkin
}

export function useCustomWoodenFishSkins() {
  const [skins, setSkins] = useState<CustomWoodenFishSkin[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!isTauri()) return
    setLoading(true)
    setError(null)
    try {
      const list = await invoke<CustomWoodenFishSkin[]>(COMMANDS.GET_CUSTOM_WOODEN_FISH_SKINS)
      setSkins(Array.isArray(list) ? list : [])
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (!isTauri()) return
    const unlistenPromise = listen(EVENTS.WOODEN_FISH_SKINS_UPDATED, () => {
      void reload()
    })
    return () => {
      unlistenPromise.then((fn) => fn()).catch(() => {})
    }
  }, [reload])

  const resolved = useMemo<CustomWoodenFishSkinResolved[]>(() => {
    return skins.map((s) => {
      const muyu_src = convertFileSrc(s.muyu_path)
      const hammer_src = convertFileSrc(s.hammer_path)
      return {
        ...s,
        muyu_src,
        hammer_src,
        skin: createWoodenFishSkinFromUrls({ muyuSrc: muyu_src, hammerSrc: hammer_src }),
      }
    })
  }, [skins])

  const mapById = useMemo(() => {
    const map = new Map<string, CustomWoodenFishSkinResolved>()
    for (const s of resolved) map.set(s.id, s)
    return map
  }, [resolved])

  return { skins: resolved, mapById, loading, error, reload }
}

