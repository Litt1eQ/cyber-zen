import { useCallback, useEffect, useMemo, useState } from 'react'
import { invoke, convertFileSrc, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { CustomWoodenFishSkin } from '../types/skins'
import { COMMANDS, EVENTS } from '../types/events'
import { createWoodenFishSkinFromUrls, type WoodenFishSkin } from '../components/WoodenFish/skins'

export type CustomWoodenFishSkinResolved = CustomWoodenFishSkin & {
  muyu_src?: string
  hammer_src?: string
  sprite_sheet_src?: string
  skin: WoodenFishSkin
}

function mapSpriteSheetConfig(config: CustomWoodenFishSkin['sprite_sheet']) {
  if (!config) return undefined
  return {
    mode: config.mode,
    columns: config.columns,
    rows: config.rows,
    chromaKey: config.chroma_key,
    chromaKeyAlgorithm: config.chroma_key_algorithm,
    chromaKeyOptions: config.chroma_key_options,
    removeGridLines: config.remove_grid_lines,
    imageSmoothingEnabled: config.image_smoothing_enabled,
    idleBreathe: config.idle_breathe,
    behavior: config.behavior,
    idleMood: (config.idle_mood as any) ?? undefined,
    hitMood: (config.hit_mood as any) ?? undefined,
    pet: config.pet
      ? {
        hitMoods: config.pet.hit_moods as any,
        idleVariants: config.pet.idle_variants as any,
        idleVariantEveryMs: config.pet.idle_variant_every_ms,
        idleVariantDurationMs: config.pet.idle_variant_duration_ms,
        sleepAfterMs: config.pet.sleep_after_ms,
        snoreAfterMs: config.pet.snore_after_ms,
      }
      : undefined,
  }
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
      const muyu_src = s.muyu_path ? convertFileSrc(s.muyu_path) : undefined
      const hammer_src = s.hammer_path ? convertFileSrc(s.hammer_path) : undefined
      const sprite_sheet_src = s.sprite_sheet_path ? convertFileSrc(s.sprite_sheet_path) : undefined
      return {
        ...s,
        muyu_src,
        hammer_src,
        sprite_sheet_src,
        skin: createWoodenFishSkinFromUrls({
          muyuSrc: muyu_src,
          hammerSrc: hammer_src,
          spriteSheetSrc: sprite_sheet_src,
          spriteSheet: mapSpriteSheetConfig(s.sprite_sheet),
        }),
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
