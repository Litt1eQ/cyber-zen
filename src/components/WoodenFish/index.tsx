import { motion } from 'framer-motion'
import { useMemo, useRef } from 'react'
import { ROSEWOOD_SKIN, type WoodenFishSkin } from './skins'
import { useWindowDragGesture } from '../../hooks/useWindowDragGesture'
import {
  getDefaultHammerStrikeKeyframes,
  getWoodenFishHitDurationSeconds,
  toStaticPose,
} from './motion'

const DRAG_THRESHOLD_PX = 8

export function WoodenFish({
  isAnimating,
  animationSpeed,
  onHit,
  windowScale,
  skin = ROSEWOOD_SKIN,
}: {
  isAnimating: boolean
  animationSpeed: number
  onHit: () => void
  windowScale: number
  skin?: WoodenFishSkin
}) {
  const duration = getWoodenFishHitDurationSeconds(animationSpeed)

  const size = useMemo(() => {
    const clamped = Math.max(50, Math.min(windowScale, 200))
    return Math.round((320 * clamped) / 100)
  }, [windowScale])

  const bodyCenter = skin.body.center ?? { x: 0.5, y: 0.56 }
  const bodyWidthRatio = skin.body.widthRatio ?? 0.92
  const bodyAspectRatio = skin.body.aspectRatio ?? 1

  const hammerWidthRatio = skin.hammer.widthRatio ?? 0.9
  const hammerPivot = skin.hammer.pivot ?? { x: 0.22, y: 0.72 }
  const hammerAnchor = skin.hammer.anchor
  const hammerCenter = skin.hammer.center ?? { x: 0.66, y: 0.28 }

  const bodyWidth = Math.max(1, Math.round(size * bodyWidthRatio))
  const bodyHeight = Math.max(1, Math.round(bodyWidth / Math.max(bodyAspectRatio, 0.01)))
  const hammerWidth = Math.max(1, Math.round(size * hammerWidthRatio))

  const dragGesture = useWindowDragGesture({ thresholdPx: DRAG_THRESHOLD_PX })

  const hitCooldownRef = useRef(false)

  const hammerRest = skin.hammer.rest ?? { rotate: 0, x: 0, y: 0 }
  const hammerStrike = skin.hammer.strike ?? getDefaultHammerStrikeKeyframes(hammerRest)
  const hammerX = (hammerAnchor ?? hammerCenter).x

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <motion.div
        className="relative cursor-pointer select-none flex items-center justify-center"
        style={{ width: size, height: size }}
        onPointerDown={dragGesture.onPointerDown}
        onPointerMove={dragGesture.onPointerMove}
        onPointerUp={(event) => {
          dragGesture.onPointerUp()
          if (event.button !== 0) return
          if (dragGesture.consumeIgnoreClick()) return
          if (hitCooldownRef.current) return

          // Avoid accidental double-hit on some platforms where click may fire twice.
          hitCooldownRef.current = true
          queueMicrotask(() => {
            hitCooldownRef.current = false
          })
          onHit()
        }}
        onPointerCancel={dragGesture.onPointerCancel}
        onPointerLeave={dragGesture.onPointerLeave}
        animate={isAnimating ? { scale: [1, 0.94, 1] } : { scale: 1 }}
        transition={{ duration, ease: [0.2, 0.9, 0.2, 1] }}
      >
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 select-none"
          style={{
            left: `${bodyCenter.x * 100}%`,
            top: `${bodyCenter.y * 100}%`,
            width: bodyWidth,
            height: bodyHeight,
          }}
        >
          <img
            src={skin.body.src}
            alt={skin.body.alt}
            width={bodyWidth}
            height={bodyHeight}
            draggable={false}
            className="select-none"
          />
        </div>

          <div
            className="absolute select-none"
            style={{
              left: `${hammerX * 100}%`,
              top: `${(hammerAnchor ?? hammerCenter).y * 100}%`,
              transform: hammerAnchor
                ? `translate(${-hammerPivot.x * 100}%, ${-hammerPivot.y * 100}%)`
                : 'translate(-50%, -50%)',
            }}
          >
            <motion.img
              src={skin.hammer.src}
              alt={skin.hammer.alt}
              width={hammerWidth}
              draggable={false}
              className="select-none"
              style={{
                width: hammerWidth,
                height: 'auto',
                transformOrigin: `${hammerPivot.x * 100}% ${hammerPivot.y * 100}%`,
              }}
              animate={isAnimating ? hammerStrike : toStaticPose(hammerRest)}
              transition={{
                duration: duration * 1.1,
                times: hammerStrike.times,
                ease: [0.2, 0.9, 0.2, 1],
              }}
            />
          </div>
      </motion.div>
    </div>
  )
}
