import type { TargetAndTransition } from 'framer-motion'
import type { HammerKeyframes, HammerPose } from './skins'

const HIT_BASE_DURATION_S = 0.26
const MIN_ANIMATION_SPEED = 0.2

export function getWoodenFishHitDurationSeconds(animationSpeed: number) {
  return HIT_BASE_DURATION_S / Math.max(animationSpeed, MIN_ANIMATION_SPEED)
}

export function getWoodenFishHitTimeoutMs(animationSpeed: number) {
  // Slightly longer than the motion duration to avoid interrupting keyframes.
  return Math.ceil(getWoodenFishHitDurationSeconds(animationSpeed) * 1000 * 1.2)
}

export function getDefaultHammerStrikeKeyframes(rest: HammerPose): HammerKeyframes {
  const restX = rest.x ?? 0
  const restY = rest.y ?? 0

  return {
    rotate: [rest.rotate, rest.rotate - 34, rest.rotate + 20, rest.rotate - 8, rest.rotate],
    x: [restX, restX - 2, restX - 4, restX - 2, restX],
    y: [restY, restY - 6, restY + 10, restY + 3, restY],
    times: [0, 0.22, 0.55, 0.82, 1],
  }
}

export function toStaticPose(pose: HammerPose): TargetAndTransition {
  return { rotate: pose.rotate, x: pose.x ?? 0, y: pose.y ?? 0 }
}
