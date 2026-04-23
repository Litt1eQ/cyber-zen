import { useEffect, useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Live2DActionPanel } from '@/components/Live2D/Live2DActionPanel'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useLive2DStore } from '@/stores/useLive2DStore'
import type { AppSkinId } from '@/components/WoodenFish/skins'

type Live2DManagerProps = {
  selectedId: AppSkinId
  onSelect: (id: AppSkinId) => void
}

export function Live2DManager({ selectedId, onSelect }: Live2DManagerProps) {
  const { t } = useTranslation()
  const models = useLive2DStore((state) => state.models)
  const isLoading = useLive2DStore((state) => state.isLoading)
  const error = useLive2DStore((state) => state.error)
  const loadModels = useLive2DStore((state) => state.loadModels)
  const importModel = useLive2DStore((state) => state.importModel)
  const deleteModel = useLive2DStore((state) => state.deleteModel)
  const setError = useLive2DStore((state) => state.setError)
  const [importBusy, setImportBusy] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ uuid: string; name: string } | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  useEffect(() => {
    void loadModels()
  }, [loadModels])

  const handleImport = async () => {
    setError(null)
    const selected = await open({
      directory: true,
      multiple: false,
      title: t('settings.skins.live2d.pickDirectory') as string,
    })
    if (!selected || typeof selected !== 'string') return

    setImportBusy(true)
    try {
      const meta = await importModel(selected)
      onSelect(`live2d:${meta.uuid}`)
    } catch (error) {
      setError(String(error))
    } finally {
      setImportBusy(false)
    }
  }

  const handleDelete = async () => {
    const next = deleteConfirm
    if (!next) return
    setDeleteBusy(true)
    try {
      await deleteModel(next.uuid)
      if (selectedId === `live2d:${next.uuid}`) {
        onSelect('rosewood')
      }
      setDeleteConfirm(null)
    } catch (error) {
      setError(String(error))
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-500">
          {t('settings.skins.live2d.hintPrefix')}{' '}
          <span className="font-mono">.model3.json</span> {t('settings.skins.live2d.hintSuffix')}
        </div>
        <Button onClick={() => void handleImport()} disabled={importBusy}>
          {importBusy ? t('settings.skins.live2d.importing') : t('settings.skins.live2d.import')}
        </Button>
      </div>

      {error ? <div className="text-xs text-red-600">{error}</div> : null}

      {models.length === 0 && !isLoading ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
          {t('settings.skins.live2d.empty')}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {models.map((model) => {
            const id = `live2d:${model.uuid}` as AppSkinId
            const selected = selectedId === id
            return (
              <div
                key={model.uuid}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(id)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  onSelect(id)
                }}
                className={[
                  'group rounded-xl border p-3 text-left transition-colors cursor-pointer bg-white',
                  selected
                    ? 'border-blue-200 bg-blue-50/60'
                    : 'border-slate-200/60 hover:border-slate-300 hover:bg-slate-50',
                ].join(' ')}
                aria-pressed={selected}
                data-no-drag
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-900">{model.name}</div>
                    <div className="mt-1 text-xs text-slate-500 font-mono">{model.model_file}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <div
                      className={[
                        'h-2.5 w-2.5 rounded-full border shrink-0',
                        selected ? 'bg-blue-500 border-blue-500' : 'bg-white border-slate-300',
                      ].join(' ')}
                    />
                    <Button
                      variant="ghost"
                      className="h-7 w-7 p-0 text-red-600 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-50 hover:text-red-700"
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        setDeleteConfirm({ uuid: model.uuid, name: model.name })
                      }}
                      title={t('settings.skins.delete')}
                      aria-label={t('settings.skins.delete')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {(() => {
        const selectedModel = models.find((model) => selectedId === `live2d:${model.uuid}`)
        if (!selectedModel) return null
        return <Live2DActionPanel uuid={selectedModel.uuid} />
      })()}

      <Dialog open={deleteConfirm != null} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent className="max-w-md" data-no-drag>
          <DialogHeader>
            <DialogTitle>{t('settings.skins.live2d.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('settings.skins.live2d.deleteBodyPrefix')}{' '}
              <span className="font-medium text-slate-900">{deleteConfirm?.name ?? ''}</span>
              {t('settings.skins.live2d.deleteBodySuffix')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteConfirm(null)} disabled={deleteBusy}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()} disabled={deleteBusy}>
              {deleteBusy ? t('settings.skins.deleting') : t('settings.skins.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
