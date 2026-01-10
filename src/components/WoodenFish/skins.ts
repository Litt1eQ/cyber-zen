import rosewoodMuyu from '../../assets/rosewood/muyu.png'
import rosewoodHammer from '../../assets/rosewood/hammer.png'
import woodMuyu from '../../assets/wood/muyu.png'
import woodHammer from '../../assets/wood/hammer.png'

export type NormalizedPoint = { x: number; y: number }

export type HammerPose = { rotate: number; x?: number; y?: number }
export type HammerKeyframes = { rotate: number[]; x?: number[]; y?: number[]; times?: number[] }

export type WoodenFishSkin = {
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

export type WoodenFishSkinId = 'rosewood' | 'wood'

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

export const DEFAULT_WOODEN_FISH_SKIN_ID: WoodenFishSkinId = 'rosewood'

export const WOODEN_FISH_SKINS: Record<WoodenFishSkinId, WoodenFishSkin> = {
  rosewood: ROSEWOOD_SKIN,
  wood: WOOD_SKIN,
}
