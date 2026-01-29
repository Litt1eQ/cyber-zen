import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'

import { COMMANDS } from '@/types/events'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { validateSpriteImageDimensions, type ChromaKeyAlgorithm, type ChromaKeyOptions } from '@/sprites/spriteCore'
import { exportSquareCoverPngBase64FromProcessedSheet, loadImageFromUrl, processSpriteSheetToObjectUrl, type ProcessedSpriteSheet, type SpriteSheetProcessOptions } from '@/sprites/spriteStudio'
import { ProcessedSpriteFramesPreview } from '@/components/SpriteStudio/ProcessedSpriteFramesPreview'

type SpriteSheetConfigInput = {
  file?: string
  mode?: 'replace' | 'overlay'
  columns?: number
  rows?: number
  chroma_key?: boolean
  chroma_key_algorithm?: 'classic' | 'yuv' | 'hsl' | 'aggressive'
  chroma_key_options?: { similarity?: number; smoothness?: number; spill?: number; key_color?: { r: number; g: number; b: number } }
  remove_grid_lines?: boolean
  image_smoothing_enabled?: boolean
  idle_breathe?: boolean
  behavior?: 'simple' | 'pet'
  idle_mood?: string
  hit_mood?: string
}

const DEFAULT_COLUMNS = 8
const DEFAULT_ROWS = 7
const DEFAULT_SIMILARITY = 0.42
const DEFAULT_SMOOTHNESS = 0.1
const DEFAULT_SPILL = 0.28
const STUDIO_TARGET_FRAME_WIDTH_PX = 512
const STUDIO_MAX_PROCESSED_PIXELS = 16_000_000

function checkerboardStyle(size = 10): CSSProperties {
  return {
    backgroundImage: `linear-gradient(45deg, rgba(148,163,184,.35) 25%, transparent 25%), linear-gradient(-45deg, rgba(148,163,184,.35) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(148,163,184,.35) 75%), linear-gradient(-45deg, transparent 75%, rgba(148,163,184,.35) 75%)`,
    backgroundSize: `${size}px ${size}px`,
    backgroundPosition: `0 0, 0 ${size / 2}px, ${size / 2}px -${size / 2}px, -${size / 2}px 0px`,
  }
}

function toSafeFileBaseName(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return 'sprite-skin'
  return trimmed
    .replace(/[<>:"/\\\\|?*]+/g, '_')
    .replace(/\s+/g, '-')
    .slice(0, 48)
    .replace(/-+$/g, '')
    .toLowerCase() || 'sprite-skin'
}

export function SpriteSheetStudioDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [sourceFile, setSourceFile] = useState<File | null>(null)
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [sourceMeta, setSourceMeta] = useState<{ width: number; height: number } | null>(null)
  const [processed, setProcessed] = useState<ProcessedSpriteSheet | null>(null)
  const processedRef = useRef<ProcessedSpriteSheet | null>(null)
  const [processedError, setProcessedError] = useState<string | null>(null)
  const [processingBusy, setProcessingBusy] = useState(false)
  const [lastProcessedSignature, setLastProcessedSignature] = useState<string | null>(null)

  const [skinName, setSkinName] = useState<string>('')
  const [author, setAuthor] = useState<string>('')
  const [columns, setColumns] = useState<number>(DEFAULT_COLUMNS)
  const [rows, setRows] = useState<number>(DEFAULT_ROWS)

  const [chromaKeyEnabled, setChromaKeyEnabled] = useState(true)
  const [keyColorMode, setKeyColorMode] = useState<'auto' | 'magenta'>('auto')
  const [chromaKeyAlgorithm, setChromaKeyAlgorithm] = useState<ChromaKeyAlgorithm>('yuv')
  const [similarity, setSimilarity] = useState(DEFAULT_SIMILARITY)
  const [smoothness, setSmoothness] = useState(DEFAULT_SMOOTHNESS)
  const [spill, setSpill] = useState(DEFAULT_SPILL)
  const [removeGridLinesEnabled, setRemoveGridLinesEnabled] = useState(true)
  const [imageSmoothingEnabled, setImageSmoothingEnabled] = useState(true)
  const [coverIndex, setCoverIndex] = useState(0)

  const [exportBusy, setExportBusy] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setExportError(null)
  }, [open])

  useEffect(() => {
    if (!sourceFile) return
    const url = URL.createObjectURL(sourceFile)
    setSourceUrl(url)
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [sourceFile])

  useEffect(() => {
    processedRef.current = processed
  }, [processed])

  const chromaKeyOptions: ChromaKeyOptions = useMemo(
    () => ({
      similarity,
      smoothness,
      spill,
      keyColor: keyColorMode === 'magenta' ? { r: 255, g: 0, b: 255 } : undefined,
    }),
    [keyColorMode, similarity, smoothness, spill]
  )

  const processOptions: SpriteSheetProcessOptions = useMemo(
    () => ({
      columns,
      rows,
      chromaKeyEnabled,
      chromaKeyAlgorithm,
      chromaKeyOptions,
      removeGridLinesEnabled,
      imageSmoothingEnabled,
      targetFrameWidthPx: STUDIO_TARGET_FRAME_WIDTH_PX,
      maxProcessedPixels: STUDIO_MAX_PROCESSED_PIXELS,
    }),
    [
      chromaKeyAlgorithm,
      chromaKeyEnabled,
      chromaKeyOptions,
      columns,
      imageSmoothingEnabled,
      removeGridLinesEnabled,
      rows,
    ]
  )

  useEffect(() => {
    let cancelled = false
    if (!open) return
    if (!sourceUrl) {
      setSourceMeta(null)
      return
    }
    void (async () => {
      try {
        const img = await loadImageFromUrl(sourceUrl)
        if (cancelled) return
        setSourceMeta({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height })
      } catch {
        if (cancelled) return
        setSourceMeta(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, sourceUrl])

  useEffect(() => {
    return () => {
      setProcessed(null)
    }
  }, [])

  const validation = useMemo(() => {
    if (!sourceMeta) return null
    return validateSpriteImageDimensions(sourceMeta.width, sourceMeta.height, columns, rows)
  }, [columns, rows, sourceMeta])

  const totalFrames = Math.max(1, columns) * Math.max(1, rows)
  useEffect(() => {
    setCoverIndex((idx) => Math.min(Math.max(0, idx), totalFrames - 1))
  }, [totalFrames])

  const coverPreviewDataUrl = useMemo(() => {
    if (!processed) return null
    try {
      const base64 = exportSquareCoverPngBase64FromProcessedSheet({
        sheet: processed.sheet,
        frameWidth: processed.frameWidth,
        frameHeight: processed.frameHeight,
        columns: processed.columns,
        frameIndex: coverIndex,
      })
      return `data:image/png;base64,${base64}`
    } catch {
      return null
    }
  }, [coverIndex, processed])

  const openFilePicker = () => fileInputRef.current?.click()

  const currentSignature = useMemo(() => {
    if (!sourceFile) return null
    return [
      sourceFile.name,
      sourceFile.size,
      sourceFile.lastModified,
      columns,
      rows,
      chromaKeyEnabled ? 1 : 0,
      keyColorMode,
      chromaKeyAlgorithm,
      similarity.toFixed(3),
      smoothness.toFixed(3),
      spill.toFixed(3),
      removeGridLinesEnabled ? 1 : 0,
      imageSmoothingEnabled ? 1 : 0,
    ].join('|')
  }, [
    chromaKeyAlgorithm,
    chromaKeyEnabled,
    columns,
    imageSmoothingEnabled,
    keyColorMode,
    removeGridLinesEnabled,
    rows,
    similarity,
    smoothness,
    sourceFile,
    spill,
  ])

  const isProcessedUpToDate = !!currentSignature && currentSignature === lastProcessedSignature && !!processed

  const runProcess = async (): Promise<ProcessedSpriteSheet | null> => {
    if (!sourceUrl || !validation?.valid) return null
    setProcessingBusy(true)
    setProcessedError(null)
    try {
      await new Promise((r) => window.setTimeout(r, 0))
      const next = await processSpriteSheetToObjectUrl(sourceUrl, processOptions)
      setProcessed(next)
      if (currentSignature) setLastProcessedSignature(currentSignature)
      return next
    } catch (e) {
      setProcessed(null)
      setLastProcessedSignature(null)
      setProcessedError(String(e))
      return null
    } finally {
      setProcessingBusy(false)
    }
  }

  const exportAll = async () => {
    if (!sourceFile || !sourceUrl || !validation?.valid) return
    setExportBusy(true)
    setExportError(null)
    try {
      if (!isTauri()) return

      const fileBase = toSafeFileBaseName(skinName || sourceFile.name)
      const czsFileName = `${fileBase}.czs`
      const exportPath = await save({
        title: t('settings.skins.exportDirTitle') as string,
        defaultPath: czsFileName,
        filters: [{ name: 'CyberZen Skin', extensions: ['czs'] }],
      })
      if (!exportPath) return

      let latestProcessed = processedRef.current
      if (!isProcessedUpToDate) {
        const next = await runProcess()
        latestProcessed = next ?? processedRef.current
      }
      if (!latestProcessed || (!isProcessedUpToDate && !latestProcessed)) {
        throw new Error(t('settings.skins.studio.needProcess') as string)
      }
      const spriteBase64 = await maybeLosslessReencodePngBase64(sourceFile)

      const spriteSheet: SpriteSheetConfigInput = {
        mode: 'replace',
        columns,
        rows,
        chroma_key: chromaKeyEnabled,
        chroma_key_algorithm: chromaKeyAlgorithm,
        chroma_key_options: { similarity, smoothness, spill, key_color: keyColorMode === 'magenta' ? { r: 255, g: 0, b: 255 } : undefined },
        remove_grid_lines: removeGridLinesEnabled,
        image_smoothing_enabled: imageSmoothingEnabled,
        idle_breathe: true,
        behavior: 'pet',
        idle_mood: 'idle',
        hit_mood: 'excited',
      }

      const coverPngBase64 = exportSquareCoverPngBase64FromProcessedSheet({
        sheet: latestProcessed.sheet,
        frameWidth: latestProcessed.frameWidth,
        frameHeight: latestProcessed.frameHeight,
        columns: latestProcessed.columns,
        frameIndex: coverIndex,
      })

      await invoke<string>(COMMANDS.EXPORT_SPRITE_SKIN_PACKAGE_ZIP, {
        fileName: czsFileName,
        exportPath,
        name: skinName?.trim() ? skinName.trim() : undefined,
        author: author?.trim() ? author.trim() : undefined,
        spriteBase64,
        coverPngBase64,
        spriteSheet,
      })
    } catch (e) {
      setExportError(String(e))
    } finally {
      setExportBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl" data-no-drag>
        <DialogHeader>
          <DialogTitle>{t('settings.skins.studio.title')}</DialogTitle>
          <DialogDescription>{t('settings.skins.studio.subtitle')}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-7 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900">{t('settings.skins.studio.source')}</div>
                <div className="text-xs text-slate-500 mt-1 truncate">
                  {sourceFile ? sourceFile.name : t('settings.skins.studio.sourceHint')}
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <Button variant="secondary" onClick={openFilePicker} disabled={exportBusy}>
                  {t('settings.skins.studio.pick')}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.currentTarget.files?.[0]
                    e.currentTarget.value = ''
                    if (!f) return
                    setProcessed(null)
                    setLastProcessedSignature(null)
                    setSourceFile(f)
                    setCoverIndex(0)
                    if (!skinName.trim()) setSkinName(stripFileExt(f.name))
                  }}
                />
              </div>
            </div>

            {processedError && <div className="text-xs text-red-600">{processedError}</div>}
            {validation && !validation.valid && <div className="text-xs text-red-600">{validation.error}</div>}

            <div className="rounded-xl border border-slate-200/60 bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-slate-900">{t('settings.skins.studio.cover')}</div>
                  <div className="text-xs text-slate-500 mt-1">{t('settings.skins.studio.coverHint')}</div>
                </div>
                <div className="text-xs text-slate-500 tabular-nums">
                  {sourceMeta ? `${sourceMeta.width}×${sourceMeta.height} / ${columns}×${rows}` : null}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-xs text-slate-500">
                  {processed && !isProcessedUpToDate ? t('settings.skins.studio.pendingChanges') : null}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void runProcess()}
                  disabled={!sourceUrl || !validation?.valid || exportBusy || processingBusy}
                >
                  {processingBusy
                    ? t('settings.skins.studio.processing')
                    : processed
                      ? t('settings.skins.studio.reprocess')
                      : t('settings.skins.studio.process')}
                </Button>
              </div>

              <div className="mt-3 grid grid-cols-12 gap-4 items-start">
                <div className="col-span-5">
                  <div
                    className="aspect-square w-full rounded-lg border border-slate-200/60 overflow-hidden"
                    style={checkerboardStyle(12)}
                  >
                    {processed && coverPreviewDataUrl ? (
                      <img
                        src={coverPreviewDataUrl}
                        alt={t('settings.skins.studio.coverPreviewAria')}
                        className="w-full h-full object-contain select-none"
                        draggable={false}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-sm text-slate-500">
                        {t('settings.skins.studio.noPreview')}
                      </div>
                    )}
                  </div>
                </div>

                <div className="col-span-7">
                  {processed ? (
                    <ProcessedSpriteFramesPreview
                      processed={processed}
                      imageSmoothingEnabled={imageSmoothingEnabled}
                      columns={columns}
                      rows={rows}
                      selectedIndex={coverIndex}
                      onSelectIndex={setCoverIndex}
                    />
                  ) : null}
                </div>
              </div>
            </div>

            {exportError && <div className="text-xs text-red-600">{exportError}</div>}
          </div>

          <div className="col-span-5 space-y-4">
            <div className="rounded-xl border border-slate-200/60 bg-white p-4 space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="cz-sprite-name">{t('settings.skins.studio.name')}</Label>
                <Input
                  id="cz-sprite-name"
                  value={skinName}
                  onChange={(e) => setSkinName(e.currentTarget.value)}
                  placeholder={t('settings.skins.studio.namePlaceholder')}
                  disabled={exportBusy}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="cz-sprite-author">{t('settings.skins.studio.author')}</Label>
                <Input
                  id="cz-sprite-author"
                  value={author}
                  onChange={(e) => setAuthor(e.currentTarget.value)}
                  placeholder={t('settings.skins.studio.authorPlaceholder')}
                  disabled={exportBusy}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>{t('settings.skins.studio.columns')}</Label>
                  <Input
                    inputMode="numeric"
                    value={String(columns)}
                    onChange={(e) => setColumns(clampInt(e.currentTarget.value, 1, 16, DEFAULT_COLUMNS))}
                    disabled={exportBusy}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>{t('settings.skins.studio.rows')}</Label>
                  <Input
                    inputMode="numeric"
                    value={String(rows)}
                    onChange={(e) => setRows(clampInt(e.currentTarget.value, 1, 16, DEFAULT_ROWS))}
                    disabled={exportBusy}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-slate-900">{t('settings.skins.studio.chromaKey')}</div>
                  <div className="text-xs text-slate-500 mt-1">{t('settings.skins.studio.chromaKeyHint')}</div>
                </div>
                <Switch checked={chromaKeyEnabled} onCheckedChange={setChromaKeyEnabled} disabled={exportBusy} />
              </div>

              <div className="grid gap-2">
                <Label>{t('settings.skins.studio.keyColor')}</Label>
                <Select
                  value={keyColorMode}
                  onValueChange={(v) => setKeyColorMode(v as 'auto' | 'magenta')}
                  disabled={exportBusy || !chromaKeyEnabled}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{t('settings.skins.studio.keyColorAuto')}</SelectItem>
                    <SelectItem value="magenta">{t('settings.skins.studio.keyColorMagenta')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>{t('settings.skins.studio.algorithm')}</Label>
                <Select
                  value={chromaKeyAlgorithm}
                  onValueChange={(v) => setChromaKeyAlgorithm(v as ChromaKeyAlgorithm)}
                  disabled={exportBusy}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yuv">YUV</SelectItem>
                    <SelectItem value="classic">Classic</SelectItem>
                    <SelectItem value="hsl">HSL</SelectItem>
                    <SelectItem value="aggressive">Aggressive</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <SliderField
                label={t('settings.skins.studio.similarity')}
                value={similarity}
                min={0}
                max={1}
                step={0.01}
                onChange={setSimilarity}
                disabled={exportBusy || !chromaKeyEnabled}
              />
              <SliderField
                label={t('settings.skins.studio.smoothness')}
                value={smoothness}
                min={0}
                max={1}
                step={0.01}
                onChange={setSmoothness}
                disabled={exportBusy || !chromaKeyEnabled}
              />
              <SliderField
                label={t('settings.skins.studio.spill')}
                value={spill}
                min={0}
                max={1}
                step={0.01}
                onChange={setSpill}
                disabled={exportBusy || !chromaKeyEnabled}
              />

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-slate-900">{t('settings.skins.studio.removeGrid')}</div>
                  <div className="text-xs text-slate-500 mt-1">{t('settings.skins.studio.removeGridHint')}</div>
                </div>
                <Switch checked={removeGridLinesEnabled} onCheckedChange={setRemoveGridLinesEnabled} disabled={exportBusy} />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-slate-900">{t('settings.skins.studio.smoothing')}</div>
                  <div className="text-xs text-slate-500 mt-1">{t('settings.skins.studio.smoothingHint')}</div>
                </div>
                <Switch checked={imageSmoothingEnabled} onCheckedChange={setImageSmoothingEnabled} disabled={exportBusy} />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={exportBusy}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => void exportAll()}
            disabled={
              exportBusy ||
              !sourceFile ||
              !sourceUrl ||
              !validation?.valid
            }
          >
            {exportBusy ? t('settings.skins.studio.exporting') : t('settings.skins.studio.saveExport')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  disabled,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  disabled?: boolean
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-slate-900">{label}</div>
        <div className="text-xs text-slate-500 tabular-nums">{value.toFixed(2)}</div>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        disabled={disabled}
      />
    </div>
  )
}

function clampInt(input: string, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(input))
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

function stripFileExt(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return name
  return name.slice(0, dot)
}

async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to read blob.'))
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.readAsDataURL(blob)
  })
  const comma = dataUrl.indexOf(',')
  if (comma === -1) throw new Error('Failed to encode base64.')
  return dataUrl.slice(comma + 1)
}

async function readFileAsBase64(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to read file.'))
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.readAsDataURL(file)
  })
  const comma = dataUrl.indexOf(',')
  if (comma === -1) throw new Error('Failed to encode file.')
  return dataUrl.slice(comma + 1)
}

async function maybeLosslessReencodePngBase64(file: File): Promise<string> {
  if (file.type !== 'image/png') return await readFileAsBase64(file)
  if (file.size < 10 * 1024 * 1024) return await readFileAsBase64(file)

  try {
    const url = URL.createObjectURL(file)
    try {
      const img = await loadImageFromUrl(url)
      const w = img.naturalWidth || img.width
      const h = img.naturalHeight || img.height
      if (w <= 0 || h <= 0) return await readFileAsBase64(file)

      // Guardrail: re-encoding extremely large images can be slow / memory heavy.
      if (w * h > 240_000_000) return await readFileAsBase64(file)

      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return await readFileAsBase64(file)
      ctx.drawImage(img, 0, 0)

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'))
      if (!blob) return await readFileAsBase64(file)

      // Use the smaller one, without changing resolution.
      if (blob.size >= file.size) return await readFileAsBase64(file)
      return await blobToBase64(blob)
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch {
    return await readFileAsBase64(file)
  }
}
