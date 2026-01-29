import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import { Trash2 } from 'lucide-react'
import { WOODEN_FISH_SKINS, type BuiltinWoodenFishSkinId, type WoodenFishSkin, type WoodenFishSkinId } from '../WoodenFish/skins'
import { useCustomWoodenFishSkins } from '../../hooks/useCustomWoodenFishSkins'
import { COMMANDS } from '../../types/events'
import type { CustomWoodenFishSkin } from '@/types/skins'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { WoodenFish } from '../WoodenFish'
import { SpriteSheetCanvas } from '@/components/SpriteSheet/SpriteSheetCanvas'
import i18n from '@/i18n'
import { precacheCustomSkinSpriteSheet } from '@/sprites/spriteSheetCache'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SpriteSheetStudioDialog } from '@/components/Settings/SpriteSheetStudioDialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { clampSpriteRowIndex, getSpritePreviewRowCount, SPRITE_DEFAULT_IDLE_ROW_INDEX, spriteRowIndexToFrameIntervalMs } from '@/sprites/spritePreview'

const DEFAULT_PREVIEW_WINDOW_SCALE = 100

type SkinOption = {
  id: WoodenFishSkinId
  title: string
  skin: WoodenFishSkin
  kind: 'builtin' | 'custom'
  coverSrc?: string
  author?: string
}

type SkinView = 'legacy' | 'sprite'

export function SkinManager({
  selectedId,
  onSelect,
}: {
  selectedId: string
  onSelect: (id: string) => void
}) {
  const { t } = useTranslation()
  const { skins: customSkins, mapById: customSkinsById, loading, error, reload } = useCustomWoodenFishSkins()
  const [importBusy, setImportBusy] = useState(false)
  const [importStage, setImportStage] = useState<'reading' | 'importing' | 'processing' | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [exportBusy, setExportBusy] = useState(false)
  const [exportPath, setExportPath] = useState<string | null>(null)
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: WoodenFishSkinId; title: string } | null>(null)
  const [previewId, setPreviewId] = useState<WoodenFishSkinId | null>(null)
  const [studioOpen, setStudioOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const options = useMemo<SkinOption[]>(() => {
    const builtin: SkinOption[] = [
      { id: 'rosewood', title: t('settings.skins.builtin.rosewood'), skin: WOODEN_FISH_SKINS.rosewood, kind: 'builtin' },
      { id: 'wood', title: t('settings.skins.builtin.wood'), skin: WOODEN_FISH_SKINS.wood, kind: 'builtin' },
    ]
    const custom: SkinOption[] = customSkins.map((s) => ({
      id: s.id,
      title: stripZipSuffix(s.name),
      skin: s.skin,
      kind: 'custom',
      coverSrc: s.cover_src,
      author: s.author,
    }))
    return [...builtin, ...custom]
  }, [customSkins, t])

  const selectedOption = useMemo(() => {
    const builtin = WOODEN_FISH_SKINS[selectedId as BuiltinWoodenFishSkinId]
    if (builtin) {
      const title =
        selectedId === 'wood'
          ? t('settings.skins.builtin.wood')
          : t('settings.skins.builtin.rosewood')
      return { id: selectedId as WoodenFishSkinId, title, skin: builtin, kind: 'builtin' as const }
    }
    const custom = customSkinsById.get(selectedId)
      if (custom) return { id: custom.id, title: stripZipSuffix(custom.name), skin: custom.skin, kind: 'custom' as const }
    return { id: 'rosewood' as const, title: t('settings.skins.builtin.rosewood'), skin: WOODEN_FISH_SKINS.rosewood, kind: 'builtin' as const }
  }, [customSkinsById, selectedId, t])

  const effectiveSelectedId = selectedOption.id
  const selectedView: SkinView = selectedOption.skin.sprite_sheet?.src ? 'sprite' : 'legacy'
  const [view, setView] = useState<SkinView>(selectedView)

  useEffect(() => {
    setView(selectedView)
  }, [selectedView])

  const legacyOptions = useMemo(() => options.filter((o) => !o.skin.sprite_sheet?.src), [options])
  const spriteOptions = useMemo(() => options.filter((o) => !!o.skin.sprite_sheet?.src), [options])

  const openImport = () => {
    setImportError(null)
    setExportPath(null)
    fileInputRef.current?.click()
  }

  const handleImportFile = async (file: File) => {
    setImportBusy(true)
    setImportStage('reading')
    setImportError(null)
    setExportPath(null)
    try {
      const zipBase64 = await readFileAsBase64(file)
      const name = stripZipSuffix(file.name)
      setImportStage('importing')
      const skin = await invoke<CustomWoodenFishSkin>(COMMANDS.IMPORT_CUSTOM_WOODEN_FISH_SKIN_ZIP, {
        zipBase64,
        name,
      })

      // Preprocess spritesheet once at import time to avoid any runtime pixel-processing.
      try {
        setImportStage('processing')
        await waitForPaint()
        await precacheCustomSkinSpriteSheet(skin)
      } catch (e) {
        // Ignore cache failures: the skin itself is still usable.
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.debug('[cz] sprite cache skipped/failed', e)
        }
      }

      await reload()
      if (skin?.id) onSelect(skin.id)
    } catch (e) {
      setImportError(String(e))
    } finally {
      setImportBusy(false)
      setImportStage(null)
    }
  }

  const handleDelete = async (id: WoodenFishSkinId) => {
    setDeleteBusyId(id)
    try {
      await invoke(COMMANDS.DELETE_CUSTOM_WOODEN_FISH_SKIN, { id })
      if (selectedId === id) onSelect('rosewood')
      await reload()
    } catch (e) {
      setImportError(String(e))
    } finally {
      setDeleteBusyId(null)
    }
  }

  const handleDownloadZip = async (id: WoodenFishSkinId, fileName: string) => {
    setExportBusy(true)
    setImportError(null)
    setExportPath(null)
    try {
      const exportPath = isTauri()
        ? await save({
          title: t('settings.skins.exportDirTitle') as string,
          defaultPath: fileName,
          filters: [{ name: 'CyberZen Skin', extensions: ['czs', 'zip'] }],
        })
        : null
      if (isTauri() && !exportPath) return

      const path = await invoke<string>(COMMANDS.EXPORT_WOODEN_FISH_SKIN_ZIP, { id, fileName, exportPath })
      setExportPath(path)
    } catch (e) {
      setImportError(String(e))
    } finally {
      setExportBusy(false)
    }
  }

  const openSpriteStudio = async () => {
    if (!isTauri()) {
      setStudioOpen(true)
      return
    }
    try {
      await invoke(COMMANDS.SHOW_SPRITE_STUDIO_WINDOW)
    } catch {
      setStudioOpen(true)
    }
  }

  return (
    <Card className="p-4">
      <Tabs value={view} onValueChange={(v) => setView(v as SkinView)}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <div className="font-medium text-slate-900">{t('settings.skins.title')}</div>
              <TabsList className="h-9 bg-slate-50 border border-slate-200/60">
                <TabsTrigger value="legacy">{t('settings.skins.tabs.legacy')}</TabsTrigger>
                <TabsTrigger value="sprite">{t('settings.skins.tabs.sprite')}</TabsTrigger>
              </TabsList>
            </div>

            <div className="text-sm text-slate-500 mt-2">
              {view === 'legacy' ? (
                <>
                  {t('settings.skins.legacyHintPrefix')}{' '}
                  <span className="font-mono">muyu.png</span> {t('settings.skins.legacyHintAnd')}{' '}
                  <span className="font-mono">hammer.png</span>
                  {t('settings.skins.legacyHintSuffix')}
                </>
              ) : (
                <>
                  {t('settings.skins.spriteHintPrefix')}{' '}
                  <span className="font-mono">sprite.png</span>
                  {t('settings.skins.spriteHintOr')}{' '}
                  <span className="font-mono">sprite.jpg</span> / <span className="font-mono">sprite.jpeg</span>
                  {t('settings.skins.spriteHintSuffix')}
                </>
              )}
            </div>
            {loading && <div className="text-xs text-slate-500 mt-2">{t('settings.skins.loading')}</div>}
            {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
          </div>
          <div className="shrink-0 flex flex-wrap items-center justify-end gap-2" data-no-drag>
            <Button variant="secondary" onClick={() => setPreviewId(selectedOption.id)}>
              {t('settings.skins.previewReference')}
            </Button>
            {view === 'sprite' && (
              <Button variant="secondary" onClick={() => void openSpriteStudio()} disabled={exportBusy || importBusy}>
                {t('settings.skins.studio.open')}
              </Button>
            )}
            {view === 'legacy' && (
              <Button
                variant="secondary"
                disabled={exportBusy}
                onClick={() => void handleDownloadZip('rosewood', 'wooden-fish-skin-template.czs')}
              >
                {t('settings.skins.downloadTemplate')}
              </Button>
            )}
            <Button
              variant="secondary"
              disabled={exportBusy}
              onClick={() =>
                void handleDownloadZip(
                  effectiveSelectedId,
                  sanitizeFileName(`wooden-fish-skin-${selectedOption.title}-${effectiveSelectedId}.czs`)
                )
              }
            >
              {t('settings.skins.exportCurrentZip')}
            </Button>
            <Button onClick={openImport} disabled={importBusy}>
              {importBusy ? t('settings.skins.importing') : t('settings.skins.importZip')}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".czs,.zip,application/zip"
              className="hidden"
              onChange={(e) => {
                const f = e.currentTarget.files?.[0]
                e.currentTarget.value = ''
                if (!f) return
                void handleImportFile(f)
              }}
            />
          </div>
        </div>
        {importError && <div className="text-xs text-red-600 mt-2">{importError}</div>}
        {exportPath && (
          <div className="text-xs text-slate-500 mt-2">
            {t('settings.skins.exported')} <span className="font-mono">{exportPath}</span>
          </div>
        )}

        <TabsContent value="legacy" className="mt-4" data-no-drag>
          <SkinGrid
            options={legacyOptions}
            selectedId={effectiveSelectedId}
            onSelect={onSelect}
            onPreview={(id) => setPreviewId(id)}
            onDelete={(id, title) => setDeleteConfirm({ id, title })}
          />
        </TabsContent>
        <TabsContent value="sprite" className="mt-4" data-no-drag>
          {spriteOptions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
              {t('settings.skins.spriteEmptyHint')}
            </div>
          ) : (
            <SkinGrid
              options={spriteOptions}
              selectedId={effectiveSelectedId}
              onSelect={onSelect}
              onPreview={(id) => setPreviewId(id)}
              onDelete={(id, title) => setDeleteConfirm({ id, title })}
            />
          )}
        </TabsContent>
      </Tabs>

      <SkinPreviewDialog
        open={previewId != null}
        onOpenChange={(open) => {
          if (!open) setPreviewId(null)
        }}
        selected={previewId ? (options.find((o) => o.id === previewId) ?? selectedOption) : selectedOption}
      />

      <SpriteSheetStudioDialog open={studioOpen} onOpenChange={setStudioOpen} />

      <Dialog
        open={importBusy}
        onOpenChange={() => {
          // Keep it modal while busy.
        }}
      >
        <DialogContent
          className="max-w-sm"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          data-no-drag
        >
          <DialogHeader>
            <DialogTitle>{t('settings.skins.importing')}</DialogTitle>
            <DialogDescription>
              {importStage === 'reading'
                ? t('settings.skins.importStages.reading')
                : importStage === 'processing'
                  ? t('settings.skins.importStages.processingSprite')
                  : t('settings.skins.importStages.importing')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 rounded-full border-2 border-slate-300 border-t-slate-700 animate-spin" aria-hidden="true" />
            <div className="text-sm text-slate-600">{t('common.loading')}</div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteConfirm != null}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirm(null)
        }}
      >
        <DialogContent className="max-w-md" data-no-drag>
          <DialogHeader>
            <DialogTitle>{t('settings.skins.deleteDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('settings.skins.deleteDialog.descriptionPrefix')}{' '}
              <span className="font-medium text-slate-900">{deleteConfirm?.title ?? ''}</span>{' '}
              {t('settings.skins.deleteDialog.descriptionSuffix')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteConfirm(null)} disabled={deleteBusyId != null}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={deleteConfirm == null || deleteBusyId != null}
              onClick={() => {
                const id = deleteConfirm?.id
                setDeleteConfirm(null)
                if (!id) return
                void handleDelete(id)
              }}
            >
              {deleteBusyId ? t('settings.skins.deleting') : t('settings.skins.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function SkinGrid({
  options,
  selectedId,
  onSelect,
  onPreview,
  onDelete,
}: {
  options: SkinOption[]
  selectedId: WoodenFishSkinId
  onSelect: (id: WoodenFishSkinId) => void
  onPreview: (id: WoodenFishSkinId) => void
  onDelete: (id: WoodenFishSkinId, title: string) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {options.map((opt) => (
      <SkinPreviewCard
          key={opt.id}
          id={opt.id}
          title={opt.title}
          selected={selectedId === opt.id}
          skin={opt.skin}
          coverSrc={opt.coverSrc}
          author={opt.author}
          badgeText={opt.kind === 'custom' ? t('settings.skins.badge.custom') : t('settings.skins.badge.builtin')}
          badgeKind={opt.kind}
          canDelete={opt.kind === 'custom'}
          onDelete={() => onDelete(opt.id, opt.title)}
          onSelect={(id) => onSelect(id)}
          onPreview={(id) => onPreview(id)}
        />
      ))}
    </div>
  )
}

function SkinPreviewCard({
  id,
  title,
  selected,
  skin,
  coverSrc,
  author,
  badgeText,
  badgeKind,
  canDelete,
  onDelete,
  onSelect,
  onPreview,
}: {
  id: WoodenFishSkinId
  title: string
  selected: boolean
  skin: WoodenFishSkin
  coverSrc?: string
  author?: string
  badgeText: string
  badgeKind: 'builtin' | 'custom'
  canDelete: boolean
  onDelete: () => void
  onSelect: (id: WoodenFishSkinId) => void
  onPreview: (id: WoodenFishSkinId) => void
}) {
  const { t } = useTranslation()
  const sprite = skin.sprite_sheet

  const preview = coverSrc ? (
    <img
      src={coverSrc}
      alt=""
      draggable={false}
      className="absolute left-1/2 top-[62%] h-[56%] w-auto -translate-x-1/2 -translate-y-1/2 object-contain select-none"
    />
  ) : sprite?.src ? (
    <div className="absolute left-1/2 top-[62%] -translate-x-1/2 -translate-y-1/2">
      <SpriteSheetCanvas
        src={sprite.src}
        size={108}
        columns={sprite.columns}
        rows={sprite.rows}
        cropOffsetX={sprite.cropOffsetX}
        cropOffsetY={sprite.cropOffsetY}
        mood="idle"
        rowIndex={0}
        animate={false}
        frameIntervalMs={140}
        speed={1}
        chromaKey={sprite.chromaKey ?? true}
        chromaKeyAlgorithm={sprite.chromaKeyAlgorithm ?? 'yuv'}
        chromaKeyOptions={sprite.chromaKeyOptions}
        imageSmoothingEnabled={sprite.imageSmoothingEnabled ?? true}
        removeGridLines={sprite.removeGridLines ?? true}
        idleBreathe={sprite.idleBreathe ?? true}
      />
    </div>
  ) : (
    <img
      src={skin.body.src}
      alt={skin.body.alt}
      draggable={false}
      className="absolute left-1/2 top-[62%] h-[56%] w-auto -translate-x-1/2 -translate-y-1/2 object-contain select-none"
    />
  )

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(id)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        onSelect(id)
      }}
      className={[
        'group text-left rounded-xl border p-2 transition-colors relative',
        selected
          ? 'border-blue-200 bg-blue-50/60'
          : 'border-slate-200/60 bg-white hover:border-slate-300 hover:bg-slate-50',
      ].join(' ')}
      aria-pressed={selected}
      data-no-drag
    >
      <div className="relative aspect-[4/3] w-full rounded-lg overflow-hidden border border-slate-200/60 bg-white">
        <div className="absolute inset-x-2 top-2 z-20 flex items-center justify-between gap-2" data-no-drag>
          <span
            className={[
              'inline-flex h-7 items-center rounded border px-2 text-[11px] leading-none',
              badgeKind === 'custom'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 bg-slate-50 text-slate-600',
            ].join(' ')}
          >
            {badgeText}
          </span>

          <div className="flex items-center gap-1">
            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onPreview(id)
                }}
              >
                {t('settings.skins.preview')}
              </Button>
            </div>
            {canDelete ? (
              <Button
                variant="ghost"
                className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                aria-label={t('settings.skins.delete')}
                title={t('settings.skins.delete')}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onDelete()
                }}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        </div>
        {preview}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-900 truncate">{title}</div>
          {author ? <div className="text-xs text-slate-500 truncate">{t('settings.skins.authorBy', { author })}</div> : null}
        </div>
        <div
          className={[
            'h-2.5 w-2.5 rounded-full border',
            selected ? 'bg-blue-500 border-blue-500' : 'bg-white border-slate-300',
          ].join(' ')}
          aria-hidden="true"
        />
      </div>
    </div>
  )
}

function SkinPreviewDialog({
  open,
  onOpenChange,
  selected,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  selected: SkinOption
}) {
  const { t } = useTranslation()
  const sprite = selected.skin.sprite_sheet
  const hasSprite = !!sprite?.src
  const previewRows = useMemo(() => {
    if (!hasSprite) return 0
    return getSpritePreviewRowCount(sprite?.rows ?? 7)
  }, [hasSprite, sprite?.rows])

  const defaultRowIndex = useMemo(() => {
    if (!previewRows) return 0
    return clampSpriteRowIndex(SPRITE_DEFAULT_IDLE_ROW_INDEX, previewRows)
  }, [previewRows])

  const [rowIndex, setRowIndex] = useState<number>(defaultRowIndex)
  const [loop, setLoop] = useState(false)
  const [hitAnimating, setHitAnimating] = useState(false)

  useEffect(() => {
    setRowIndex(defaultRowIndex)
  }, [defaultRowIndex])

  const playHit = () => {
    setHitAnimating(true)
    window.setTimeout(() => setHitAnimating(false), 260)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl" data-no-drag>
        <DialogHeader>
          <DialogTitle>{t('settings.skins.previewDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('settings.skins.previewDialog.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-900">
                {t('settings.skins.previewDialog.current', { title: selected.title })}
              </div>
              {selected.author ? (
                <div className="text-xs text-slate-500 mt-1 truncate">
                  {t('settings.skins.authorBy', { author: selected.author })}
                </div>
              ) : null}
            </div>

            {hasSprite ? (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="text-xs text-slate-600">{t('settings.skins.previewDialog.state')}</div>
                  <Select
                    value={String(rowIndex)}
                    onValueChange={(v) => {
                      const next = Number.parseInt(v, 10)
                      if (!Number.isFinite(next)) return
                      setRowIndex(clampSpriteRowIndex(next, previewRows || 1))
                    }}
                  >
                    <SelectTrigger className="h-8 w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: previewRows }).map((_, idx) => (
                        <SelectItem key={idx} value={String(idx)}>
                          {t(`settings.skins.previewDialog.rowLabels.row${idx + 1}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <Switch checked={loop} onCheckedChange={setLoop} />
                  <div className="text-xs text-slate-600">{t('settings.skins.previewDialog.loop')}</div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-4 rounded-xl border border-slate-200/60 bg-white overflow-hidden">
            <div className="w-[320px] h-[320px] mx-auto flex items-center justify-center">
              {hasSprite ? (
                <div className="select-none">
                  <SpriteSheetCanvas
                    src={sprite!.src}
                    size={320}
                    columns={sprite!.columns}
                    rows={sprite!.rows}
                    cropOffsetX={sprite!.cropOffsetX}
                    cropOffsetY={sprite!.cropOffsetY}
                    mood="idle"
                    rowIndex={rowIndex}
                    animate={loop}
                    frameIntervalMs={spriteRowIndexToFrameIntervalMs(rowIndex)}
                    speed={1}
                    chromaKey={sprite!.chromaKey ?? true}
                    chromaKeyAlgorithm={sprite!.chromaKeyAlgorithm ?? 'yuv'}
                    chromaKeyOptions={sprite!.chromaKeyOptions}
                    imageSmoothingEnabled={sprite!.imageSmoothingEnabled ?? true}
                    removeGridLines={sprite!.removeGridLines ?? true}
                    idleBreathe={sprite!.idleBreathe ?? true}
                    effect="none"
                  />
                </div>
              ) : (
                <WoodenFish
                  isAnimating={hitAnimating}
                  animationSpeed={1}
                  windowScale={DEFAULT_PREVIEW_WINDOW_SCALE}
                  onHit={() => {}}
                  skin={selected.skin}
                  interactive={false}
                />
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          {!hasSprite ? (
            <Button variant="secondary" onClick={playHit}>
              {t('settings.skins.previewDialog.playHit')}
            </Button>
          ) : null}
          <Button onClick={() => onOpenChange(false)}>{t('common.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

async function readFileAsBase64(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(i18n.t('settings.skins.errors.readFailed') as string))
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.readAsDataURL(file)
  })
  const comma = dataUrl.indexOf(',')
  if (comma === -1) throw new Error(i18n.t('settings.skins.errors.zipEncodeFailed') as string)
  return dataUrl.slice(comma + 1)
}

async function waitForPaint(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

function stripZipSuffix(name: string): string {
  return name.replace(/\.(zip|czs)$/i, '')
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\\\|?*\\x00-\\x1F]/g, '_')
    .replace(/\\s+/g, ' ')
    .trim()
}
