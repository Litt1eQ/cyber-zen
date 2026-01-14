import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, Loader2, Share2 } from 'lucide-react'
import { totalKeyCount, type KeyCounts } from '@/lib/keyboard'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { renderKeyboardHeatmapSharePng } from './share/renderKeyboardHeatmapShare'

async function copyPngToClipboard(blob: Blob) {
  const ClipboardItemCtor = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem
  if (!ClipboardItemCtor || !navigator.clipboard?.write) {
    throw new Error('当前环境不支持直接复制图片到剪贴板')
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
          appName: 'CyberZen',
          meritValue,
          meritLabel,
          showMeritValue,
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
      await copyPngToClipboard(pngBlob)
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
          分享
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl p-0 overflow-hidden">
        <div className="p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5 text-slate-700" />
              生成分享图片
            </DialogTitle>
            <DialogDescription>自定义隐藏内容，一键复制键盘热力图图片到剪贴板。</DialogDescription>
          </DialogHeader>

          <div className="mt-5 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">隐私与展示</div>

                <div className="mt-4 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Label className="text-sm text-slate-800">隐藏数字</Label>
                      <div className="text-xs text-slate-500 mt-1">隐藏总计与按键计数</div>
                    </div>
                    <Switch checked={hideNumbers} onCheckedChange={setHideNumbers} />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Label className="text-sm text-slate-800">隐藏按键</Label>
                      <div className="text-xs text-slate-500 mt-1">隐藏键位文字，仅保留色块</div>
                    </div>
                    <Switch checked={hideKeys} onCheckedChange={setHideKeys} />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Label className="text-sm text-slate-800">显示功德数量</Label>
                      <div className="text-xs text-slate-500 mt-1">关闭时会对功德数打码</div>
                    </div>
                    <Switch checked={showMeritValue} onCheckedChange={setShowMeritValue} />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-900">复制</div>
                  {isGenerating && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      生成中
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
                    {copied ? '已复制到剪贴板' : '复制图片到剪贴板'}
                  </Button>
                  {error && <div className="text-xs text-rose-600 break-words">{error}</div>}
                  {!hasAny && <div className="text-xs text-slate-500">暂无键盘记录，无法生成图片。</div>}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">预览</div>
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
                    {isGenerating ? '生成中…' : '暂无预览'}
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
