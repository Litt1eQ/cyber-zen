import { useEffect, useRef, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'

import { drawFrameToCanvas } from '@/sprites/spriteAnimation'
import type { ProcessedSpriteSheet } from '@/sprites/spriteStudio'

function checkerboardStyle(size = 10): CSSProperties {
  return {
    backgroundImage: `linear-gradient(45deg, rgba(148,163,184,.35) 25%, transparent 25%), linear-gradient(-45deg, rgba(148,163,184,.35) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(148,163,184,.35) 75%), linear-gradient(-45deg, transparent 75%, rgba(148,163,184,.35) 75%)`,
    backgroundSize: `${size}px ${size}px`,
    backgroundPosition: `0 0, 0 ${size / 2}px, ${size / 2}px -${size / 2}px, -${size / 2}px 0px`,
  }
}

function ProcessedSpriteFrameCanvas({
  processed,
  cellIndex,
  size,
  imageSmoothingEnabled,
  ariaLabel,
}: {
  processed: ProcessedSpriteSheet
  cellIndex: number
  size: number
  imageSmoothingEnabled: boolean
  ariaLabel?: string
}) {
  const ref = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const idx = Math.max(0, Math.floor(cellIndex))
    const cols = Math.max(1, processed.columns)
    const fx = idx % cols
    const rowIndex = Math.floor(idx / cols)
    drawFrameToCanvas({
      canvas,
      sheet: processed.sheet,
      frameWidth: processed.frameWidth,
      frameHeight: processed.frameHeight,
      frameIndex: fx,
      rowIndex,
      size,
      columns: processed.columns,
      imageSmoothingEnabled,
    })
  }, [cellIndex, imageSmoothingEnabled, processed, size])

  return <canvas ref={ref} aria-label={ariaLabel} />
}

export function ProcessedSpriteFramesPreview({
  processed,
  imageSmoothingEnabled,
  columns,
  rows,
  selectedIndex,
  onSelectIndex,
  size = 54,
}: {
  processed: ProcessedSpriteSheet
  imageSmoothingEnabled: boolean
  columns: number
  rows: number
  selectedIndex: number
  onSelectIndex: (index: number) => void
  size?: number
}) {
  const { t } = useTranslation()
  const cols = Math.max(1, Math.floor(columns))
  const rowCount = Math.max(1, Math.floor(rows))
  const totalFrames = cols * rowCount

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {Array.from({ length: totalFrames }).map((_, i) => (
        <button
          key={i}
          type="button"
          className={[
            'relative rounded-md border transition-colors overflow-hidden',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
            selectedIndex === i
              ? 'border-blue-300 bg-blue-50'
              : 'border-slate-200/60 bg-white hover:border-slate-300',
          ].join(' ')}
          style={{ aspectRatio: '1 / 1', ...checkerboardStyle(10) }}
          onClick={() => onSelectIndex(i)}
          aria-label={t('settings.skins.studio.pickFrameAria', { index: i + 1 })}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <ProcessedSpriteFrameCanvas
              processed={processed}
              cellIndex={i}
              size={size}
              imageSmoothingEnabled={imageSmoothingEnabled}
            />
          </div>
        </button>
      ))}
    </div>
  )
}
