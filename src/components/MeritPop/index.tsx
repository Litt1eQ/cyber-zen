import { motion } from 'framer-motion'
import type { InputEvent } from '../../types/merit'

const LIFTOFF_PX = 92

export function MeritPop({
  x,
  y,
  value,
  source,
  scale = 1,
}: {
  x: number
  y: number
  value: number
  source?: InputEvent['source']
  scale?: number
}) {
  const label = `功德+${value}`
  const driftX = 0
  const driftY = LIFTOFF_PX * scale
  const popScale = 1.0
  const glow =
    source === 'keyboard'
      ? 'rgba(120,255,214,0.22)'
      : 'rgba(255,214,102,0.22)'

  return (
    <div
      className="pointer-events-none select-none"
      style={{ position: 'absolute', left: x, top: y, transform: 'translate(-50%, -50%)' }}
    >
      <motion.div
        initial={{ opacity: 0, x: 0, y: 0, scale: 0.98, filter: 'blur(2px)' }}
        animate={{ opacity: 1, x: driftX, y: -driftY, scale: popScale, filter: 'blur(0px)' }}
        exit={{ opacity: 0, x: driftX, y: -driftY - 18 * scale, scale: popScale + 0.06, filter: 'blur(2px)' }}
        transition={{ duration: 1.08, ease: [0.2, 0.9, 0.2, 1] }}
        className="relative"
      >
        <motion.div
          className="absolute inset-0 rounded-full"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 0.7, scale: 1.25 }}
          exit={{ opacity: 0, scale: 1.55 }}
          transition={{ duration: 1.05, ease: 'easeOut' }}
          style={{
            background:
              `radial-gradient(circle at center, ${glow}, rgba(255,214,102,0.0) 65%)`,
            filter: 'blur(1px)',
          }}
        />

        <div
          className="relative leading-none font-black tracking-[0.10em] whitespace-nowrap"
          style={{
            fontFamily:
              '"SF Pro Rounded","PingFang SC","Hiragino Sans GB","Noto Sans CJK SC",system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
            color: 'rgba(255, 222, 160, 0.82)',
            fontSize: `${Math.round(36 * scale)}px`,
            WebkitTextStroke: `${Math.max(0.5, 1 * scale)}px rgba(255,236,180,0.26)`,
            textShadow:
              '0 0 30px rgba(255,214,102,0.28), 0 18px 40px rgba(0,0,0,0.18)',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </div>
      </motion.div>
    </div>
  )
}
