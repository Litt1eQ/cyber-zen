import { useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { GripVertical } from 'lucide-react'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { COMMANDS } from '@/types/events'
import type { AnimTriggerItem, Live2DExpressionInfo, Live2DMotionInfo, ModelSpeedConfig, SpeedTierConfig } from '@/types/live2d'
import { SPEED_TIER_META, type SpeedTier } from './live2dInputSpeed'

type ModelActions = {
  motions: Record<string, Live2DMotionInfo[]>
  expressions: Live2DExpressionInfo[]
}

function emptyTierConfig(): SpeedTierConfig {
  return { mode: 'sequential', items: [] }
}

function emptyModelConfig(): ModelSpeedConfig {
  return {
    slow: emptyTierConfig(),
    medium: emptyTierConfig(),
    fast: emptyTierConfig(),
    very_fast: emptyTierConfig(),
  }
}

function emptyModelActions(): ModelActions {
  return {
    motions: {},
    expressions: [],
  }
}

function parseModelActions(modelJson: Record<string, unknown>): ModelActions {
  const fileReferences = (modelJson.FileReferences ?? {}) as Record<string, unknown>
  const rawMotions = (fileReferences.Motions ?? {}) as Record<string, unknown[]>
  const rawExpressions = (fileReferences.Expressions ?? []) as Array<{ Name?: string }>

  const motions: Record<string, Live2DMotionInfo[]> = {}
  for (const [group, items] of Object.entries(rawMotions)) {
    motions[group] = (items ?? []).map((_, no) => ({
      group,
      no,
      name: `${group} · ${no}`,
    }))
  }

  const expressions = rawExpressions.map((expression, index) => ({
    name: expression.Name?.trim() || `live2d_expression${index}`,
  }))

  return { motions, expressions }
}

function isSameItem(a: AnimTriggerItem, b: AnimTriggerItem): boolean {
  if (a.type !== b.type) return false
  if (a.type === 'expression' && b.type === 'expression') {
    return a.index === b.index
  }
  if (a.type === 'motion' && b.type === 'motion') {
    return a.group === b.group && a.no === b.no
  }
  return false
}

function reorderItems(items: AnimTriggerItem[], fromIndex: number, toIndex: number): AnimTriggerItem[] {
  if (fromIndex === toIndex) return items
  const next = [...items]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

export function Live2DActionPanel({ uuid }: { uuid: string }) {
  const settings = useSettingsStore((state) => state.settings)
  const updateSettings = useSettingsStore((state) => state.updateSettings)
  const [openPickerTier, setOpenPickerTier] = useState<SpeedTier | null>(null)
  const dragIndexRef = useRef<number | null>(null)
  const [actions, setActions] = useState<ModelActions>(() => emptyModelActions())

  const speedConfigs = useMemo(() => settings?.live2d_speed_configs ?? {}, [settings])
  const modelConfig = useMemo(() => speedConfigs[uuid] ?? emptyModelConfig(), [speedConfigs, uuid])

  useEffect(() => {
    let cancelled = false
    setActions(emptyModelActions())

    void invoke<string>(COMMANDS.GET_LIVE2D_MODEL_JSON, { uuid })
      .then((modelJsonText) => {
        if (cancelled) return
        const parsed = JSON.parse(modelJsonText) as Record<string, unknown>
        setActions(parseModelActions(parsed))
      })
      .catch(() => {
        if (cancelled) return
        setActions(emptyModelActions())
      })

    return () => {
      cancelled = true
    }
  }, [uuid])

  const availableItems = useMemo(() => {
    const expressionItems: Extract<AnimTriggerItem, { type: 'expression' }>[] = actions.expressions.map((expression, index) => ({
      type: 'expression',
      index,
      name: expression.name?.trim() || `live2d_expression${index}`,
    }))
    const motionItems: Extract<AnimTriggerItem, { type: 'motion' }>[] = Object.entries(actions.motions)
      .flatMap(([group, groupMotions]) =>
        [...groupMotions]
          .sort((a, b) => a.no - b.no)
          .map((motion) => ({
            type: 'motion' as const,
            group,
            no: motion.no,
            name: `${group} · ${motion.no}`,
          })))
    return {
      expressions: expressionItems,
      motions: motionItems,
    }
  }, [actions.expressions, actions.motions])

  const updateTier = async (tier: SpeedTier, nextTierConfig: SpeedTierConfig) => {
    const nextConfig: ModelSpeedConfig = {
      ...modelConfig,
      [tier]: nextTierConfig,
    }
    await updateSettings({
      live2d_speed_configs: {
        ...speedConfigs,
        [uuid]: nextConfig,
      },
    })
  }

  return (
    <div className="space-y-3" data-no-drag>
      {SPEED_TIER_META.map(({ tier, label, color, rangeLabel }) => {
        const tierConfig = modelConfig[tier]
        const pickerOpen = openPickerTier === tier
        return (
          <div key={tier} className="overflow-visible rounded-2xl border border-slate-200 bg-white/95 shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-sm font-semibold text-slate-900">{label}</span>
              <span className="text-[11px] font-medium text-slate-400">{rangeLabel}</span>
              <div className="ml-auto inline-flex overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                <button
                  type="button"
                  data-no-drag
                  onClick={() => void updateTier(tier, { ...tierConfig, mode: 'sequential' })}
                  className={[
                    'px-3 py-1 text-xs transition-colors',
                    tierConfig.mode === 'sequential'
                      ? 'bg-slate-900 font-semibold text-white'
                      : 'text-slate-500 hover:bg-slate-100',
                  ].join(' ')}
                >
                  顺序
                </button>
                <button
                  type="button"
                  data-no-drag
                  onClick={() => void updateTier(tier, { ...tierConfig, mode: 'random' })}
                  className={[
                    'border-l border-slate-200 px-3 py-1 text-xs transition-colors',
                    tierConfig.mode === 'random'
                      ? 'bg-slate-900 font-semibold text-white'
                      : 'text-slate-500 hover:bg-slate-100',
                  ].join(' ')}
                >
                  随机
                </button>
              </div>
            </div>

            <div className="space-y-2 px-4 py-3">
              {tierConfig.items.length === 0 ? (
                <p className="text-xs italic text-slate-400">暂未配置，进入此档位时不触发动画</p>
              ) : (
                tierConfig.items.map((item, index) => (
                  <div
                    key={`${item.type}-${index}-${item.name}`}
                    data-testid="tier-item"
                    draggable={tierConfig.mode === 'sequential'}
                    onDragStart={() => {
                      if (tierConfig.mode !== 'sequential') return
                      dragIndexRef.current = index
                    }}
                    onDragOver={(event) => {
                      if (tierConfig.mode !== 'sequential') return
                      event.preventDefault()
                    }}
                    onDrop={(event) => {
                      if (tierConfig.mode !== 'sequential') return
                      event.preventDefault()
                      const fromIndex = dragIndexRef.current
                      dragIndexRef.current = null
                      if (fromIndex == null || fromIndex === index) return
                      void updateTier(tier, {
                        ...tierConfig,
                        items: reorderItems(tierConfig.items, fromIndex, index),
                      })
                    }}
                    onDragEnd={() => {
                      dragIndexRef.current = null
                    }}
                    className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
                  >
                    <span className="text-slate-300">
                      <GripVertical className="h-4 w-4" />
                    </span>
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-700">
                      {tierConfig.mode === 'sequential' ? index + 1 : '?'}
                    </span>
                    <span
                      className={[
                        'rounded-md border px-1.5 py-0.5 text-[10px] font-semibold',
                        item.type === 'expression'
                          ? 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700'
                          : 'border-sky-200 bg-sky-50 text-sky-700',
                      ].join(' ')}
                    >
                      {item.type === 'expression' ? '表情' : '动作'}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-700">{item.name}</span>
                    <button
                      type="button"
                      data-no-drag
                      onClick={() => void updateTier(tier, {
                        ...tierConfig,
                        items: tierConfig.items.filter((_, itemIndex) => itemIndex !== index),
                      })}
                      className="text-sm text-slate-300 transition-colors hover:text-rose-500"
                      aria-label={`移除 ${item.name}`}
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="relative px-4 pb-4">
              <button
                type="button"
                data-no-drag
                onClick={() => setOpenPickerTier((current) => current === tier ? null : tier)}
                className="w-full rounded-xl border border-dashed border-slate-300 px-3 py-2 text-left text-xs text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-700"
              >
                ＋ 添加动作/表情
              </button>

              {pickerOpen ? (
                <div className="absolute inset-x-4 top-full z-20 mt-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl" data-no-drag>
                  {availableItems.expressions.length > 0 ? (
                    <div className="mb-1">
                      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">表情</div>
                      {availableItems.expressions.map((item) => {
                        const selected = tierConfig.items.some((existing) => isSameItem(existing, item))
                        return (
                          <button
                            key={`expression-${item.index}`}
                            type="button"
                            onClick={() => void updateTier(tier, {
                              ...tierConfig,
                              items: [...tierConfig.items, item],
                            })}
                            className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs text-slate-700 transition-colors hover:bg-slate-50"
                          >
                            <span className="rounded-md border border-fuchsia-200 bg-fuchsia-50 px-1.5 py-0.5 text-[10px] font-semibold text-fuchsia-700">表情</span>
                            <span className="min-w-0 flex-1 truncate">{item.name}</span>
                            <span className={selected ? 'text-emerald-500' : 'text-transparent'}>✓</span>
                          </button>
                        )
                      })}
                    </div>
                  ) : null}

                  {availableItems.motions.length > 0 ? (
                    <div>
                      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">动作</div>
                      {availableItems.motions.map((item) => {
                        const selected = tierConfig.items.some((existing) => isSameItem(existing, item))
                        return (
                          <button
                            key={`motion-${item.group}-${item.no}`}
                            type="button"
                            onClick={() => void updateTier(tier, {
                              ...tierConfig,
                              items: [...tierConfig.items, item],
                            })}
                            className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs text-slate-700 transition-colors hover:bg-slate-50"
                          >
                            <span className="rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">动作</span>
                            <span className="min-w-0 flex-1 truncate">{item.name}</span>
                            <span className={selected ? 'text-emerald-500' : 'text-transparent'}>✓</span>
                          </button>
                        )
                      })}
                    </div>
                  ) : null}

                  {availableItems.expressions.length === 0 && availableItems.motions.length === 0 ? (
                    <p className="px-2 py-2 text-xs text-slate-400">此模型无可用动作或表情</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
