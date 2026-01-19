const DEFAULT_PPI = 96

type DisplayCalibration = {
  diagonal_in?: number | null
  ppi_override?: number | null
}

type MouseDistanceSettings = {
  mouse_distance_displays?: Record<string, DisplayCalibration> | null
}

export function normalizePpi(ppi: number | null | undefined): number {
  if (!ppi || !Number.isFinite(ppi) || ppi <= 0) return DEFAULT_PPI
  return Math.min(400, Math.max(50, Math.round(ppi)))
}

export function pixelsToCentimeters(px: number | null | undefined, ppi: number | null | undefined): number {
  const safePx = px && Number.isFinite(px) ? px : 0
  const safePpi = normalizePpi(ppi)
  return (safePx * 2.54) / safePpi
}

export function ppiFromDiagonalPx(
  sizePx: { width: number; height: number } | null | undefined,
  diagonalIn: number | null | undefined,
): number | null {
  if (!sizePx) return null
  const w = sizePx.width
  const h = sizePx.height
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null
  if (!diagonalIn || !Number.isFinite(diagonalIn) || diagonalIn <= 0) return null
  const diagPx = Math.sqrt(w * w + h * h)
  if (!Number.isFinite(diagPx) || diagPx <= 0) return null
  return diagPx / diagonalIn
}

export function effectivePpiForDisplay(
  settings: MouseDistanceSettings | null | undefined,
  displayId: string,
  sizePx: { width: number; height: number } | null | undefined,
): number {
  const cfg = settings?.mouse_distance_displays?.[displayId]
  const override = cfg?.ppi_override
  if (override != null) return normalizePpi(override)
  const diagIn = cfg?.diagonal_in
  const computed = ppiFromDiagonalPx(sizePx, diagIn)
  return normalizePpi(computed ?? DEFAULT_PPI)
}

export function formatCentimeters(cm: number, opts?: { maximumFractionDigits?: number }): string {
  const max = opts?.maximumFractionDigits ?? (cm < 100 ? 1 : 0)
  return cm.toLocaleString(undefined, { maximumFractionDigits: max })
}
