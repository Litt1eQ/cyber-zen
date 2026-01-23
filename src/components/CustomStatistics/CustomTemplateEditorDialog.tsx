import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { CustomStatisticsTemplate, CustomStatisticsTemplateUpsert } from '@/types/customStatisticsTemplates'
import type { WidgetRenderContext } from '@/components/CustomStatistics/registry'
import { CustomWidgetSandbox } from '@/components/CustomStatistics/CustomWidgetSandbox'
import { Switch } from '@/components/ui/switch'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CUSTOM_TEMPLATE_EXAMPLES, DEFAULT_CUSTOM_TEMPLATE_EXAMPLE_ID, getCustomTemplateExample } from '@/components/CustomStatistics/templateExamples'

const KEEP_CURRENT_EXAMPLE_ID = '__current__' as const

export function CustomTemplateEditorDialog({
  open,
  onOpenChange,
  initial,
  ctx,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial: CustomStatisticsTemplate | null
  ctx: WidgetRenderContext & { range: 'today' | 'all' }
  onSave: (template: CustomStatisticsTemplateUpsert) => Promise<CustomStatisticsTemplate>
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [heightText, setHeightText] = useState('')
  const [exampleId, setExampleId] = useState<string>(DEFAULT_CUSTOM_TEMPLATE_EXAMPLE_ID)
  const [html, setHtml] = useState('')
  const [css, setCss] = useState('')
  const [js, setJs] = useState('')
  const [paramsText, setParamsText] = useState('{\n  \n}')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(true)

  const parsedHeightPx = useMemo(() => {
    const raw = heightText.trim()
    if (!raw) return null
    const n = Number(raw)
    if (!Number.isFinite(n)) return null
    const int = Math.floor(n)
    if (int <= 0) return null
    return int
  }, [heightText])

  useEffect(() => {
    if (!open) return
    setError(null)
    setBusy(false)
    setPreview(true)
    if (initial) {
      setExampleId(KEEP_CURRENT_EXAMPLE_ID)
      setName(initial.name ?? t('customStatistics.customTemplates.untitled'))
      setHeightText(initial.height_px ? String(initial.height_px) : '')
      setHtml(initial.html ?? '')
      setCss(initial.css ?? '')
      setJs(initial.js ?? '')
      setParamsText(JSON.stringify(initial.params ?? {}, null, 2))
      return
    }
    const example = getCustomTemplateExample(DEFAULT_CUSTOM_TEMPLATE_EXAMPLE_ID)
    setExampleId(DEFAULT_CUSTOM_TEMPLATE_EXAMPLE_ID)
    setName(example ? t(example.titleKey) : t('customStatistics.customTemplates.untitled'))
    setHeightText(example?.template.height_px ? String(example.template.height_px) : '')
    setHtml(example?.template.html ?? '')
    setCss(example?.template.css ?? '')
    setJs(example?.template.js ?? '')
    setParamsText(JSON.stringify(example?.template.params ?? {}, null, 2))
  }, [initial, open, t])

  const applyExample = (nextId: string) => {
    if (nextId === KEEP_CURRENT_EXAMPLE_ID) return
    const example = getCustomTemplateExample(nextId)
    if (!example) return
    setHtml(example.template.html)
    setCss(example.template.css)
    setJs(example.template.js)
    setHeightText(example.template.height_px ? String(example.template.height_px) : '')
    setParamsText(JSON.stringify(example.template.params ?? {}, null, 2))
    if (!initial) setName(t(example.titleKey))
  }

  const draftTemplate: CustomStatisticsTemplate = useMemo(() => {
    const now = Date.now()
    return {
      id: initial?.id ?? 'preview',
      name,
      height_px: parsedHeightPx,
      html,
      css,
      js,
      params: (() => {
        try {
          return JSON.parse(paramsText || '{}')
        } catch {
          return {}
        }
      })(),
      created_at_ms: initial?.created_at_ms ?? now,
      updated_at_ms: now,
      version: initial?.version ?? 1,
    }
  }, [css, html, initial?.created_at_ms, initial?.id, initial?.version, js, name, paramsText, parsedHeightPx])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl" data-no-drag>
        <DialogHeader>
          <DialogTitle>
            {initial ? t('customStatistics.customTemplates.editTitle') : t('customStatistics.customTemplates.createTitle')}
          </DialogTitle>
          <DialogDescription>{t('customStatistics.customTemplates.description')}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <div className="text-sm font-medium text-slate-900 mb-1">{t('customStatistics.customTemplates.examples.title')}</div>
              <Select
                value={exampleId}
                onValueChange={(v) => {
                  setExampleId(v)
                  applyExample(v)
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('customStatistics.customTemplates.examples.placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  {initial && <SelectItem value={KEEP_CURRENT_EXAMPLE_ID}>{t('customStatistics.customTemplates.examples.keepCurrent')}</SelectItem>}
                  {CUSTOM_TEMPLATE_EXAMPLES.map((ex) => (
                    <SelectItem key={ex.id} value={ex.id}>
                      {t(ex.titleKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="mt-1 text-[11px] text-slate-500">
                {(() => {
                  const ex = getCustomTemplateExample(exampleId)
                  if (!ex) return t('customStatistics.customTemplates.examples.hint')
                  return t(ex.descriptionKey)
                })()}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="text-sm font-medium text-slate-900 mb-1">{t('customStatistics.customTemplates.fields.name')}</div>
                <Input
                  value={name}
                  onChange={(e) => setName(e.currentTarget.value)}
                  placeholder={t('customStatistics.customTemplates.untitled')}
                />
              </div>
              <div>
                <div className="text-sm font-medium text-slate-900 mb-1">{t('customStatistics.customTemplates.fields.height')}</div>
                <Input
                  inputMode="numeric"
                  value={heightText}
                  onChange={(e) => setHeightText(e.currentTarget.value)}
                  placeholder={t('customStatistics.customTemplates.heightAuto')}
                />
                <div className="mt-1 text-[11px] text-slate-500">{t('customStatistics.customTemplates.heightHint')}</div>
              </div>
            </div>

            <Tabs defaultValue="html">
              <TabsList className="w-full justify-start">
                <TabsTrigger value="html">HTML</TabsTrigger>
                <TabsTrigger value="css">CSS</TabsTrigger>
                <TabsTrigger value="js">JS</TabsTrigger>
              <TabsTrigger value="params">{t('customStatistics.customTemplates.fields.params')}</TabsTrigger>
            </TabsList>
            <TabsContent value="html">
              <Textarea value={html} onChange={(e) => setHtml(e.currentTarget.value)} className="font-mono min-h-[220px]" />
            </TabsContent>
              <TabsContent value="css">
                <Textarea value={css} onChange={(e) => setCss(e.currentTarget.value)} className="font-mono min-h-[220px]" />
              </TabsContent>
              <TabsContent value="js">
                <Textarea value={js} onChange={(e) => setJs(e.currentTarget.value)} className="font-mono min-h-[220px]" />
              </TabsContent>
              <TabsContent value="params">
                <Textarea
                  value={paramsText}
                  onChange={(e) => setParamsText(e.currentTarget.value)}
                  className="font-mono min-h-[220px]"
                />
                <div className="mt-2 text-xs text-slate-500">{t('customStatistics.customTemplates.paramsHint')}</div>
              </TabsContent>
            </Tabs>

            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-slate-700">{t('customStatistics.customTemplates.preview')}</div>
              <Switch checked={preview} onCheckedChange={setPreview} data-no-drag />
            </div>

            {error && <div className="text-xs text-red-600 whitespace-pre-wrap">{error}</div>}
          </div>

          <div className="space-y-3">
            <Card className="p-4">
              <div className="text-sm font-medium text-slate-900">{t('customStatistics.customTemplates.apiTitle')}</div>
              <div className="mt-2 text-xs text-slate-600 whitespace-pre-wrap">
                {t('customStatistics.customTemplates.apiBody')}
              </div>
            </Card>

            {preview ? (
              <CustomWidgetSandbox template={draftTemplate} ctx={ctx} />
            ) : (
              <Card className="p-6 text-sm text-slate-500">{t('customStatistics.customTemplates.previewOff')}</Card>
            )}
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between gap-3">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={busy} data-no-drag>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={() => {
              void (async () => {
                setError(null)
                let params: any = {}
                try {
                  params = JSON.parse(paramsText || '{}')
                } catch (e) {
                  setError(t('customStatistics.customTemplates.errors.paramsInvalid'))
                  return
                }
                setBusy(true)
                try {
                  const saved = await onSave({
                    id: initial?.id ?? null,
                    name,
                    height_px: parsedHeightPx,
                    html,
                    css,
                    js,
                    params,
                  })
                  onOpenChange(false)
                  return saved
                } catch (e: any) {
                  setError(String(e))
                } finally {
                  setBusy(false)
                }
              })()
            }}
            data-no-drag
          >
            {busy ? t('customStatistics.customTemplates.saving') : t('customStatistics.customTemplates.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
