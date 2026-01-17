import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy, Loader2, Share2 } from 'lucide-react'
import { totalKeyCount, type KeyCounts } from '@/lib/keyboard'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { renderKeyboardHeatmapSharePng } from './share/renderKeyboardHeatmapShare'

async function copyPngToClipboard(blob: Blob, unsupportedMessage: string) {
  const ClipboardItemCtor = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem
  if (!ClipboardItemCtor || !navigator.clipboard?.write) {
    throw new Error(unsupportedMessage)
  }
  const item = new ClipboardItemCtor({ [blob.type || 'image/png']: blob })
  await navigator.clipboard.write([item])
}

export function KeyboardHeatmapShareDialog({
  unshiftedCounts,
  shiftedCounts,
  heatLevelCount,
  layoutId,
  platform,
  dateKey,
  modeLabel,
  meritValue,
  meritLabel,
}: {
  unshiftedCounts: KeyCounts
  shiftedCounts: KeyCounts
  heatLevelCount?: number | null
  layoutId?: string | null
  platform: 'mac' | 'windows' | 'linux'
  dateKey?: string | null
  modeLabel?: string
  meritValue?: number | null
  meritLabel?: string
}) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [hideNumbers, setHideNumbers] = useState(true)
  const [hideKeys, setHideKeys] = useState(true)
  const [showMeritValue, setShowMeritValue] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [pngBlob, setPngBlob] = useState<Blob | null>(null)
  const [suggestedName, setSuggestedName] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const genIdRef = useRef(0)

  const hasAny = useMemo(() => {
    return totalKeyCount(unshiftedCounts) + totalKeyCount(shiftedCounts) > 0
  }, [shiftedCounts, unshiftedCounts])

  useEffect(() => {
    if (!open) return
    setError(null)
    setCopied(false)
    setIsGenerating(true)
    genIdRef.current += 1
    const myId = genIdRef.current

    const run = async () => {
      const { blob, suggestedName: nextName } = await renderKeyboardHeatmapSharePng({
        unshiftedCounts,
        shiftedCounts,
        heatLevelCount,
        layoutId,
        platform,
        options: {
          hideNumbers,
          hideKeys,
          dateKey,
          modeLabel,
          appName: t('app.name'),
          meritValue,
          meritLabel,
          showMeritValue,
          locale: i18n.language,
          strings: {
            subtitle: t('statistics.keyboardHeatmapShare.subtitle'),
            unshiftedSectionTitle: t('statistics.keyboardHeatmap.sections.unshifted'),
            shiftedSectionTitle: t('statistics.keyboardHeatmap.sections.shifted'),
            legendLow: t('statistics.heat.low'),
            legendHigh: t('statistics.heat.high'),
            generatedBy: t('statistics.keyboardHeatmapShare.generatedBy', { appName: t('app.name') }),
            totalLabel: t('statistics.keyboardHeatmapShare.totalLabel'),
          },
        },
      })
      if (genIdRef.current !== myId) return

      setPngBlob(blob)
      setSuggestedName(nextName)
      setCopied(false)
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return URL.createObjectURL(blob)
      })
    }

    run()
      .catch((e) => {
        if (genIdRef.current !== myId) return
        setError(String(e))
        setPngBlob(null)
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return null
        })
      })
      .finally(() => {
        if (genIdRef.current !== myId) return
        setIsGenerating(false)
      })
  }, [
    dateKey,
    heatLevelCount,
    hideKeys,
    hideNumbers,
    layoutId,
    meritLabel,
    meritValue,
    modeLabel,
    open,
    platform,
    shiftedCounts,
    showMeritValue,
    unshiftedCounts,
  ])

  useEffect(() => {
    if (open) return
    genIdRef.current += 1
    setIsGenerating(false)
    setCopied(false)
    setError(null)
    setPngBlob(null)
    setSuggestedName('')
    setShowMeritValue(false)
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }, [open])

  useEffect(() => {
    return () => {
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    }
  }, [])

  const copyToClipboard = async () => {
    if (!pngBlob) return
    setError(null)
    setCopied(false)
    try {
      await copyPngToClipboard(pngBlob, t('statistics.keyboardHeatmapShare.clipboardUnsupported'))
      setCopied(true)
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-2" data-no-drag>
          <Share2 className="h-4 w-4" />
          {t('statistics.keyboardHeatmapShare.share')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl p-0">
        <div className="p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5 text-slate-700" />
              {t('statistics.keyboardHeatmapShare.title')}
            </DialogTitle>
            <DialogDescription>{t('statistics.keyboardHeatmapShare.description')}</DialogDescription>
          </DialogHeader>

          <div className="mt-5 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">{t('statistics.keyboardHeatmapShare.privacy.title')}</div>

                <div className="mt-4 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Label className="text-sm text-slate-800">{t('statistics.keyboardHeatmapShare.privacy.hideNumbers')}</Label>
                      <div className="text-xs text-slate-500 mt-1">{t('statistics.keyboardHeatmapShare.privacy.hideNumbersDesc')}</div>
                    </div>
                    <Switch checked={hideNumbers} onCheckedChange={setHideNumbers} />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Label className="text-sm text-slate-800">{t('statistics.keyboardHeatmapShare.privacy.hideKeys')}</Label>
                      <div className="text-xs text-slate-500 mt-1">{t('statistics.keyboardHeatmapShare.privacy.hideKeysDesc')}</div>
                    </div>
                    <Switch checked={hideKeys} onCheckedChange={setHideKeys} />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Label className="text-sm text-slate-800">{t('statistics.keyboardHeatmapShare.privacy.showMerit')}</Label>
                      <div className="text-xs text-slate-500 mt-1">{t('statistics.keyboardHeatmapShare.privacy.showMeritDesc')}</div>
                    </div>
                    <Switch checked={showMeritValue} onCheckedChange={setShowMeritValue} />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-900">{t('statistics.keyboardHeatmapShare.copy.title')}</div>
                  {isGenerating && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {t('statistics.keyboardHeatmapShare.generating')}
                    </div>
                  )}
                </div>

                <div className="mt-4 space-y-2">
                  <Button
                    type="button"
                    className="w-full gap-2"
                    onClick={copyToClipboard}
                    disabled={!pngBlob || isGenerating || !hasAny}
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? t('statistics.keyboardHeatmapShare.copy.copied') : t('statistics.keyboardHeatmapShare.copy.copy')}
                  </Button>
                  {error && <div className="text-xs text-rose-600 break-words">{error}</div>}
                  {!hasAny && <div className="text-xs text-slate-500">{t('statistics.keyboardHeatmapShare.noData')}</div>}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">{t('statistics.keyboardHeatmapShare.preview')}</div>
                <div className="text-xs text-slate-500">{suggestedName}</div>
              </div>

              <div
                className={cn('mt-4 rounded-lg overflow-hidden border border-slate-200', isGenerating && 'opacity-60')}
                style={{
                  backgroundColor: '#ffffff',
                  backgroundImage:
                    'linear-gradient(45deg, rgba(15,23,42,0.06) 25%, transparent 25%, transparent 75%, rgba(15,23,42,0.06) 75%, rgba(15,23,42,0.06)), linear-gradient(45deg, rgba(15,23,42,0.06) 25%, transparent 25%, transparent 75%, rgba(15,23,42,0.06) 75%, rgba(15,23,42,0.06))',
                  backgroundPosition: '0 0, 10px 10px',
                  backgroundSize: '20px 20px',
                }}
              >
                {previewUrl ? (
                  <img src={previewUrl} alt="share-preview" className="block w-full h-auto select-none" draggable={false} />
                ) : (
                  <div className="h-[420px] flex items-center justify-center text-sm text-slate-500">
                    {isGenerating ? t('statistics.keyboardHeatmapShare.generatingPreview') : t('statistics.keyboardHeatmapShare.noPreview')}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
