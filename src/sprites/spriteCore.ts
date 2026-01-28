/**
 * Sprite-sheet pipeline utilities (8x7 by default):
 * - Validation (dimensions + aspect ratio)
 * - Mood → row mapping + per-mood timing
 * - Chroma key (magenta background removal)
 * - Optional seam/grid-line removal
 *
 * Adapted from a reference implementation to be framework-agnostic and reusable.
 */

export const SPRITE_FRAMES_PER_ROW = 8
export const SPRITE_ROWS = 7
export const SPRITE_ASPECT_RATIO = SPRITE_FRAMES_PER_ROW / SPRITE_ROWS // ≈ 1.1429
export const SPRITE_ASPECT_RATIO_TOLERANCE = 0.15
export const SPRITE_MIN_FRAME_SIZE_PX = 32

export type ChromaKeyAlgorithm = 'classic' | 'yuv' | 'hsl' | 'aggressive'

export interface ChromaKeyOptions {
  keyColor?: { r: number; g: number; b: number }
  similarity?: number
  smoothness?: number
  spill?: number
}

export type CustomMood =
  | 'idle'
  | 'happy'
  | 'love'
  | 'excited'
  | 'celebrate'
  | 'sleepy'
  | 'snoring'
  | 'working'
  | 'angry'
  | 'surprised'
  | 'shy'
  | 'dragging'

export type SpriteMood = CustomMood

export interface SpriteValidationResult {
  valid: boolean
  error?: string
  width?: number
  height?: number
  aspectRatio?: number
  frameWidth?: number
  frameHeight?: number
}

export function validateSpriteImageDimensions(
  width: number,
  height: number,
  columns: number = SPRITE_FRAMES_PER_ROW,
  rows: number = SPRITE_ROWS
): SpriteValidationResult {
  if (width <= 0 || height <= 0) {
    return { valid: false, error: 'Invalid image dimensions.', width, height }
  }

  const detectedFrameWidth = Math.floor(width / columns)
  const detectedFrameHeight = Math.floor(height / rows)

  const minWidth = columns * SPRITE_MIN_FRAME_SIZE_PX
  const minHeight = rows * SPRITE_MIN_FRAME_SIZE_PX
  if (width < minWidth || height < minHeight) {
    return {
      valid: false,
      error: `Image is too small. Minimum size is ${minWidth}x${minHeight}px (${SPRITE_MIN_FRAME_SIZE_PX}px per frame). Your image is ${width}x${height}px.`,
      width,
      height,
      frameWidth: detectedFrameWidth,
      frameHeight: detectedFrameHeight,
    }
  }

  const aspectRatio = width / height
  const expectedAspectRatio = columns / rows
  const ratioDiff = Math.abs(aspectRatio / expectedAspectRatio - 1)

  if (ratioDiff > SPRITE_ASPECT_RATIO_TOLERANCE) {
    return {
      valid: false,
      error: `Invalid aspect ratio. Expected ${columns}:${rows} (≈${expectedAspectRatio.toFixed(4)}), got ${aspectRatio.toFixed(4)} from ${width}x${height}px.`,
      width,
      height,
      aspectRatio,
      frameWidth: detectedFrameWidth,
      frameHeight: detectedFrameHeight,
    }
  }

  return {
    valid: true,
    width,
    height,
    aspectRatio,
    frameWidth: detectedFrameWidth,
    frameHeight: detectedFrameHeight,
  }
}

export function customMoodToRowIndex(mood: CustomMood): number {
  switch (mood) {
    case 'idle':
      return 0
    case 'happy':
    case 'love':
      return 1
    case 'excited':
    case 'celebrate':
      return 2
    case 'sleepy':
    case 'snoring':
      return 3
    case 'working':
      return 4
    case 'angry':
    case 'surprised':
    case 'shy':
      return 5
    case 'dragging':
      return 6
    default:
      return 0
  }
}

export function customMoodToFrameIntervalMs(mood: CustomMood): number {
  switch (mood) {
    case 'excited':
    case 'celebrate':
    case 'dragging':
      return 90
    case 'working':
    case 'happy':
    case 'love':
    case 'angry':
    case 'surprised':
    case 'shy':
      return 120
    case 'sleepy':
    case 'snoring':
      return 180
    case 'idle':
    default:
      return 140
  }
}

/**
 * Optional cleanup: remove visible grid/seam lines between frames (after chroma keying).
 * This targets thin opaque lines exactly on frame boundaries and makes them transparent.
 */
export function removeGridLines(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  cols: number,
  rows: number
): boolean {
  const frameW = Math.round(width / cols)
  const frameH = Math.round(height / rows)
  if (frameW <= 0 || frameH <= 0) return false

  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data

  const bgAlphaMax = 16
  const lineAlphaMin = 48
  const minCoverage = 0.35
  const neighborhood = 2

  const alphaAt = (x: number, y: number): number => data[(y * width + x) * 4 + 3]

  const isLinePixelVertical = (x: number, y: number): boolean => {
    const a = alphaAt(x, y)
    if (a < lineAlphaMin) return false
    if (x <= 0 || x >= width - 1) return false
    return alphaAt(x - 1, y) <= bgAlphaMax && alphaAt(x + 1, y) <= bgAlphaMax
  }

  const isLinePixelHorizontal = (x: number, y: number): boolean => {
    const a = alphaAt(x, y)
    if (a < lineAlphaMin) return false
    if (y <= 0 || y >= height - 1) return false
    return alphaAt(x, y - 1) <= bgAlphaMax && alphaAt(x, y + 1) <= bgAlphaMax
  }

  const columnCoverage = (x: number): number => {
    let hits = 0
    for (let y = 1; y < height - 1; y++) {
      if (isLinePixelVertical(x, y)) hits++
    }
    return hits / Math.max(1, height - 2)
  }

  const rowCoverage = (y: number): number => {
    let hits = 0
    for (let x = 1; x < width - 1; x++) {
      if (isLinePixelHorizontal(x, y)) hits++
    }
    return hits / Math.max(1, width - 2)
  }

  let removed = 0

  for (let c = 1; c < cols; c++) {
    const seamX = c * frameW
    const candidates: number[] = []
    for (let dx = -neighborhood; dx <= neighborhood; dx++) {
      const x = seamX + dx
      if (x > 0 && x < width - 1) candidates.push(x)
    }
    const coverages = candidates.map((x) => ({ x, coverage: columnCoverage(x) }))
    const best = coverages.reduce(
      (acc, cur) => (cur.coverage > acc.coverage ? cur : acc),
      { x: seamX, coverage: 0 }
    )
    if (best.coverage < minCoverage) continue

    const activeColumns = coverages
      .filter((c2) => c2.coverage >= best.coverage * 0.7 && c2.coverage >= minCoverage * 0.7)
      .map((c2) => c2.x)

    for (const x of activeColumns) {
      for (let y = 1; y < height - 1; y++) {
        if (!isLinePixelVertical(x, y)) continue
        const idx = (y * width + x) * 4
        if (data[idx + 3] !== 0) removed++
        data[idx + 3] = 0
      }
    }
  }

  for (let r = 1; r < rows; r++) {
    const seamY = r * frameH
    const candidates: number[] = []
    for (let dy = -neighborhood; dy <= neighborhood; dy++) {
      const y = seamY + dy
      if (y > 0 && y < height - 1) candidates.push(y)
    }
    const coverages = candidates.map((y) => ({ y, coverage: rowCoverage(y) }))
    const best = coverages.reduce(
      (acc, cur) => (cur.coverage > acc.coverage ? cur : acc),
      { y: seamY, coverage: 0 }
    )
    if (best.coverage < minCoverage) continue

    const activeRows = coverages
      .filter((r2) => r2.coverage >= best.coverage * 0.7 && r2.coverage >= minCoverage * 0.7)
      .map((r2) => r2.y)

    for (const y of activeRows) {
      for (let x = 1; x < width - 1; x++) {
        if (!isLinePixelHorizontal(x, y)) continue
        const idx = (y * width + x) * 4
        if (data[idx + 3] !== 0) removed++
        data[idx + 3] = 0
      }
    }
  }

  if (removed === 0) return false
  ctx.putImageData(imageData, 0, 0)
  return true
}

// -------------------------
// Chroma key implementation
// -------------------------

function rgbToUV(r: number, g: number, b: number): [number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const u = rn * -0.169 + gn * -0.331 + bn * 0.5 + 0.5
  const v = rn * 0.5 + gn * -0.419 + bn * -0.081 + 0.5
  return [u, v]
}

function chromaDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const [u1, v1] = rgbToUV(r1, g1, b1)
  const [u2, v2] = rgbToUV(r2, g2, b2)
  const du = u1 - u2
  const dv = v1 - v2
  return Math.sqrt(du * du + dv * dv)
}

function detectKeyColor(
  data: Uint8ClampedArray,
  width: number,
  height: number
): { r: number; g: number; b: number; mode: 'magenta' | 'red' | 'unknown' } {
  const borderPixels: { r: number; g: number; b: number }[] = []

  const sampleBorder = (x: number, y: number): void => {
    const i = (y * width + x) * 4
    const a = data[i + 3]
    if (a < 128) return
    borderPixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] })
  }

  const sampleStepX = Math.max(1, Math.floor(width / 128))
  for (let x = 0; x < width; x += sampleStepX) {
    sampleBorder(x, 0)
    sampleBorder(x, 1)
    sampleBorder(x, height - 1)
    sampleBorder(x, height - 2)
  }

  const sampleStepY = Math.max(1, Math.floor(height / 128))
  for (let y = 0; y < height; y += sampleStepY) {
    sampleBorder(0, y)
    sampleBorder(1, y)
    sampleBorder(width - 1, y)
    sampleBorder(width - 2, y)
  }

  for (let dx = 0; dx < 5; dx++) {
    for (let dy = 0; dy < 5; dy++) {
      sampleBorder(dx, dy)
      sampleBorder(width - 1 - dx, dy)
      sampleBorder(dx, height - 1 - dy)
      sampleBorder(width - 1 - dx, height - 1 - dy)
    }
  }

  if (borderPixels.length === 0) return { r: 255, g: 0, b: 255, mode: 'magenta' }

  let magentaCount = 0
  let magentaR = 0,
    magentaG = 0,
    magentaB = 0
  let redCount = 0
  let redR = 0,
    redG = 0,
    redB = 0

  for (const { r, g, b } of borderPixels) {
    const minRB = Math.min(r, b)
    const magentaDominance = minRB - g
    const redDominance = r - Math.max(g, b)

    const isMagentaLike =
      (magentaDominance > 30 && r > 70 && b > 70) ||
      (r > g + 40 && b > g + 20 && r > 80 && b > 50) ||
      (b > g + 40 && r > g + 20 && b > 80 && r > 50) ||
      (r > 180 && b > 180 && g < 100) ||
      (r > 150 && b > 150 && g < r * 0.5 && g < b * 0.5)

    if (isMagentaLike) {
      magentaCount++
      magentaR += r
      magentaG += g
      magentaB += b
    } else if (redDominance > 50 && r > 100) {
      redCount++
      redR += r
      redG += g
      redB += b
    }
  }

  if (magentaCount > redCount && magentaCount > 2) {
    return {
      r: Math.round(magentaR / magentaCount),
      g: Math.round(magentaG / magentaCount),
      b: Math.round(magentaB / magentaCount),
      mode: 'magenta',
    }
  }

  if (redCount > 4) {
    return {
      r: Math.round(redR / redCount),
      g: Math.round(redG / redCount),
      b: Math.round(redB / redCount),
      mode: 'red',
    }
  }

  if (magentaCount > 0) {
    return {
      r: Math.round(magentaR / magentaCount),
      g: Math.round(magentaG / magentaCount),
      b: Math.round(magentaB / magentaCount),
      mode: 'magenta',
    }
  }

  return { r: 255, g: 0, b: 255, mode: 'unknown' }
}

function computeDistanceField(bgMask: Uint8Array, width: number, height: number, maxDist: number): Uint8Array {
  const pixelCount = width * height
  const dist = new Uint8Array(pixelCount)
  dist.fill(255)

  const queue: number[] = []
  for (let p = 0; p < pixelCount; p++) {
    if (!bgMask[p]) continue
    dist[p] = 0
    queue.push(p)
  }

  let head = 0
  while (head < queue.length) {
    const p = queue[head++]
    const d = dist[p]
    if (d >= maxDist) continue

    const x = p % width
    const y = (p / width) | 0
    const newDist = d + 1

    const tryNeighbor = (np: number): void => {
      if (dist[np] > newDist) {
        dist[np] = newDist
        queue.push(np)
      }
    }

    if (x > 0) tryNeighbor(p - 1)
    if (x < width - 1) tryNeighbor(p + 1)
    if (y > 0) tryNeighbor(p - width)
    if (y < height - 1) tryNeighbor(p + width)
  }

  return dist
}

function despillMagenta(r: number, g: number, b: number, strength: number): [number, number, number] {
  const minRB = Math.min(r, b)
  const magentaAmount = Math.max(0, minRB - g)
  if (magentaAmount <= 0) return [r, g, b]
  const reduction = magentaAmount * strength
  const newR = Math.max(g, r - reduction)
  const newB = Math.max(g, b - reduction)
  return [Math.round(newR), g, Math.round(newB)]
}

function applyChromaKeyYUV(ctx: CanvasRenderingContext2D, width: number, height: number, options: ChromaKeyOptions = {}): void {
  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data

  const detectedColor = detectKeyColor(data, width, height)
  const keyColor = options.keyColor ?? detectedColor
  const keyR = keyColor.r
  const keyG = keyColor.g
  const keyB = keyColor.b
  const isMagentaKey = detectedColor.mode === 'magenta' || (keyR > keyG + 50 && keyB > keyG + 50)

  const similarity = options.similarity ?? 0.4
  const smoothness = options.smoothness ?? 0.12
  const spill = options.spill ?? 0.15

  const pixelCount = width * height
  const bgMask = new Uint8Array(pixelCount)

  const [keyU, keyV] = rgbToUV(keyR, keyG, keyB)
  const keyMagentaDominance = Math.max(0, Math.min(keyR, keyB) - keyG)

  const isBgCandidate = (p: number): boolean => {
    const i = p * 4
    const a = data[i + 3]
    if (a < 16) return true

    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]

    const [u, v] = rgbToUV(r, g, b)
    const du = u - keyU
    const dv = v - keyV
    const dist = Math.sqrt(du * du + dv * dv)

    if (dist < similarity * 0.5) return true

    if (isMagentaKey) {
      const magentaDominance = Math.min(r, b) - g
      if (magentaDominance > keyMagentaDominance * 0.3 && magentaDominance > 40) {
        const rDiff = Math.abs(r - keyR)
        const bDiff = Math.abs(b - keyB)
        if (rDiff < 80 && bDiff < 80) return true
      }
    }

    return false
  }

  const queue: number[] = []
  let head = 0

  const trySeed = (p: number): void => {
    if (bgMask[p]) return
    if (!isBgCandidate(p)) return
    bgMask[p] = 1
    queue.push(p)
  }

  for (let x = 0; x < width; x++) {
    trySeed(x)
    trySeed((height - 1) * width + x)
  }
  for (let y = 0; y < height; y++) {
    trySeed(y * width)
    trySeed(y * width + (width - 1))
  }

  while (head < queue.length) {
    const p = queue[head++]
    const x = p % width
    const y = (p / width) | 0
    if (x > 0) trySeed(p - 1)
    if (x < width - 1) trySeed(p + 1)
    if (y > 0) trySeed(p - width)
    if (y < height - 1) trySeed(p + width)
  }

  const edgeRadius = 6
  const distField = computeDistanceField(bgMask, width, height, edgeRadius)

  for (let p = 0; p < pixelCount; p++) {
    const i = p * 4
    const originalAlpha = data[i + 3]

    if (bgMask[p]) {
      data[i + 3] = 0
      continue
    }
    if (originalAlpha === 0) continue

    let r = data[i]
    let g = data[i + 1]
    let b = data[i + 2]

    const distToBg = distField[p]

    const magentaDominance = Math.min(r, b) - g

    if (distToBg <= edgeRadius) {
      const distFactor = distToBg / edgeRadius
      const cdist = chromaDistance(r, g, b, keyR, keyG, keyB)
      const baseMask = cdist - similarity * 0.2 * (1 + distFactor * 0.5)
      const alpha =
        smoothness > 0
          ? Math.pow(Math.max(0, Math.min(1, baseMask / (smoothness * (0.4 + distFactor * 0.6)))), 1.5)
          : baseMask > 0
            ? 1
            : 0

      if (alpha < 0.02) {
        data[i + 3] = 0
        continue
      }

      const alphaFalloff = distToBg === 1 ? alpha : Math.min(1, alpha + distFactor * 0.2)
      const newAlpha = Math.round(originalAlpha * alphaFalloff)
      data[i + 3] = newAlpha < 8 ? 0 : newAlpha
      if (data[i + 3] === 0) continue

      if (isMagentaKey && magentaDominance > 0) {
        const despillStrength = spill * (1.5 - distFactor * 0.5) * Math.min(1, magentaDominance / 60)
        ;[r, g, b] = despillMagenta(r, g, b, despillStrength)
        data[i] = r
        data[i + 1] = g
        data[i + 2] = b
      }

      const newAlphaNorm = data[i + 3] / 255
      if (newAlphaNorm > 0.05 && newAlphaNorm < 0.9) {
        const inv = 1 / newAlphaNorm
        const oneMinus = 1 - newAlphaNorm
        data[i] = Math.max(0, Math.min(255, Math.round((data[i] - oneMinus * keyR) * inv)))
        data[i + 1] = Math.max(0, Math.min(255, Math.round((data[i + 1] - oneMinus * keyG) * inv)))
        data[i + 2] = Math.max(0, Math.min(255, Math.round((data[i + 2] - oneMinus * keyB) * inv)))
      }
    } else if (isMagentaKey && magentaDominance > 20) {
      const despillStrength = spill * 0.3 * Math.min(1, magentaDominance / 80)
      ;[r, g, b] = despillMagenta(r, g, b, despillStrength)
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
    }
  }

  ctx.putImageData(imageData, 0, 0)
}

function rgbToHSL(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l]
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0)
  else if (max === gn) h = (bn - rn) / d + 2
  else h = (rn - gn) / d + 4
  h *= 60
  return [h, s, l]
}

function hueDistanceDeg(h1: number, h2: number): number {
  const d = Math.abs(h1 - h2) % 360
  return d > 180 ? 360 - d : d
}

function applyChromaKeyHSL(ctx: CanvasRenderingContext2D, width: number, height: number, options: ChromaKeyOptions = {}): void {
  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data

  const detectedColor = detectKeyColor(data, width, height)
  const keyColor = options.keyColor ?? detectedColor
  const [keyH, keyS] = rgbToHSL(keyColor.r, keyColor.g, keyColor.b)

  const similarity = options.similarity ?? 0.4
  const smoothness = options.smoothness ?? 0.08

  const pixelCount = width * height
  const bgMask = new Uint8Array(pixelCount)
  const queue: number[] = []
  let head = 0

  const isBgCandidate = (p: number): boolean => {
    const i = p * 4
    const a = data[i + 3]
    if (a < 16) return true

    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const [h, s] = rgbToHSL(r, g, b)

    const dh = hueDistanceDeg(h, keyH)
    const ds = Math.abs(s - keyS)

    // For magenta, hue is ~300; allow a wide band controlled by similarity.
    return dh <= 30 + similarity * 55 && ds <= 0.15 + similarity * 0.35
  }

  const trySeed = (p: number): void => {
    if (bgMask[p]) return
    if (!isBgCandidate(p)) return
    bgMask[p] = 1
    queue.push(p)
  }

  for (let x = 0; x < width; x++) {
    trySeed(x)
    trySeed((height - 1) * width + x)
  }
  for (let y = 0; y < height; y++) {
    trySeed(y * width)
    trySeed(y * width + (width - 1))
  }

  while (head < queue.length) {
    const p = queue[head++]
    const x = p % width
    const y = (p / width) | 0
    if (x > 0) trySeed(p - 1)
    if (x < width - 1) trySeed(p + 1)
    if (y > 0) trySeed(p - width)
    if (y < height - 1) trySeed(p + width)
  }

  for (let p = 0; p < pixelCount; p++) {
    const i = p * 4
    if (bgMask[p]) {
      data[i + 3] = 0
      continue
    }

    // Simple edge softening: if adjacent to bg, ramp alpha down based on key similarity
    const x = p % width
    const y = (p / width) | 0
    const nearBg =
      (x > 0 && bgMask[p - 1]) ||
      (x < width - 1 && bgMask[p + 1]) ||
      (y > 0 && bgMask[p - width]) ||
      (y < height - 1 && bgMask[p + width])

    if (!nearBg) continue

    const a = data[i + 3]
    if (a === 0) continue

    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const [h, s] = rgbToHSL(r, g, b)
    const dh = hueDistanceDeg(h, keyH)
    const ds = Math.abs(s - keyS)

    const match = Math.max(0, 1 - dh / (60 + similarity * 60)) * Math.max(0, 1 - ds / (0.5 + similarity * 0.5))
    const soften = smoothness <= 0 ? match : Math.pow(match, 1 / (1 + smoothness * 8))
    const newAlpha = Math.round(a * (1 - soften))
    data[i + 3] = newAlpha < 16 ? 0 : newAlpha
  }

  ctx.putImageData(imageData, 0, 0)
}

function applyChromaKeyClassic(ctx: CanvasRenderingContext2D, width: number, height: number, options: ChromaKeyOptions = {}): void {
  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data

  const detectedColor = detectKeyColor(data, width, height)
  const keyColor = options.keyColor ?? detectedColor
  const bgR = keyColor.r
  const bgG = keyColor.g
  const bgB = keyColor.b

  const isMagentaKey = detectedColor.mode === 'magenta' || (bgR > bgG + 50 && bgB > bgG + 50)
  const bgMagentaDominance = isMagentaKey ? Math.max(180, Math.min(bgR, bgB) - bgG) : 1

  const pixelCount = width * height
  const bgMask = new Uint8Array(pixelCount)
  const queue: number[] = []
  let head = 0

  const bgFillDist = 150
  const bgFillDistSq = bgFillDist * bgFillDist
  const bgDominanceMin = Math.max(50, Math.floor(bgMagentaDominance * 0.18))
  const alphaMin = 16

  const isBgCandidate = (p: number): boolean => {
    const i = p * 4
    const a = data[i + 3]
    if (a < alphaMin) return true

    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]

    if (isMagentaKey) {
      const dominance = Math.min(r, b) - g
      if (dominance < bgDominanceMin) return false
    }

    const dr = r - bgR
    const dg = g - bgG
    const db = b - bgB
    const distSq = dr * dr + dg * dg + db * db
    return distSq <= bgFillDistSq
  }

  const trySeed = (p: number): void => {
    if (bgMask[p]) return
    if (!isBgCandidate(p)) return
    bgMask[p] = 1
    queue.push(p)
  }

  for (let x = 0; x < width; x++) {
    trySeed(x)
    trySeed((height - 1) * width + x)
  }
  for (let y = 0; y < height; y++) {
    trySeed(y * width)
    trySeed(y * width + (width - 1))
  }

  while (head < queue.length) {
    const p = queue[head++]
    const x = p % width
    const y = (p / width) | 0
    if (x > 0) trySeed(p - 1)
    if (x < width - 1) trySeed(p + 1)
    if (y > 0) trySeed(p - width)
    if (y < height - 1) trySeed(p + width)
  }

  for (let p = 0; p < pixelCount; p++) {
    if (!bgMask[p]) continue
    data[p * 4 + 3] = 0
  }

  const matchEpsilon = 0.05
  const killAlphaBelow = 16
  const minUnblendAlpha = 0.06
  const spill = options.spill ?? 0.22

  const isEdgePixel = (p: number): boolean => {
    const x = p % width
    const y = (p / width) | 0
    if (x > 0 && bgMask[p - 1]) return true
    if (x < width - 1 && bgMask[p + 1]) return true
    if (y > 0 && bgMask[p - width]) return true
    if (y < height - 1 && bgMask[p + width]) return true
    return false
  }

  for (let p = 0; p < pixelCount; p++) {
    if (bgMask[p]) continue
    if (!isEdgePixel(p)) continue

    const i = p * 4
    const originalAlpha = data[i + 3]
    if (originalAlpha === 0) continue

    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]

    let match = 0
    if (isMagentaKey) {
      const dominance = Math.min(r, b) - g
      const balance = 1 - Math.min(1, Math.abs(r - b) / 255)
      match = dominance > 0 ? Math.min(1, dominance / bgMagentaDominance) * balance * balance : 0
    } else {
      const dr = r - bgR
      const dg = g - bgG
      const db = b - bgB
      const dist = Math.sqrt(dr * dr + dg * dg + db * db)
      match = Math.max(0, 1 - dist / 170)
    }

    if (match < matchEpsilon) continue

    const originalAlphaNorm = originalAlpha / 255
    const newAlphaNorm = originalAlphaNorm * (1 - match)
    const newAlpha = Math.round(newAlphaNorm * 255)
    data[i + 3] = newAlpha <= killAlphaBelow ? 0 : newAlpha
    if (data[i + 3] === 0) continue

    if (newAlphaNorm > minUnblendAlpha && newAlphaNorm < 0.999) {
      const inv = 1 / newAlphaNorm
      const oneMinus = 1 - newAlphaNorm
      data[i] = Math.max(0, Math.min(255, Math.round((r - oneMinus * bgR) * inv)))
      data[i + 1] = Math.max(0, Math.min(255, Math.round((g - oneMinus * bgG) * inv)))
      data[i + 2] = Math.max(0, Math.min(255, Math.round((b - oneMinus * bgB) * inv)))
    }

    // De-spill for magenta keys: reduce magenta fringing on semi-transparent edge pixels.
    if (isMagentaKey && spill > 0) {
      const a = data[i + 3] / 255
      const rr = data[i]
      const gg = data[i + 1]
      const bb = data[i + 2]
      const dominance = Math.min(rr, bb) - gg
      if (dominance > 0) {
        const strength = spill * (0.5 + 0.8 * match) * Math.min(1, dominance / 70) * (1 - a)
        const [nr, ng, nb] = despillMagenta(rr, gg, bb, strength)
        data[i] = nr
        data[i + 1] = ng
        data[i + 2] = nb
      }
    }
  }

  ctx.putImageData(imageData, 0, 0)
}

function isMagentaVariant(r: number, g: number, b: number, tolerance: number = 1.0): boolean {
  const minRB = Math.min(r, b)
  const magentaDominance = minRB - g

  if (r > 200 && b > 200 && g < 80) return true
  if (r > 180 && b > 180 && g < 60) return true
  if (magentaDominance > 40 * tolerance && minRB > 80) return true
  if (r > g + 50 * tolerance && b > g + 30 * tolerance && r > 100 && b > 60) return true
  if (b > g + 50 * tolerance && r > g + 30 * tolerance && b > 100 && r > 60) return true
  if (r > 150 && b > 150 && g < 180 && g < minRB * 0.8 && minRB > 160) return true
  if (r > 80 && b > 80 && g < 50 && magentaDominance > 30 * tolerance) return true
  if (r > 180 && b > 180 && g < 120 && g < minRB * 0.6) return true
  if (r > 200 && b > 100 && b < 200 && g < 80) return true

  const [h, s, l] = rgbToHSL(r, g, b)
  if (s > 0.2 && s < 0.95 && l > 0.2 && l < 0.9) {
    if (h >= 270 - 30 * tolerance && h <= 330 + 30 * tolerance) return true
  }

  return false
}

function applyChromaKeyAggressive(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: ChromaKeyOptions = {}
): void {
  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data

  const detectedColor = detectKeyColor(data, width, height)
  const keyColor = options.keyColor ?? detectedColor
  const bgR = keyColor.r
  const bgG = keyColor.g
  const bgB = keyColor.b

  // First pass: very permissive magenta variant removal but only connected to border.
  const pixelCount = width * height
  const bgMask = new Uint8Array(pixelCount)
  const queue: number[] = []
  let head = 0

  const isBgCandidate = (p: number): boolean => {
    const i = p * 4
    const a = data[i + 3]
    if (a < 16) return true
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]

    // Close to the detected background or any magenta-ish variant.
    const dr = r - bgR
    const dg = g - bgG
    const db = b - bgB
    const distSq = dr * dr + dg * dg + db * db
    if (distSq <= 170 * 170) return true

    return isMagentaVariant(r, g, b, 1.0)
  }

  const trySeed = (p: number): void => {
    if (bgMask[p]) return
    if (!isBgCandidate(p)) return
    bgMask[p] = 1
    queue.push(p)
  }

  for (let x = 0; x < width; x++) {
    trySeed(x)
    trySeed((height - 1) * width + x)
  }
  for (let y = 0; y < height; y++) {
    trySeed(y * width)
    trySeed(y * width + (width - 1))
  }

  while (head < queue.length) {
    const p = queue[head++]
    const x = p % width
    const y = (p / width) | 0
    if (x > 0) trySeed(p - 1)
    if (x < width - 1) trySeed(p + 1)
    if (y > 0) trySeed(p - width)
    if (y < height - 1) trySeed(p + width)
  }

  for (let p = 0; p < pixelCount; p++) {
    if (!bgMask[p]) continue
    data[p * 4 + 3] = 0
  }

  ctx.putImageData(imageData, 0, 0)

  // Second pass: run classic to clean edges and unblend.
  applyChromaKeyClassic(ctx, width, height, options)
}

export function applyChromaKey(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: ChromaKeyOptions = {},
  algorithm: ChromaKeyAlgorithm = 'classic'
): void {
  switch (algorithm) {
    case 'yuv':
      return applyChromaKeyYUV(ctx, width, height, options)
    case 'hsl':
      return applyChromaKeyHSL(ctx, width, height, options)
    case 'aggressive':
      return applyChromaKeyAggressive(ctx, width, height, options)
    case 'classic':
    default:
      return applyChromaKeyClassic(ctx, width, height, options)
  }
}
