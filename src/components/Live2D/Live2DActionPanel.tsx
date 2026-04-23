import { useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { emit } from '@tauri-apps/api/event'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { COMMANDS, EVENTS } from '@/types/events'
import type { Live2DActionEvent, Live2DExpressionInfo, Live2DMotionInfo } from '@/types/live2d'
import {
  buildExpressionActionKey,
  buildMotionActionKey,
  clearShortcut,
  formatShortcutFromDOM,
  getShortcutForAction,
  isModifierCode,
  readActionShortcuts,
  setShortcut,
  type Live2DActionShortcutMap,
} from '@/utils/live2dShortcuts'

type SectionOpen = {
  motions: boolean
  expressions: boolean
  parameters: boolean
}

type ModelActions = {
  motions: Record<string, Live2DMotionInfo[]>
  expressions: Live2DExpressionInfo[]
}

type ShortcutInputProps = {
  value?: string
  disabled?: boolean
  onRecord: (shortcut: string) => void
  onClear: () => void
}

const OVERRIDABLE_PARAMS = [
  { id: 'ParamEyeBallX', label: 'EyeBallX', min: -1, max: 1, step: 0.01 },
  { id: 'ParamEyeBallY', label: 'EyeBallY', min: -1, max: 1, step: 0.01 },
  { id: 'ParamAngleX', label: 'AngleX', min: -30, max: 30, step: 0.5 },
  { id: 'ParamAngleY', label: 'AngleY', min: -30, max: 30, step: 0.5 },
  { id: 'ParamAngleZ', label: 'AngleZ', min: -30, max: 30, step: 0.5 },
] as const

type ParamId = (typeof OVERRIDABLE_PARAMS)[number]['id']

function parseModelActions(modelJson: Record<string, unknown>): ModelActions {
  const fileReferences = (modelJson.FileReferences ?? {}) as Record<string, unknown>
  const rawMotions = (fileReferences.Motions ?? {}) as Record<string, unknown[]>
  const rawExpressions = (fileReferences.Expressions ?? []) as Array<{ Name?: string }>

  const motions: Record<string, Live2DMotionInfo[]> = {}
  for (const [group, items] of Object.entries(rawMotions)) {
    motions[group] = items.map((_, no) => ({
      group,
      no,
      name: `${group}_${no}`,
    }))
  }

  const expressions = rawExpressions.map((expression, index) => ({
    name: expression.Name?.trim() || `表情 ${index}`,
  }))

  return { motions, expressions }
}

async function sendAction(action: Live2DActionEvent): Promise<void> {
  await emit(EVENTS.LIVE2D_ACTION_EVENT, action)
}

function SectionHeader({
  label,
  open,
  onToggle,
}: {
  label: string
  open: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-1 text-left text-xs font-semibold text-slate-700"
      data-no-drag
    >
      {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      <span>{label}</span>
    </button>
  )
}

function ShortcutInput({ value, disabled = false, onRecord, onClear }: ShortcutInputProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [recording, setRecording] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)

  const displayValue = recording ? (preview ?? '按键…') : (value ?? '--')

  return (
    <div className="flex items-center gap-1" data-no-drag>
      <div
        ref={containerRef}
        tabIndex={disabled ? -1 : 0}
        role="button"
        aria-label={displayValue}
        aria-disabled={disabled}
        onMouseDown={(event) => {
          if (disabled) return
          event.preventDefault()
          containerRef.current?.focus()
        }}
        onFocus={() => {
          if (disabled) return
          setRecording(true)
          setPreview(null)
        }}
        onBlur={() => {
          setRecording(false)
          setPreview(null)
        }}
        onKeyDown={(event) => {
          if (!recording || disabled) return
          event.preventDefault()
          event.stopPropagation()
          if (event.key === 'Escape') {
            containerRef.current?.blur()
            return
          }

          setPreview(formatShortcutFromDOM(event.nativeEvent))
          if (isModifierCode(event.nativeEvent.code)) return

          onRecord(formatShortcutFromDOM(event.nativeEvent))
          window.setTimeout(() => containerRef.current?.blur(), 0)
        }}
        className={[
          'min-w-[72px] rounded-md border px-2 py-1 text-center text-xs font-mono outline-none transition-colors',
          recording
            ? 'border-blue-400 bg-blue-50 text-blue-700 ring-2 ring-blue-400/30'
            : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700 focus:border-blue-400 focus:text-blue-700 focus:ring-2 focus:ring-blue-400/30',
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-text',
        ].join(' ')}
      >
        {displayValue}
      </div>
      {value ? (
        <button
          type="button"
          aria-label="清除快捷键"
          disabled={disabled}
          onMouseDown={(event) => {
            event.preventDefault()
          }}
          onClick={() => {
            setRecording(false)
            setPreview(null)
            onClear()
          }}
          className="rounded-md px-1 py-1 text-xs text-slate-400 transition-colors hover:text-red-500"
        >
          ✕
        </button>
      ) : null}
    </div>
  )
}

function ParametersSection({ disabled }: { disabled: boolean }) {
  const [overrides, setOverrides] = useState<Partial<Record<ParamId, number | null>>>({})

  const setOverride = (id: ParamId, value: number | null) => {
    setOverrides((current) => ({
      ...current,
      [id]: value,
    }))
    void sendAction({ kind: 'set_param_override', id, value })
  }

  return (
    <div className="space-y-2">
      {OVERRIDABLE_PARAMS.map((param) => {
        const currentValue = overrides[param.id] ?? null
        return (
          <div key={param.id} className="grid grid-cols-[88px_minmax(0,1fr)_48px_36px] items-center gap-2" data-no-drag>
            <span className="text-xs text-slate-600">{param.label}</span>
            <input
              type="range"
              min={param.min}
              max={param.max}
              step={param.step}
              disabled={disabled}
              value={currentValue ?? 0}
              onChange={(event) => setOverride(param.id, Number.parseFloat(event.target.value))}
              className="w-full accent-blue-600 disabled:opacity-50"
            />
            <span className="text-right text-xs font-mono text-slate-500">
              {currentValue == null ? '--' : currentValue.toFixed(2)}
            </span>
            <button
              type="button"
              disabled={disabled || currentValue == null}
              onClick={() => setOverride(param.id, null)}
              className="rounded-md px-1 py-1 text-xs text-slate-500 transition-colors hover:text-slate-700 disabled:opacity-30"
            >
              ↺
            </button>
          </div>
        )
      })}
      <div className="flex justify-end" data-no-drag>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setOverrides({})
            for (const param of OVERRIDABLE_PARAMS) {
              void sendAction({ kind: 'set_param_override', id: param.id, value: null })
            }
          }}
          className="rounded-md px-2 py-1 text-xs text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          全部重置
        </button>
      </div>
    </div>
  )
}

export function Live2DActionPanel({ uuid }: { uuid: string }) {
  const settings = useSettingsStore((state) => state.settings)
  const updateSettings = useSettingsStore((state) => state.updateSettings)
  const shortcuts = useMemo(() => readActionShortcuts(settings), [settings])
  const [sections, setSections] = useState<SectionOpen>({
    motions: true,
    expressions: true,
    parameters: true,
  })
  const [actions, setActions] = useState<ModelActions>({
    motions: {},
    expressions: [],
  })
  const [activeExpression, setActiveExpression] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setActiveExpression(null)
    invoke<string>(COMMANDS.GET_LIVE2D_MODEL_JSON, { uuid })
      .then((modelJsonText) => {
        if (cancelled) return
        const parsed = JSON.parse(modelJsonText) as Record<string, unknown>
        setActions(parseModelActions(parsed))
      })
      .catch(() => {
        if (cancelled) return
        setActions({ motions: {}, expressions: [] })
      })

    return () => {
      cancelled = true
    }
  }, [uuid])

  useEffect(() => {
    if (!feedback) return
    const timer = window.setTimeout(() => setFeedback(null), 1800)
    return () => window.clearTimeout(timer)
  }, [feedback])

  const updateShortcutMap = async (nextShortcuts: Live2DActionShortcutMap) => {
    await updateSettings({
      live2d_action_shortcuts: nextShortcuts,
    })
  }

  const motionGroups = Object.entries(actions.motions)

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm" data-no-drag>
      {feedback ? <div className="mb-3 rounded-lg bg-blue-50 px-2 py-1 text-xs text-blue-700">{feedback}</div> : null}

      <div className="space-y-4">
        <div>
          <SectionHeader
            label="动作 (Motions)"
            open={sections.motions}
            onToggle={() => setSections((current) => ({ ...current, motions: !current.motions }))}
          />
          {sections.motions ? (
            <div className="mt-3 space-y-3">
              {motionGroups.length === 0 ? (
                <p className="text-xs text-slate-500">此模型无可用动作</p>
              ) : motionGroups.map(([group, motions]) => (
                <div key={group} className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{group}</div>
                  {motions.map((motion) => {
                    const actionKey = buildMotionActionKey(uuid, group, motion.no)
                    return (
                      <div key={actionKey} className="grid grid-cols-[minmax(0,1fr)_72px_112px] items-center gap-2">
                        <span className="truncate text-xs text-slate-700">{motion.name}</span>
                        <button
                          type="button"
                          onClick={() => void sendAction({ kind: 'trigger_motion', group, no: motion.no })}
                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
                        >
                          ▶ 播放
                        </button>
                        <ShortcutInput
                          value={getShortcutForAction(shortcuts, actionKey)}
                          onRecord={(shortcut) => {
                            const next = setShortcut(shortcuts, actionKey, shortcut)
                            void updateShortcutMap(next.shortcuts)
                            if (next.replacedActionKey) {
                              setFeedback(`已替换冲突快捷键 ${shortcut}`)
                            }
                          }}
                          onClear={() => {
                            void updateShortcutMap(clearShortcut(shortcuts, actionKey))
                          }}
                        />
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {actions.expressions.length > 0 ? (
          <div>
            <SectionHeader
              label="表情 (Expressions)"
              open={sections.expressions}
              onToggle={() => setSections((current) => ({ ...current, expressions: !current.expressions }))}
            />
            {sections.expressions ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {actions.expressions.map((expression, index) => {
                  const actionKey = buildExpressionActionKey(uuid, index)
                  return (
                    <div key={actionKey} className="flex flex-col items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveExpression(index)
                          void sendAction({ kind: 'set_expression', index })
                        }}
                        className={[
                          'rounded-md border px-3 py-1 text-xs transition-colors disabled:opacity-50',
                          activeExpression === index
                            ? 'border-blue-300 bg-blue-50 text-blue-700'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100',
                        ].join(' ')}
                      >
                        {expression.name}
                      </button>
                      <ShortcutInput
                        value={getShortcutForAction(shortcuts, actionKey)}
                        onRecord={(shortcut) => {
                          const next = setShortcut(shortcuts, actionKey, shortcut)
                          void updateShortcutMap(next.shortcuts)
                          if (next.replacedActionKey) {
                            setFeedback(`已替换冲突快捷键 ${shortcut}`)
                          }
                        }}
                        onClear={() => {
                          void updateShortcutMap(clearShortcut(shortcuts, actionKey))
                        }}
                      />
                    </div>
                  )
                })}
                <button
                  type="button"
                  onClick={() => {
                    setActiveExpression(null)
                    void sendAction({ kind: 'set_expression', index: null })
                  }}
                  className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
                >
                  重置
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div>
          <SectionHeader
            label="参数 (Parameters)"
            open={sections.parameters}
            onToggle={() => setSections((current) => ({ ...current, parameters: !current.parameters }))}
          />
          {sections.parameters ? (
            <div className="mt-3">
              <ParametersSection disabled={false} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
