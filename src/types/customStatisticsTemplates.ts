export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

export interface CustomStatisticsTemplate {
  id: string
  name: string
  html: string
  css: string
  js: string
  params: JsonValue
  height_px?: number | null
  created_at_ms: number
  updated_at_ms: number
  version: number
}

export interface CustomStatisticsTemplateUpsert {
  id?: string | null
  name: string
  html: string
  css: string
  js: string
  params: JsonValue
  height_px?: number | null
}
