function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2))
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function formatYmdLocal(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function drawMosaicPlaceholder({
  ctx,
  x,
  y,
  w,
  h,
  seed,
}: {
  ctx: CanvasRenderingContext2D
  x: number
  y: number
  w: number
  h: number
  seed: string
}) {
  const r = Math.max(6, Math.round(Math.min(w, h) * 0.22))
  ctx.save()
  roundRectPath(ctx, x, y, w, h, r)
  ctx.clip()

  ctx.fillStyle = 'rgba(15,23,42,0.06)'
  ctx.fillRect(x, y, w, h)

  // simple deterministic "noise" based on seed
  let s = 0
  for (let i = 0; i < seed.length; i += 1) s = (s * 31 + seed.charCodeAt(i)) >>> 0
  const rand = () => {
    // xorshift32
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 0xffffffff
  }

  const block = Math.max(6, Math.round(h * 0.32))
  const gap = Math.max(2, Math.round(block * 0.22))
  for (let yy = y + gap; yy < y + h - gap; yy += block + gap) {
    for (let xx = x + gap; xx < x + w - gap; xx += block + gap) {
      const a = 0.08 + rand() * 0.14
      ctx.fillStyle = `rgba(15,23,42,${a.toFixed(3)})`
      ctx.fillRect(xx, yy, block, block)
    }
  }
  ctx.restore()
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.decoding = 'async'
  img.loading = 'eager'
  img.crossOrigin = 'anonymous'
  img.src = src
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`))
  })
  return img
}

let logoImagePromise: Promise<HTMLImageElement> | null = null
async function getLogoImage(): Promise<HTMLImageElement> {
  if (!logoImagePromise) logoImagePromise = loadImage('/logo.png')
  return logoImagePromise
}

export { drawMosaicPlaceholder, formatYmdLocal, getLogoImage, roundRectPath }

