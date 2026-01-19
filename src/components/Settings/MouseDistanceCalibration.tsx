import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { MeritStats, Settings } from '@/types/merit'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { useDisplayMonitors } from '@/hooks/useDisplayMonitors'
import { effectivePpiForDisplay, formatCentimeters, pixelsToCentimeters, ppiFromDiagonalPx } from '@/lib/mouseDistance'

const SCREEN_DIAGONAL_PRESETS_IN = [13, 14, 15.6, 21.5, 24, 27, 32, 34, 38, 43, 49]

export function MouseDistanceCalibration({
  settings,
  stats,
  updateSettings,
}: {
  settings: Settings
  stats: MeritStats | null
  updateSettings: (patch: Partial<Settings>) => Promise<void>
}) {
  const { t } = useTranslation()
  const displayMonitors = useDisplayMonitors()

  const perDisplayCfg = settings.mouse_distance_displays ?? {}

  const updateMouseDistanceDisplay = useCallback(
    async (monitorId: string, patch: { diagonal_in?: number | null; ppi_override?: number | null }) => {
      const current = settings.mouse_distance_displays ?? {}
      const prev = current[monitorId] ?? {}
      const next = { ...prev, ...patch }
      const diagonal = next.diagonal_in
      const override = next.ppi_override
      const hasAny =
        (diagonal != null && Number.isFinite(diagonal) && diagonal > 0) ||
        (override != null && Number.isFinite(override) && override > 0)
      const nextMap = { ...current }
      if (!hasAny) {
        delete nextMap[monitorId]
      } else {
        nextMap[monitorId] = next
      }
      await updateSettings({ mouse_distance_displays: nextMap })
    },
    [settings.mouse_distance_displays, updateSettings],
  )

  const todayByDisplay = stats?.today?.mouse_move_distance_px_by_display ?? null

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-slate-900">{t('settings.mouseDistance.displays')}</div>
          <div className="text-sm text-slate-500 mt-1">{t('settings.mouseDistance.displaysDesc')}</div>
        </div>
        <div className="flex items-center gap-2" data-no-drag>
          <Button type="button" variant="outline" size="sm" onClick={() => void displayMonitors.refresh()} data-no-drag>
            {t('common.refresh')}
          </Button>
        </div>
      </div>

      {displayMonitors.error ? <div className="text-xs text-rose-600 mt-2">{displayMonitors.error}</div> : null}

      <div className="mt-4 space-y-3">
        {(displayMonitors.monitors ?? []).map((m) => {
          const cfg = perDisplayCfg[m.id]
          const diagonal = cfg?.diagonal_in ?? null
          const preset = diagonal != null ? SCREEN_DIAGONAL_PRESETS_IN.find((p) => Math.abs(p - diagonal) < 0.01) : null
          const presetValue = preset != null ? String(preset) : ''

          const effectivePpi = effectivePpiForDisplay(settings, m.id, { width: m.size[0], height: m.size[1] })
          const cmPer1000px = pixelsToCentimeters(1000, effectivePpi)
          const todayPx = todayByDisplay?.[m.id] ?? 0
          const todayCm = pixelsToCentimeters(todayPx, effectivePpi)
          const computedPpi = ppiFromDiagonalPx({ width: m.size[0], height: m.size[1] }, diagonal)

          return (
            <div key={m.id} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900">
                    {m.name ? m.name : m.id}
                    {m.is_primary ? <span className="ml-2 text-xs text-slate-500">{t('settings.mouseDistance.primary')}</span> : null}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 tabular-nums">
                    {t('settings.mouseDistance.monitorMeta', {
                      width: m.size[0],
                      height: m.size[1],
                      scale: Number.isFinite(m.scale_factor) ? m.scale_factor.toFixed(2) : String(m.scale_factor),
                      ppi: Math.round(effectivePpi),
                      cmPer1000px: formatCentimeters(cmPer1000px, { maximumFractionDigits: 2 }),
                      todayCm: formatCentimeters(todayCm),
                    })}
                  </div>
                  {computedPpi != null && diagonal != null ? (
                    <div className="text-xs text-slate-500 mt-1 tabular-nums">
                      {t('settings.mouseDistance.diagonalComputed', {
                        diagonal: diagonal.toFixed(1),
                        ppi: Math.round(computedPpi),
                      })}
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center gap-2" data-no-drag>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void updateMouseDistanceDisplay(m.id, { diagonal_in: null, ppi_override: null })}
                    data-no-drag
                  >
                    {t('common.clear')}
                  </Button>
                </div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="min-w-0">
                  <div className="text-xs text-slate-500 mb-2">{t('settings.mouseDistance.diagonalPreset')}</div>
                  <Select
                    value={presetValue}
                    onValueChange={(v) => {
                      const next = Number(v)
                      if (!Number.isFinite(next) || next <= 0) return
                      void updateMouseDistanceDisplay(m.id, { diagonal_in: next })
                    }}
                  >
                    <SelectTrigger className="w-full" data-no-drag>
                      <SelectValue placeholder={t('settings.mouseDistance.selectPreset')} />
                    </SelectTrigger>
                    <SelectContent>
                      {SCREEN_DIAGONAL_PRESETS_IN.map((v) => (
                        <SelectItem key={v} value={String(v)}>
                          {t('settings.mouseDistance.presetInches', { inches: v })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="min-w-0">
                  <div className="text-xs text-slate-500 mb-2">
                    {t('settings.mouseDistance.diagonalSlider', { inches: diagonal != null ? diagonal.toFixed(1) : '—' })}
                  </div>
                  <Slider
                    min={10}
                    max={60}
                    step={0.1}
                    value={[diagonal != null ? diagonal : 27]}
                    onValueChange={([v]) => void updateMouseDistanceDisplay(m.id, { diagonal_in: Math.round(v * 10) / 10 })}
                    className="w-full"
                    data-no-drag
                  />
                </div>
              </div>
            </div>
          )
        })}

        {(displayMonitors.monitors ?? []).length === 0 && !displayMonitors.isLoading ? (
          <div className="text-xs text-slate-500">{t('statistics.noData')}</div>
        ) : null}
      </div>
    </Card>
  )
}
