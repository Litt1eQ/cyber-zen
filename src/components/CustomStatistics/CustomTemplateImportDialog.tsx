import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Card } from '@/components/ui/card'
import type { CustomStatisticsTemplate, CustomStatisticsTemplateUpsert } from '@/types/customStatisticsTemplates'
import {
  dedupeImportNames,
  parseCustomWidgetsImportJson,
  toUpsertTemplate,
  type CustomWidgetExportTemplateV1,
} from '@/lib/customStatisticsTemplateTransfer'

export function CustomTemplateImportDialog({
  open,
  onOpenChange,
  existingTemplates,
  upsertTemplate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingTemplates: CustomStatisticsTemplate[]
  upsertTemplate: (template: CustomStatisticsTemplateUpsert) => Promise<CustomStatisticsTemplate>
}) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [rawText, setRawText] = useState('')
  const [busy, setBusy] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [preview, setPreview] = useState<CustomWidgetExportTemplateV1[] | null>(null)
  const [preserveIds, setPreserveIds] = useState(false)
  const [autoRename, setAutoRename] = useState(true)
  const [result, setResult] = useState<{ imported: number; failed: number; errors: string[] } | null>(null)

  const existingNames = useMemo(() => new Set(existingTemplates.map((x) => x.name)), [existingTemplates])

  useEffect(() => {
    if (!open) return
    setBusy(false)
    setParseError(null)
    setWarnings([])
    setPreview(null)
    setPreserveIds(false)
    setAutoRename(true)
    setResult(null)
    setRawText('')
  }, [open])

  const readFile = async (file: File) => {
    const text = await file.text()
    setRawText(text)
    setParseError(null)
    setWarnings([])
    setPreview(null)
    setResult(null)
  }

  const parse = () => {
    setParseError(null)
    setWarnings([])
    setPreview(null)
    setResult(null)
    try {
      const { templates, warnings } = parseCustomWidgetsImportJson(rawText)
      const next = autoRename ? dedupeImportNames(templates, existingNames) : templates
      setWarnings(warnings)
      setPreview(next)
    } catch (e) {
      const raw = String(e)
      const code = raw.replace(/^Error:\s*/i, '').trim()
      if (code === 'empty') setParseError(t('customStatistics.customTemplates.transfer.errors.empty'))
      else if (code === 'format_invalid') setParseError(t('customStatistics.customTemplates.transfer.errors.formatInvalid'))
      else if (code === 'no_templates') setParseError(t('customStatistics.customTemplates.transfer.errors.noTemplates'))
      else setParseError(raw)
    }
  }

  const doImport = async () => {
    if (!preview || preview.length === 0) return
    setBusy(true)
    setResult(null)
    const errors: string[] = []
    let imported = 0
    let failed = 0

    for (const item of preview) {
      try {
        await upsertTemplate(toUpsertTemplate(item, { preserveId: preserveIds }))
        imported += 1
      } catch (e) {
        failed += 1
        errors.push(String(e))
        if (String(e).includes('templates_limit_reached')) break
      }
    }

    setResult({ imported, failed, errors })
    setBusy(false)
  }

  const renderWarning = (w: string) => {
    if (w === 'schema_mismatch') return t('customStatistics.customTemplates.transfer.warnings.schemaMismatch')
    if (w === 'import_single_legacy') return t('customStatistics.customTemplates.transfer.warnings.legacySingle')
    if (w === 'import_array_legacy') return t('customStatistics.customTemplates.transfer.warnings.legacyArray')
    return w
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl" data-no-drag>
        <DialogHeader>
          <DialogTitle>{t('customStatistics.customTemplates.transfer.importTitle')}</DialogTitle>
          <DialogDescription>{t('customStatistics.customTemplates.transfer.importDescription')}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
          <div className="space-y-3">
            <Tabs defaultValue="paste">
              <TabsList className="w-full justify-start">
                <TabsTrigger value="paste">{t('customStatistics.customTemplates.transfer.pasteTab')}</TabsTrigger>
                <TabsTrigger value="file">{t('customStatistics.customTemplates.transfer.fileTab')}</TabsTrigger>
              </TabsList>
              <TabsContent value="paste">
                <Textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.currentTarget.value)}
                  placeholder={t('customStatistics.customTemplates.transfer.pastePlaceholder')}
                  className="font-mono min-h-[280px]"
                />
              </TabsContent>
              <TabsContent value="file">
                <Card className="p-4">
                  <div className="text-sm font-medium text-slate-900">{t('customStatistics.customTemplates.transfer.fileTitle')}</div>
                  <div className="mt-1 text-xs text-slate-500">{t('customStatistics.customTemplates.transfer.fileHint')}</div>
                  <div className="mt-3 flex items-center gap-2" data-no-drag>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="application/json,.json"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.currentTarget.files?.[0]
                        if (!f) return
                        void readFile(f)
                        e.currentTarget.value = ''
                      }}
                    />
                    <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} data-no-drag>
                      {t('customStatistics.customTemplates.transfer.chooseFile')}
                    </Button>
                    <div className="text-xs text-slate-500 truncate">
                      {rawText ? t('customStatistics.customTemplates.transfer.fileLoaded') : t('customStatistics.customTemplates.transfer.fileNotLoaded')}
                    </div>
                  </div>
                </Card>
              </TabsContent>
            </Tabs>

            <div className="flex flex-wrap items-center justify-between gap-3" data-no-drag>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="text-sm text-slate-700">{t('customStatistics.customTemplates.transfer.autoRename')}</div>
                  <Switch checked={autoRename} onCheckedChange={setAutoRename} data-no-drag />
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-sm text-slate-700">{t('customStatistics.customTemplates.transfer.preserveIds')}</div>
                  <Switch checked={preserveIds} onCheckedChange={setPreserveIds} data-no-drag />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={parse} disabled={!rawText.trim() || busy} data-no-drag>
                  {t('customStatistics.customTemplates.transfer.preview')}
                </Button>
                <Button type="button" onClick={() => void doImport()} disabled={!preview?.length || busy} data-no-drag>
                  {busy ? t('customStatistics.customTemplates.transfer.importing') : t('customStatistics.customTemplates.transfer.import')}
                </Button>
              </div>
            </div>

            {parseError && <div className="text-xs text-red-600 whitespace-pre-wrap">{parseError}</div>}
            {result && (
              <div className="text-xs text-slate-700">
                {t('customStatistics.customTemplates.transfer.result', {
                  imported: result.imported,
                  failed: result.failed,
                })}
                {result.errors.length > 0 && (
                  <div className="mt-2 text-xs text-red-600 whitespace-pre-wrap">{result.errors.slice(0, 6).join('\n')}</div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <Card className="p-4">
              <div className="text-sm font-medium text-slate-900">{t('customStatistics.customTemplates.transfer.securityTitle')}</div>
              <div className="mt-2 text-xs text-slate-600 whitespace-pre-wrap">
                {t('customStatistics.customTemplates.transfer.securityBody')}
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium text-slate-900">{t('customStatistics.customTemplates.transfer.previewTitle')}</div>
                <div className="text-xs text-slate-500 tabular-nums">
                  {preview?.length ? t('customStatistics.customTemplates.transfer.count', { count: preview.length }) : '—'}
                </div>
              </div>
              {warnings.length > 0 && (
                <div className="mt-2 text-xs text-amber-700 whitespace-pre-wrap">{warnings.map(renderWarning).join('\n')}</div>
              )}
              <div className="mt-3 space-y-2">
                {preview?.length ? (
                  preview.slice(0, 8).map((tpl, idx) => (
                    <div key={idx} className="rounded-lg border border-slate-200/60 bg-white px-3 py-2">
                      <div className="text-sm font-medium text-slate-900 truncate">{tpl.name}</div>
                      <div className="mt-1 text-[11px] text-slate-500 tabular-nums">
                        HTML {tpl.html.length.toLocaleString()} · CSS {tpl.css.length.toLocaleString()} · JS {tpl.js.length.toLocaleString()}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-slate-500">{t('customStatistics.customTemplates.transfer.previewEmpty')}</div>
                )}
              </div>
              {preview && preview.length > 8 && (
                <div className="mt-2 text-xs text-slate-500">
                  {t('customStatistics.customTemplates.transfer.more', { count: preview.length - 8 })}
                </div>
              )}
            </Card>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={busy} data-no-drag>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
