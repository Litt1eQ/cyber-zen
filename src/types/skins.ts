export type CustomWoodenFishSkin = {
  id: `custom:${string}`
  name: string
  muyu_path?: string
  hammer_path?: string
  sprite_sheet_path?: string
  sprite_sheet?: {
    file?: string
    mode?: 'replace' | 'overlay'
    columns?: number
    rows?: number
    chroma_key?: boolean
    chroma_key_algorithm?: 'classic' | 'yuv' | 'hsl' | 'aggressive'
    chroma_key_options?: {
      similarity?: number
      smoothness?: number
      spill?: number
      key_color?: { r: number; g: number; b: number }
    }
    remove_grid_lines?: boolean
    image_smoothing_enabled?: boolean
    idle_breathe?: boolean
    behavior?: 'simple' | 'pet'
    idle_mood?: string
    hit_mood?: string
    pet?: {
      hit_moods?: string[]
      idle_variants?: string[]
      idle_variant_every_ms?: number
      idle_variant_duration_ms?: number
      sleep_after_ms?: number
      snore_after_ms?: number
    }
  }
  created_at_ms: number
}
