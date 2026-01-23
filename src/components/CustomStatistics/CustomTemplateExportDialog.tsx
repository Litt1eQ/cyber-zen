import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy, Download } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { CustomStatisticsTemplate } from '@/types/customStatisticsTemplates'
import { copyTextToClipboard } from '@/lib/copyTextToClipboard'
import { downloadTextFile } from '@/lib/downloadTextFile'
import { buildCustomWidgetsExportFileV1, defaultCustomWidgetsExportFilename } from '@/lib/customStatisticsTemplateTransfer'

export function CustomTemplateExportDialog({
  open,
  onOpenChange,
  templates,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  templates: CustomStatisticsTemplate[]
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const payload = useMemo(() => buildCustomWidgetsExportFileV1(templates), [templates])
  const jsonText = useMemo(() => JSON.stringify(payload, null, 2), [payload])
  const filename = useMemo(() => defaultCustomWidgetsExportFilename(templates.length), [templates.length])

  useEffect(() => {
    if (!open) return
    setCopied(false)
    setError(null)
  }, [open])

  const copy = async () => {
    setError(null)
    setCopied(false)
    try {
      await copyTextToClipboard(jsonText, t('customStatistics.customTemplates.transfer.clipboardUnsupported'))
      setCopied(true)
    } catch (e) {
      setError(String(e))
    }
  }

  const download = () => {
    setError(null)
    try {
      downloadTextFile({ filename, text: jsonText, mime: 'application/json' })
    } catch (e) {
      setError(String(e))
    }
  }

  const title =
    templates.length === 1
      ? t('customStatistics.customTemplates.transfer.exportOneTitle', { name: templates[0]?.name ?? '' })
      : t('customStatistics.customTemplates.transfer.exportAllTitle', { count: templates.length })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" data-no-drag>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t('customStatistics.customTemplates.transfer.exportDescription')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-slate-500 tabular-nums">{filename}</div>
            <div className="flex items-center gap-2" data-no-drag>
              <Button type="button" variant="outline" size="sm" onClick={download} className="gap-2" data-no-drag>
                <Download className="h-4 w-4" />
                {t('customStatistics.customTemplates.transfer.download')}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={copy} className="gap-2" data-no-drag>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? t('customStatistics.customTemplates.transfer.copied') : t('customStatistics.customTemplates.transfer.copy')}
              </Button>
            </div>
          </div>

          <Textarea value={jsonText} readOnly className="font-mono min-h-[320px]" />

          {error && <div className="text-xs text-red-600 whitespace-pre-wrap">{error}</div>}
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} data-no-drag>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

