import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isMac } from '../../utils/platform'
import { Card } from '../ui/card'
import { KeyCombo, type KeyComboPart } from '../ui/key-combo'

const modifierOrder = ['Command', 'Control', 'Alt', 'Shift'] as const
type ModifierKey = (typeof modifierOrder)[number]

const modifierSymbols: Record<ModifierKey, string> = {
  Command: '⌘',
  Control: '⌃',
  Alt: '⌥',
  Shift: '⇧',
}

function normalizeEventKey(event: KeyboardEvent): string | null {
  const { key, code } = event
  const eventKey = key.replace('Meta', 'Command')

  if (eventKey === 'Shift' || eventKey === 'Control' || eventKey === 'Alt' || eventKey === 'Command') return eventKey

  if (/^F\d{1,2}$/.test(eventKey)) return eventKey

  if (eventKey === 'Escape') return 'Escape'
  if (eventKey === 'Enter') return 'Enter'
  if (eventKey === 'Tab') return 'Tab'
  if (eventKey === ' ') return 'Space'
  if (eventKey.startsWith('Arrow')) return eventKey

  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)

  return null
}

function sortKeys(keys: string[]) {
  const modifiers: ModifierKey[] = []
  const normals: string[] = []

  for (const key of keys) {
    if (key === 'Command' || key === 'Control' || key === 'Alt' || key === 'Shift') modifiers.push(key)
    else normals.push(key)
  }

  modifiers.sort((a, b) => modifierOrder.indexOf(a) - modifierOrder.indexOf(b))
  normals.sort()
  return [...modifiers, ...normals]
}

function isValidShortcut(keys: string[]) {
  if (keys.length === 0) return false
  if (keys.length === 1 && /^F\d{1,2}$/.test(keys[0]!)) return true
  const hasModifier = keys.some((k) => k === 'Command' || k === 'Control' || k === 'Alt' || k === 'Shift')
  const hasNormal = keys.some((k) => k !== 'Command' && k !== 'Control' && k !== 'Alt' && k !== 'Shift')
  return hasModifier && hasNormal
}

function formatKey(key: string) {
  const mac = isMac()

  if (mac && (key === 'Command' || key === 'Control' || key === 'Alt' || key === 'Shift')) {
    return modifierSymbols[key]
  }
  if (!mac) {
    if (key === 'Command') return 'Super'
    if (key === 'Control') return 'Ctrl'
  }
  if (key === 'Escape') return mac ? '⎋' : 'Esc'
  if (key === 'Enter') return mac ? '↩︎' : 'Enter'
  if (key === 'Tab') return mac ? '⇥' : 'Tab'
  if (key === 'Space') return mac ? '␣' : 'Space'
  if (key === 'ArrowUp') return '↑'
  if (key === 'ArrowDown') return '↓'
  if (key === 'ArrowLeft') return '←'
  if (key === 'ArrowRight') return '→'
  return key
}

function parseValue(value: string | null | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) return []
  return trimmed.split('+').filter(Boolean)
}

function toKeyComboParts(keys: string[], mac: boolean): KeyComboPart[] {
  if (keys.length === 0) return []
  if (mac) return keys.map((label) => ({ type: 'key', label }))

  const out: KeyComboPart[] = []
  for (const [index, label] of keys.entries()) {
    if (index > 0) out.push({ type: 'sep', label: '+' })
    out.push({ type: 'key', label })
  }
  return out
}

export function ShortcutRecorder({
  title,
  description,
  value,
  onChange,
}: {
  title: string
  description?: string
  value: string | null | undefined
  onChange: (next: string) => void
}) {
  const { t } = useTranslation()
  const elRef = useRef<HTMLDivElement | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [pressed, setPressed] = useState<string[]>([])

  const parsedValue = useMemo(() => parseValue(value), [value])

  useEffect(() => {
    if (isRecording) return
    setPressed(sortKeys(parsedValue))
  }, [isRecording, parsedValue])

  const hint = isRecording ? t('settings.shortcutRecorder.pressHint') : t('settings.shortcutRecorder.clickHint')
  const mac = isMac()

  return (
    <Card className="flex items-center justify-between gap-5 p-4">
      <div className="min-w-0">
        <div className="font-medium text-slate-900">{title}</div>
        {description && <div className="text-sm text-slate-500 mt-1">{description}</div>}
      </div>

      <div className="shrink-0 flex items-center gap-2">
        <div
          ref={elRef}
          tabIndex={0}
          role="button"
          data-no-drag
          onFocus={() => {
            setIsRecording(true)
            setPressed([])
          }}
          onBlur={() => {
            setIsRecording(false)
            const sorted = sortKeys(pressed)
            if (isValidShortcut(sorted)) onChange(sorted.join('+'))
            else setPressed(sortKeys(parsedValue))
          }}
          onKeyDown={(e) => {
            e.preventDefault()
            e.stopPropagation()

            if (e.key === 'Escape') {
              elRef.current?.blur()
              return
            }

            const nextKey = normalizeEventKey(e.nativeEvent)
            if (!nextKey) return

            setPressed((prev) => {
              if (prev.includes(nextKey)) return prev
              const next = [...prev, nextKey]
              const sorted = sortKeys(next)
              if (isValidShortcut(sorted)) window.setTimeout(() => elRef.current?.blur(), 0)
              return sorted
            })
          }}
          onKeyUp={(e) => {
            const eventKey = normalizeEventKey(e.nativeEvent)
            if (!eventKey) return
            setPressed((prev) => prev.filter((k) => k !== eventKey))
          }}
          className="window-no-drag relative h-10 min-w-52 px-3 rounded-lg border border-slate-200/60 bg-white text-slate-800 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 cursor-text flex items-center justify-center"
        >
          {pressed.length === 0 ? (
            <span className="text-sm text-slate-400">{hint}</span>
          ) : (
            <KeyCombo parts={toKeyComboParts(pressed.map(formatKey), mac)} size="sm" />
          )}

          <button
            type="button"
            className="window-no-drag absolute right-1.5 top-1/2 -translate-y-1/2 px-2 py-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
            onMouseDown={(e) => {
              e.preventDefault()
              onChange('')
              setPressed([])
            }}
            aria-label={t('settings.shortcutRecorder.clearAria')}
            title={t('settings.shortcutRecorder.clear')}
            data-no-drag
            style={{ display: pressed.length === 0 || isRecording ? 'none' : 'block' }}
          >
            ✕
          </button>
        </div>
      </div>
    </Card>
  )
}
