import { motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ROSEWOOD_SKIN, type WoodenFishSkin } from './skins'
import { useWindowDragGesture } from '../../hooks/useWindowDragGesture'
import { SpriteSheetCanvas } from '@/components/SpriteSheet/SpriteSheetCanvas'
import { useSpritePlayback } from './useSpritePlayback'
import {
  getDefaultHammerStrikeKeyframes,
  getWoodenFishHitDurationSeconds,
  toStaticPose,
} from './motion'

const DRAG_THRESHOLD_PX = 8

export function WoodenFish({
  isAnimating,
  hitSignal,
  animationSpeed,
  onHit,
  windowScale,
  skin = ROSEWOOD_SKIN,
  interactive = true,
  dragEnabled = true,
  dragHoldMs = 0,
  opacity = 1,
  windowHovered = false,
}: {
  isAnimating: boolean
  hitSignal?: number
  animationSpeed: number
  onHit: () => void
  windowScale: number
  skin?: WoodenFishSkin
  interactive?: boolean
  dragEnabled?: boolean
  dragHoldMs?: number
  opacity?: number
  windowHovered?: boolean
}) {
  const duration = getWoodenFishHitDurationSeconds(animationSpeed)
  const [spriteFailed, setSpriteFailed] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    setSpriteFailed(false)
  }, [skin.sprite_sheet?.src])

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

  const dragGesture = useWindowDragGesture({
    thresholdPx: DRAG_THRESHOLD_PX,
    enabled: interactive && dragEnabled,
    holdMs: dragHoldMs,
    onDragStateChange: setIsDragging,
  })

  const hitCooldownRef = useRef(false)

  const hammerRest = skin.hammer.rest ?? { rotate: 0, x: 0, y: 0 }
  const hammerStrike = skin.hammer.strike ?? getDefaultHammerStrikeKeyframes(hammerRest)
  const hammerX = (hammerAnchor ?? hammerCenter).x
  const spriteSheet = skin.sprite_sheet
  const useSpriteSheet = !!spriteSheet?.src && !spriteFailed
  const spritePlayback = useSpritePlayback({
    enabled: useSpriteSheet,
    hitSignal,
    isDragging,
    isHovered: windowHovered,
  })

  if (useSpriteSheet) {
    return (
      <div className="relative w-full h-full flex items-center justify-center">
        <div
          className={[
            'relative select-none flex items-center justify-center',
            interactive ? 'cursor-pointer' : 'cursor-default pointer-events-none',
          ].join(' ')}
          style={{ width: size, height: size, opacity }}
          onPointerDown={interactive ? dragGesture.onPointerDown : undefined}
          onPointerMove={interactive ? dragGesture.onPointerMove : undefined}
          onPointerUp={
            interactive
              ? (event) => {
                dragGesture.onPointerUp()
                if (event.button !== 0) return
                if (dragGesture.consumeIgnoreClick()) return
                if (hitCooldownRef.current) return

                hitCooldownRef.current = true
                queueMicrotask(() => {
                  hitCooldownRef.current = false
                })
                onHit()
              }
              : undefined
          }
          onPointerCancel={interactive ? dragGesture.onPointerCancel : undefined}
          onPointerLeave={interactive ? dragGesture.onPointerLeave : undefined}
        >
          <div className="absolute -translate-x-1/2 -translate-y-1/2 select-none" style={{ left: '50%', top: '50%' }}>
            <SpriteSheetCanvas
              src={spriteSheet!.src}
              size={size}
              columns={spriteSheet!.columns}
              rows={spriteSheet!.rows}
              cropOffsetX={spriteSheet!.cropOffsetX}
              cropOffsetY={spriteSheet!.cropOffsetY}
              mood="idle"
              rowIndex={spritePlayback.rowIndex}
              animate={spritePlayback.animate}
              frameIntervalMs={spritePlayback.frameIntervalMs}
              speed={animationSpeed}
              chromaKey={spriteSheet!.chromaKey ?? true}
              chromaKeyAlgorithm={spriteSheet!.chromaKeyAlgorithm ?? 'yuv'}
              chromaKeyOptions={spriteSheet!.chromaKeyOptions}
              imageSmoothingEnabled={spriteSheet!.imageSmoothingEnabled ?? true}
              removeGridLines={spriteSheet!.removeGridLines ?? true}
              idleBreathe={spriteSheet!.idleBreathe ?? true}
              effect="none"
              onError={() => setSpriteFailed(true)}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <motion.div
        className={[
          'relative select-none flex items-center justify-center',
          interactive ? 'cursor-pointer' : 'cursor-default pointer-events-none',
        ].join(' ')}
        style={{ width: size, height: size, opacity }}
        onPointerDown={interactive ? dragGesture.onPointerDown : undefined}
        onPointerMove={interactive ? dragGesture.onPointerMove : undefined}
        onPointerUp={
          interactive
            ? (event) => {
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
            }
            : undefined
        }
        onPointerCancel={interactive ? dragGesture.onPointerCancel : undefined}
        onPointerLeave={interactive ? dragGesture.onPointerLeave : undefined}
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
