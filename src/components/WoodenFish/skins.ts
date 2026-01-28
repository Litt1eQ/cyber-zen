import rosewoodMuyu from '../../assets/rosewood/muyu.png'
import rosewoodHammer from '../../assets/rosewood/hammer.png'
import woodMuyu from '../../assets/wood/muyu.png'
import woodHammer from '../../assets/wood/hammer.png'
import type { ChromaKeyAlgorithm, ChromaKeyOptions, CustomMood } from '@/sprites/spriteCore'

export type NormalizedPoint = { x: number; y: number }

export type HammerPose = { rotate: number; x?: number; y?: number }
export type HammerKeyframes = { rotate: number[]; x?: number[]; y?: number[]; times?: number[] }

export type WoodenFishSkin = {
  sprite_sheet?: WoodenFishSpriteSheet
  body: {
    src: string
    alt: string
    center?: NormalizedPoint
    widthRatio?: number
    // width / height
    aspectRatio?: number
  }
  hammer: {
    src: string
    alt: string
    // Legacy positioning: normalized center point of the hammer image in the container.
    center?: NormalizedPoint
    // Preferred positioning: normalized anchor point of the hammer pivot in the container.
    anchor?: NormalizedPoint
    widthRatio?: number
    // width / height
    aspectRatio?: number
    pivot?: NormalizedPoint
    rest?: HammerPose
    strike?: HammerKeyframes
  }
}

export type WoodenFishSpriteSheet = {
  /** A complete 8x7 sheet for rendering a full animated character instead of the composited PNGs. */
  src: string
  mode?: 'replace' | 'overlay'
  columns?: number
  rows?: number
  chromaKey?: boolean
  chromaKeyAlgorithm?: ChromaKeyAlgorithm
  chromaKeyOptions?: ChromaKeyOptions
  removeGridLines?: boolean
  imageSmoothingEnabled?: boolean
  idleBreathe?: boolean
  behavior?: 'simple' | 'pet'
  idleMood?: CustomMood
  hitMood?: CustomMood
  pet?: {
    hitMoods?: CustomMood[]
    idleVariants?: CustomMood[]
    idleVariantEveryMs?: number
    idleVariantDurationMs?: number
    sleepAfterMs?: number
    snoreAfterMs?: number
  }
}

export type BuiltinWoodenFishSkinId = 'rosewood' | 'wood'
export type WoodenFishSkinId = BuiltinWoodenFishSkinId | `custom:${string}`

export const DEFAULT_WOODEN_FISH_SKIN_LAYOUT: Pick<WoodenFishSkin, 'body' | 'hammer'> = {
  body: {
    alt: '木鱼',
    center: { x: 0.5, y: 0.52 },
    widthRatio: 0.75,
    aspectRatio: 10 / 7,
    src: '',
  },
  hammer: {
    alt: '木鱼锤',
    anchor: { x: 0.72, y: 0.22 },
    widthRatio: 0.95,
    aspectRatio: 10 / 3,
    pivot: { x: 0.95, y: 0.76 },
    rest: { rotate: -6, x: 0, y: 0 },
    src: '',
  },
}

export function createWoodenFishSkinFromUrls(params: {
  muyuSrc?: string
  hammerSrc?: string
  spriteSheetSrc?: string
  spriteSheet?: Partial<Omit<WoodenFishSpriteSheet, 'src'>>
  bodyAlt?: string
  hammerAlt?: string
}): WoodenFishSkin {
  const spriteDefaults: Omit<WoodenFishSpriteSheet, 'src'> = {
    mode: 'replace',
    columns: 8,
    rows: 7,
    chromaKey: true,
    chromaKeyAlgorithm: 'yuv',
    chromaKeyOptions: { similarity: 0.42, smoothness: 0.1, spill: 0.28 },
    removeGridLines: true,
    imageSmoothingEnabled: true,
    idleBreathe: true,
    behavior: 'pet',
    idleMood: 'idle',
    hitMood: 'excited',
    pet: {
      hitMoods: ['excited', 'celebrate', 'happy', 'love'],
      idleVariants: ['happy', 'love', 'working', 'shy', 'surprised'],
      idleVariantEveryMs: 16000,
      idleVariantDurationMs: 2200,
      sleepAfterMs: 65000,
      snoreAfterMs: 180000,
    },
  }

  return {
    sprite_sheet: params.spriteSheetSrc
      ? {
        src: params.spriteSheetSrc,
        ...spriteDefaults,
        ...params.spriteSheet,
        pet: {
          ...spriteDefaults.pet,
          ...(params.spriteSheet?.pet ?? {}),
        },
      }
      : undefined,
    body: {
      ...DEFAULT_WOODEN_FISH_SKIN_LAYOUT.body,
      src: params.muyuSrc && params.muyuSrc.length > 0 ? params.muyuSrc : rosewoodMuyu,
      alt: params.bodyAlt ?? DEFAULT_WOODEN_FISH_SKIN_LAYOUT.body.alt,
    },
    hammer: {
      ...DEFAULT_WOODEN_FISH_SKIN_LAYOUT.hammer,
      src: params.hammerSrc && params.hammerSrc.length > 0 ? params.hammerSrc : rosewoodHammer,
      alt: params.hammerAlt ?? DEFAULT_WOODEN_FISH_SKIN_LAYOUT.hammer.alt,
    },
  }
}

export const ROSEWOOD_SKIN: WoodenFishSkin = {
  body: {
    src: rosewoodMuyu,
    alt: '木鱼',
    center: { x: 0.5, y: 0.52 },
    widthRatio: 0.75,
    aspectRatio: 10 / 7,
  },
  hammer: {
    src: rosewoodHammer,
    alt: '木鱼锤',
    // Pivot at the handle end, like a real hand-held strike.
    anchor: { x: 0.72, y: 0.22 },
    widthRatio: 0.95,
    aspectRatio: 10 / 3,
    pivot: { x: 0.95, y: 0.76 },
    rest: { rotate: -6, x: 0, y: 0 },
  },
}

export const WOOD_SKIN: WoodenFishSkin = {
  body: {
    src: woodMuyu,
    alt: '木鱼',
    center: { x: 0.5, y: 0.52 },
    widthRatio: 0.75,
    aspectRatio: 10 / 7,
  },
  hammer: {
    src: woodHammer,
    alt: '木鱼锤',
    anchor: { x: 0.72, y: 0.22 },
    widthRatio: 0.95,
    aspectRatio: 10 / 3,
    pivot: { x: 0.95, y: 0.76 },
    rest: { rotate: -6, x: 0, y: 0 },
  },
}

export const DEFAULT_WOODEN_FISH_SKIN_ID: BuiltinWoodenFishSkinId = 'rosewood'

export const WOODEN_FISH_SKINS: Record<BuiltinWoodenFishSkinId, WoodenFishSkin> = {
  rosewood: ROSEWOOD_SKIN,
  wood: WOOD_SKIN,
}
