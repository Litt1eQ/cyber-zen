import { motion } from 'framer-motion'
import type { InputEvent } from '../../types/merit'

const LIFTOFF_PX = 92
const DEFAULT_MERIT_LABEL = '功德'
const DEFAULT_MERIT_ALPHA = 0.82
const STROKE_ALPHA_RATIO = 0.26 / DEFAULT_MERIT_ALPHA
const GLOW_ALPHA_RATIO = 0.28 / DEFAULT_MERIT_ALPHA
const OUTLINE_ALPHA_RATIO = 0.62 / DEFAULT_MERIT_ALPHA

export function MeritPop({
  x,
  y,
  value,
  source,
  scale = 1,
  labelText = DEFAULT_MERIT_LABEL,
  opacity = DEFAULT_MERIT_ALPHA,
  lite = false,
}: {
  x: number
  y: number
  value: number
  source?: InputEvent['source']
  scale?: number
  labelText?: string
  opacity?: number
  lite?: boolean
}) {
  const baseLabel = (() => {
    const trimmed = labelText.trim()
    const truncated = Array.from(trimmed).slice(0, 4).join('')
    return truncated.length > 0 ? truncated : DEFAULT_MERIT_LABEL
  })()
  const label = `${baseLabel}+${value}`
  const a = clamp01(opacity)
  const fillColor = `rgba(255, 242, 214, ${a})`
  const strokeColor = `rgba(255, 226, 150, ${a * STROKE_ALPHA_RATIO})`
  const outlineColor = `rgba(10, 8, 6, ${clamp01(a * OUTLINE_ALPHA_RATIO)})`
  const glowHighlight = `rgba(255, 214, 102, ${a * GLOW_ALPHA_RATIO})`
  const glowTransparent = `rgba(255, 214, 102, 0)`
  const textGlowShadow = `rgba(255, 214, 102, ${a * GLOW_ALPHA_RATIO})`
  const driftX = 0
  const driftY = LIFTOFF_PX * scale
  const popScale = 1.0
  const sourceAccentGlow =
    source === 'keyboard'
      ? 'rgba(120,255,214,0.14)'
      : 'rgba(255,214,102,0.10)'
  const fontSizePx = Math.round(36 * scale)
  const strokeWidthPx = Math.max(1, Math.round(1.35 * scale))
  const outlineWidthPx = Math.max(1, Math.round(2.25 * scale))
  const outlineShadow = createOutlineShadow(outlineWidthPx, outlineColor)

  return (
    <div
      className="pointer-events-none select-none"
      style={{ position: 'absolute', left: x, top: y, transform: 'translate(-50%, -50%)' }}
    >
      <motion.div
        initial={lite ? { opacity: 0, x: 0, y: 0, scale: 1 } : { opacity: 0, x: 0, y: 0, scale: 0.98 }}
        animate={lite ? { opacity: 1, x: driftX, y: -driftY, scale: 1 } : { opacity: 1, x: driftX, y: -driftY, scale: popScale }}
        exit={lite ? { opacity: 0, x: driftX, y: -driftY - 18 * scale, scale: 1 } : { opacity: 0, x: driftX, y: -driftY - 18 * scale, scale: popScale + 0.06 }}
        transition={{ duration: 1.08, ease: [0.2, 0.9, 0.2, 1] }}
        className="relative"
        style={{ willChange: 'transform, opacity' }}
      >
        {!lite ? (
          <motion.div
            className="absolute inset-0 rounded-full"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 0.7, scale: 1.25 }}
            exit={{ opacity: 0, scale: 1.55 }}
            transition={{ duration: 1.05, ease: 'easeOut' }}
            style={{
              background:
                `radial-gradient(circle at center, ${glowHighlight}, ${sourceAccentGlow} 32%, ${glowTransparent} 65%)`,
              filter: 'blur(1px)',
            }}
          />
        ) : null}

        <div
          className="relative leading-none font-black tracking-[0.04em] whitespace-nowrap"
          style={{
            fontFamily:
              '"SF Pro Rounded","PingFang SC","Hiragino Sans GB","Noto Sans CJK SC",system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
            color: fillColor,
            fontSize: `${fontSizePx}px`,
            WebkitTextStroke: `${strokeWidthPx}px ${strokeColor}`,
            textShadow:
              [
                outlineShadow,
                lite ? '' : `0 0 26px ${textGlowShadow}`,
                lite ? '' : '0 18px 42px rgba(0,0,0,0.28)',
              ].filter(Boolean).join(', '),
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </div>
      </motion.div>
    </div>
  )
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function createOutlineShadow(widthPx: number, color: string) {
  const w = Math.max(1, Math.round(widthPx))
  const parts: string[] = []
  for (const dx of [-w, 0, w]) {
    for (const dy of [-w, 0, w]) {
      if (dx === 0 && dy === 0) continue
      parts.push(`${dx}px ${dy}px 0 ${color}`)
    }
  }
  parts.push(`0 0 ${Math.max(2, Math.round(w * 1.4))}px ${color}`)
  return parts.join(', ')
}
