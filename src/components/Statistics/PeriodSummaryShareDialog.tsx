import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy, Loader2, Share2 } from 'lucide-react'
import type { DailyStats } from '@/types/merit'
import type { PeriodSummaryRange } from '@/lib/periodSummary'
import { computePeriodSummary } from '@/lib/periodSummary'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { renderPeriodSummarySharePng } from './share/renderPeriodSummaryShare'
import { copyPngToClipboard } from '@/lib/copyPngToClipboard'

function rangeLabelKey(range: PeriodSummaryRange) {
  if (range === 'today') return 'statistics.periodSummaryShare.ranges.today'
  if (range === 'yesterday') return 'statistics.periodSummaryShare.ranges.yesterday'
  if (range === 'last7') return 'statistics.periodSummaryShare.ranges.lastWeek'
  return 'statistics.periodSummaryShare.ranges.lastMonth'
}

export function PeriodSummaryShareDialog({
  allDays,
  todayKey,
  heatLevelCount,
  layoutId,
  platform,
  range,
  onRangeChange,
}: {
  allDays: DailyStats[]
  todayKey: string
  heatLevelCount?: number | null
  layoutId?: string | null
  platform: 'mac' | 'windows' | 'linux'
  range: PeriodSummaryRange
  onRangeChange: (range: PeriodSummaryRange) => void
}) {
  const { t, i18n } = useTranslation()
  const { settings, updateSettings } = useSettingsStore()
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

  const persistedHideNumbers = settings?.keyboard_heatmap_share_hide_numbers ?? true
  const persistedHideKeys = settings?.keyboard_heatmap_share_hide_keys ?? true
  const persistedShowMeritValue = settings?.keyboard_heatmap_share_show_merit_value ?? false

  const summary = useMemo(() => {
    return computePeriodSummary(allDays, todayKey, range)
  }, [allDays, range, todayKey])

  const hasAny = (summary?.totals.total ?? 0) > 0

  useEffect(() => {
    if (!open) return
    setHideNumbers(persistedHideNumbers)
    setHideKeys(persistedHideKeys)
    setShowMeritValue(persistedShowMeritValue)
  }, [open, persistedHideKeys, persistedHideNumbers, persistedShowMeritValue])

  useEffect(() => {
    if (!open) return
    if (!summary) return
    setError(null)
    setCopied(false)
    setIsGenerating(true)
    genIdRef.current += 1
    const myId = genIdRef.current

    const run = async () => {
      const dateRangeLabel =
        summary.expectedDays <= 1 || summary.startKey === summary.endKey
          ? summary.endKey
          : `${summary.startKey} ~ ${summary.endKey}`
      const coverageLine = t('statistics.periodSummary.coverage', {
        covered: summary.days.length,
        expected: summary.expectedDays,
      })
      const { blob, suggestedName: nextName } = await renderPeriodSummarySharePng({
        summary,
        unshiftedCounts: summary.aggregates.keyCountsUnshifted,
        shiftedCounts: summary.aggregates.keyCountsShifted,
        heatLevelCount,
        layoutId,
        platform,
        options: {
          hideNumbers,
          hideKeys,
          showMeritValue,
          appName: t('app.name'),
          locale: i18n.language,
          strings: {
            title: t(rangeLabelKey(range)),
            subtitle: t('statistics.periodSummaryShare.subtitle'),
            dateRangeLabel,
            dateLine: dateRangeLabel,
            coverageLine,
            totalMeritTitle: t('statistics.periodSummaryShare.totalMeritTitle'),
            sourceDistributionTitle: t('statistics.todayOverview.sourceDistribution'),
            keyboardLabel: t('statistics.periodSummaryShare.labels.keyboard'),
            mouseLabel: t('statistics.periodSummaryShare.labels.mouse'),
            firstEventLabel: t('statistics.periodSummaryShare.labels.firstEvent'),
            lastEventLabel: t('statistics.periodSummaryShare.labels.lastEvent'),
            heatmapTitle: t('statistics.periodSummaryShare.heatmapTitle'),
            unshiftedSectionTitle: t('statistics.keyboardHeatmap.sections.unshifted'),
            shiftedSectionTitle: t('statistics.keyboardHeatmap.sections.shifted'),
            legendLow: t('statistics.heat.low'),
            legendHigh: t('statistics.heat.high'),
            generatedBy: t('statistics.keyboardHeatmapShare.generatedBy', { appName: t('app.name') }),
            noData: t('statistics.noData'),
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
    heatLevelCount,
    hideKeys,
    hideNumbers,
    i18n.language,
    layoutId,
    open,
    platform,
    range,
    showMeritValue,
    summary,
    t,
  ])

  useEffect(() => {
    if (open) return
    genIdRef.current += 1
    setIsGenerating(false)
    setCopied(false)
    setError(null)
    setPngBlob(null)
    setSuggestedName('')
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
          {t('statistics.periodSummaryShare.share')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl p-0">
        <div className="p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5 text-slate-700" />
              {t('statistics.periodSummaryShare.title')}
            </DialogTitle>
            <DialogDescription>{t('statistics.periodSummaryShare.description')}</DialogDescription>
          </DialogHeader>

          <div className="mt-5 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">{t('statistics.periodSummaryShare.rangeTitle')}</div>
                <div className="mt-3 flex flex-wrap gap-2" data-no-drag>
                  <Button
                    type="button"
                    size="sm"
                    variant={range === 'today' ? 'secondary' : 'outline'}
                    onClick={() => onRangeChange('today')}
                    data-no-drag
                  >
                    {t(rangeLabelKey('today'))}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={range === 'yesterday' ? 'secondary' : 'outline'}
                    onClick={() => onRangeChange('yesterday')}
                    data-no-drag
                  >
                    {t(rangeLabelKey('yesterday'))}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={range === 'last7' ? 'secondary' : 'outline'}
                    onClick={() => onRangeChange('last7')}
                    data-no-drag
                  >
                    {t(rangeLabelKey('last7'))}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={range === 'last30' ? 'secondary' : 'outline'}
                    onClick={() => onRangeChange('last30')}
                    data-no-drag
                  >
                    {t(rangeLabelKey('last30'))}
                  </Button>
                </div>
                <div className="mt-3 text-xs text-slate-500 tabular-nums">
                  {summary
                    ? summary.startKey === summary.endKey
                      ? summary.endKey
                      : `${summary.startKey} ~ ${summary.endKey}`
                    : t('statistics.noData')}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">{t('statistics.periodSummaryShare.privacy.title')}</div>

                <div className="mt-4 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Label className="text-sm text-slate-800">{t('statistics.periodSummaryShare.privacy.hideNumbers')}</Label>
                      <div className="text-xs text-slate-500 mt-1">{t('statistics.periodSummaryShare.privacy.hideNumbersDesc')}</div>
                    </div>
                    <Switch
                      checked={hideNumbers}
                      onCheckedChange={(v) => {
                        setHideNumbers(v)
                        void updateSettings({ keyboard_heatmap_share_hide_numbers: v })
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Label className="text-sm text-slate-800">{t('statistics.periodSummaryShare.privacy.hideKeys')}</Label>
                      <div className="text-xs text-slate-500 mt-1">{t('statistics.periodSummaryShare.privacy.hideKeysDesc')}</div>
                    </div>
                    <Switch
                      checked={hideKeys}
                      onCheckedChange={(v) => {
                        setHideKeys(v)
                        void updateSettings({ keyboard_heatmap_share_hide_keys: v })
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Label className="text-sm text-slate-800">{t('statistics.periodSummaryShare.privacy.showMerit')}</Label>
                      <div className="text-xs text-slate-500 mt-1">{t('statistics.periodSummaryShare.privacy.showMeritDesc')}</div>
                    </div>
                    <Switch
                      checked={showMeritValue}
                      onCheckedChange={(v) => {
                        setShowMeritValue(v)
                        void updateSettings({ keyboard_heatmap_share_show_merit_value: v })
                      }}
                    />
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
                  {!hasAny && <div className="text-xs text-slate-500">{t('statistics.periodSummaryShare.noData')}</div>}
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
