import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '@tauri-apps/api/core'
import { openPath } from '@tauri-apps/plugin-opener'
import { WOODEN_FISH_SKINS, type BuiltinWoodenFishSkinId, type WoodenFishSkin, type WoodenFishSkinId } from '../WoodenFish/skins'
import { useCustomWoodenFishSkins } from '../../hooks/useCustomWoodenFishSkins'
import { COMMANDS } from '../../types/events'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { WoodenFish } from '../WoodenFish'
import i18n from '@/i18n'

const DEFAULT_PREVIEW_WINDOW_SCALE = 100

type SkinOption = {
  id: WoodenFishSkinId
  title: string
  skin: WoodenFishSkin
  kind: 'builtin' | 'custom'
}

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
  const [importError, setImportError] = useState<string | null>(null)
  const [exportBusy, setExportBusy] = useState(false)
  const [exportPath, setExportPath] = useState<string | null>(null)
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: WoodenFishSkinId; title: string } | null>(null)
  const [previewId, setPreviewId] = useState<WoodenFishSkinId | null>(null)
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

  const openImport = () => {
    setImportError(null)
    setExportPath(null)
    fileInputRef.current?.click()
  }

  const handleImportFile = async (file: File) => {
    setImportBusy(true)
    setImportError(null)
    setExportPath(null)
    try {
      const zipBase64 = await readFileAsBase64(file)
      const name = stripZipSuffix(file.name)
      const skin = await invoke<{ id: WoodenFishSkinId }>(COMMANDS.IMPORT_CUSTOM_WOODEN_FISH_SKIN_ZIP, {
        zipBase64,
        name,
      })
      await reload()
      if (skin?.id) onSelect(skin.id)
    } catch (e) {
      setImportError(String(e))
    } finally {
      setImportBusy(false)
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
      const path = await invoke<string>(COMMANDS.EXPORT_WOODEN_FISH_SKIN_ZIP, { id, fileName })
      setExportPath(path)
      await openPath(path)
    } catch (e) {
      setImportError(String(e))
    } finally {
      setExportBusy(false)
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-medium text-slate-900">{t('settings.skins.title')}</div>
          <div className="text-sm text-slate-500 mt-1">
            {t('settings.skins.importHintPrefix')}{' '}
            <span className="font-mono">muyu.png</span> {t('settings.skins.importHintAnd')}{' '}
            <span className="font-mono">hammer.png</span>
            {t('settings.skins.importHintSuffix')}
          </div>
          {loading && <div className="text-xs text-slate-500 mt-2">{t('settings.skins.loading')}</div>}
          {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
        </div>
        <div className="shrink-0 flex items-center gap-2" data-no-drag>
          <Button variant="secondary" onClick={() => setPreviewId(selectedOption.id)}>
            {t('settings.skins.previewReference')}
          </Button>
          <Button
            variant="secondary"
            disabled={exportBusy}
            onClick={() => void handleDownloadZip('rosewood', 'wooden-fish-skin-template.zip')}
          >
            {t('settings.skins.downloadTemplate')}
          </Button>
          <Button
            variant="secondary"
            disabled={exportBusy}
            onClick={() =>
              void handleDownloadZip(
                effectiveSelectedId,
                sanitizeFileName(`wooden-fish-skin-${selectedOption.title}-${effectiveSelectedId}.zip`)
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
            accept=".zip,application/zip"
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

      <div className="mt-4 grid grid-cols-2 gap-3" data-no-drag>
        {options.map((opt) => (
          <SkinPreviewCard
            key={opt.id}
            id={opt.id}
            title={opt.title}
            selected={effectiveSelectedId === opt.id}
            skin={opt.skin}
            badgeText={opt.kind === 'custom' ? t('settings.skins.badge.custom') : t('settings.skins.badge.builtin')}
            badgeKind={opt.kind}
            canDelete={opt.kind === 'custom'}
            onDelete={() => setDeleteConfirm({ id: opt.id, title: opt.title })}
            onSelect={(id) => onSelect(id)}
            onPreview={(id) => setPreviewId(id)}
          />
        ))}
      </div>

      <SkinPreviewDialog
        open={previewId != null}
        onOpenChange={(open) => {
          if (!open) setPreviewId(null)
        }}
        selected={previewId ? (options.find((o) => o.id === previewId) ?? selectedOption) : selectedOption}
      />

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

function SkinPreviewCard({
  id,
  title,
  selected,
  skin,
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
  badgeText: string
  badgeKind: 'builtin' | 'custom'
  canDelete: boolean
  onDelete: () => void
  onSelect: (id: WoodenFishSkinId) => void
  onPreview: (id: WoodenFishSkinId) => void
}) {
  const { t } = useTranslation()
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
        'group text-left rounded-xl border p-3 transition-colors relative',
        selected
          ? 'border-blue-200 bg-blue-50/60'
          : 'border-slate-200/60 bg-white hover:border-slate-300 hover:bg-slate-50',
      ].join(' ')}
      aria-pressed={selected}
      data-no-drag
    >
      <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" className="h-7 px-2 text-xs" onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onPreview(id)
        }}>
          {t('settings.skins.preview')}
        </Button>
      </div>

      <div className="relative aspect-[4/3] w-full rounded-lg overflow-hidden border border-slate-200/60 bg-white">
        <div className="absolute left-2 top-2 z-10">
          <span
            className={[
              'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] leading-none',
              badgeKind === 'custom'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 bg-slate-50 text-slate-600',
            ].join(' ')}
          >
            {badgeText}
          </span>
        </div>
        <img
          src={skin.body.src}
          alt={skin.body.alt}
          draggable={false}
          className="absolute left-1/2 top-1/2 h-[76%] w-auto -translate-x-1/2 -translate-y-1/2 select-none"
        />
        <img
          src={skin.hammer.src}
          alt={skin.hammer.alt}
          draggable={false}
          className="absolute right-2 top-2 h-[44%] w-auto rotate-[12deg] select-none drop-shadow-sm opacity-95"
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-slate-900 truncate">{title}</div>
        <div
          className={[
            'h-2.5 w-2.5 rounded-full border',
            selected ? 'bg-blue-500 border-blue-500' : 'bg-white border-slate-300',
          ].join(' ')}
          aria-hidden="true"
        />
      </div>

      {canDelete && (
        <div className="mt-2 flex justify-end" data-no-drag>
          <Button
            variant="ghost"
            className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onDelete()
            }}
          >
            {t('settings.skins.delete')}
          </Button>
        </div>
      )}
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
  const [animating, setAnimating] = useState(false)

  const play = () => {
    setAnimating(true)
    window.setTimeout(() => setAnimating(false), 260)
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

        <div className="grid grid-cols-2 gap-4">
          <PreviewBlock title={t('settings.skins.previewDialog.defaultRosewood')} skin={WOODEN_FISH_SKINS.rosewood} animating={animating} />
          <PreviewBlock title={t('settings.skins.previewDialog.current', { title: selected.title })} skin={selected.skin} animating={animating} />
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={play}>
            {t('settings.skins.previewDialog.playHit')}
          </Button>
          <Button onClick={() => onOpenChange(false)}>{t('common.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PreviewBlock({
  title,
  skin,
  animating,
}: {
  title: string
  skin: WoodenFishSkin
  animating: boolean
}) {
  return (
    <div>
      <div className="text-sm font-medium text-slate-900">{title}</div>
      <div className="mt-2 rounded-xl border border-slate-200/60 bg-slate-50 p-3">
        <div className="w-[320px] h-[320px] mx-auto rounded-lg border border-dashed border-slate-300 bg-white overflow-hidden">
          <WoodenFish
            isAnimating={animating}
            animationSpeed={1}
            windowScale={DEFAULT_PREVIEW_WINDOW_SCALE}
            onHit={() => {}}
            skin={skin}
            interactive={false}
          />
        </div>
      </div>
    </div>
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

function stripZipSuffix(name: string): string {
  return name.replace(/\.zip$/i, '')
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\\\|?*\\x00-\\x1F]/g, '_')
    .replace(/\\s+/g, ' ')
    .trim()
}
