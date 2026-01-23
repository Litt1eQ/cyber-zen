import type { JsonValue } from '@/types/customStatisticsTemplates'
import type { CustomStatisticsTemplate, CustomStatisticsTemplateUpsert } from '@/types/customStatisticsTemplates'

export const CUSTOM_WIDGET_EXPORT_SCHEMA_V1 = 'cyber-zen.custom-widgets.v1' as const

export type CustomWidgetExportTemplateV1 = {
  id?: string
  name: string
  html: string
  css: string
  js: string
  params: JsonValue
  height_px?: number | null
  created_at_ms?: number
  updated_at_ms?: number
  version?: number
}

export type CustomWidgetExportFileV1 = {
  schema: typeof CUSTOM_WIDGET_EXPORT_SCHEMA_V1
  exported_at_ms: number
  templates: CustomWidgetExportTemplateV1[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function coerceString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function coerceNullableInt(value: unknown): number | null {
  if (value == null) return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  const i = Math.floor(n)
  if (i <= 0) return null
  return i
}

function safeTemplateFromUnknown(raw: unknown): CustomWidgetExportTemplateV1 | null {
  if (!isRecord(raw)) return null
  const name = coerceString(raw.name).trim()
  if (!name) return null
  const html = coerceString(raw.html)
  const css = coerceString(raw.css)
  const js = coerceString(raw.js)
  const params = (raw.params ?? {}) as JsonValue
  const height_px = coerceNullableInt(raw.height_px)
  const id = coerceString(raw.id).trim() || undefined
  const created_at_ms = Number.isFinite(Number(raw.created_at_ms)) ? Number(raw.created_at_ms) : undefined
  const updated_at_ms = Number.isFinite(Number(raw.updated_at_ms)) ? Number(raw.updated_at_ms) : undefined
  const version = Number.isFinite(Number(raw.version)) ? Number(raw.version) : undefined
  return { id, name, html, css, js, params, height_px, created_at_ms, updated_at_ms, version }
}

export function buildCustomWidgetsExportFileV1(templates: CustomStatisticsTemplate[]): CustomWidgetExportFileV1 {
  return {
    schema: CUSTOM_WIDGET_EXPORT_SCHEMA_V1,
    exported_at_ms: Date.now(),
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      html: t.html,
      css: t.css,
      js: t.js,
      params: t.params ?? {},
      height_px: t.height_px ?? null,
      created_at_ms: t.created_at_ms,
      updated_at_ms: t.updated_at_ms,
      version: t.version,
    })),
  }
}

export function defaultCustomWidgetsExportFilename(count: number): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
  const suffix = count === 1 ? 'widget' : `${count}-widgets`
  return `CyberZen-${suffix}-${stamp}.json`
}

export function parseCustomWidgetsImportJson(text: string): { templates: CustomWidgetExportTemplateV1[]; warnings: string[] } {
  const rawText = String(text ?? '').trim()
  if (!rawText) throw new Error('empty')
  const parsed = JSON.parse(rawText) as unknown

  let list: unknown[] = []
  const warnings: string[] = []

  if (Array.isArray(parsed)) {
    list = parsed
    warnings.push('import_array_legacy')
  } else if (isRecord(parsed) && Array.isArray((parsed as any).templates)) {
    list = (parsed as any).templates
    const schema = coerceString((parsed as any).schema)
    if (schema && schema !== CUSTOM_WIDGET_EXPORT_SCHEMA_V1) warnings.push('schema_mismatch')
  } else if (isRecord(parsed) && typeof (parsed as any).html === 'string') {
    list = [parsed]
    warnings.push('import_single_legacy')
  } else {
    throw new Error('format_invalid')
  }

  const templates: CustomWidgetExportTemplateV1[] = []
  for (const item of list) {
    const t = safeTemplateFromUnknown(item)
    if (!t) continue
    templates.push(t)
  }

  if (templates.length === 0) throw new Error('no_templates')
  return { templates, warnings }
}

export function dedupeImportNames(imported: CustomWidgetExportTemplateV1[], existingNames: Set<string>): CustomWidgetExportTemplateV1[] {
  const used = new Set<string>(Array.from(existingNames))
  const out: CustomWidgetExportTemplateV1[] = []
  for (const t of imported) {
    const base = t.name.trim() || 'Imported Widget'
    let name = base
    if (used.has(name)) {
      let i = 2
      while (used.has(`${base} (${i})`)) i++
      name = `${base} (${i})`
    }
    used.add(name)
    out.push({ ...t, name })
  }
  return out
}

export function toUpsertTemplate(
  t: CustomWidgetExportTemplateV1,
  opts: { preserveId: boolean },
): CustomStatisticsTemplateUpsert {
  return {
    id: opts.preserveId ? (t.id ?? null) : null,
    name: t.name,
    html: t.html,
    css: t.css,
    js: t.js,
    params: t.params ?? {},
    height_px: t.height_px ?? null,
  }
}

