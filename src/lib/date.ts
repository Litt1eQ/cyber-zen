export type NaiveDateParts = { year: number; month: number; day: number }
export type YearMonth = { year: number; month: number } // month: 1-12

const ISO_NAIVE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export function parseNaiveDate(date: string): NaiveDateParts | null {
  const match = ISO_NAIVE_DATE.exec(date)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  if (month < 1 || month > 12) return null
  if (day < 1 || day > 31) return null
  return { year, month, day }
}

export function formatNaiveDateKey(parts: NaiveDateParts): string {
  const y = String(parts.year).padStart(4, '0')
  const m = String(parts.month).padStart(2, '0')
  const d = String(parts.day).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function yearMonthFromNaiveDateKey(date: string): YearMonth | null {
  const parts = parseNaiveDate(date)
  if (!parts) return null
  return { year: parts.year, month: parts.month }
}

export function naiveDateToLocalDate(parts: NaiveDateParts): Date {
  return new Date(parts.year, parts.month - 1, parts.day)
}

export function monthCompare(a: YearMonth, b: YearMonth): number {
  if (a.year !== b.year) return a.year - b.year
  return a.month - b.month
}

export function addMonths(cursor: YearMonth, delta: number): YearMonth {
  const date = new Date(cursor.year, cursor.month - 1, 1)
  date.setMonth(date.getMonth() + delta)
  return { year: date.getFullYear(), month: date.getMonth() + 1 }
}

export function daysInMonth(cursor: YearMonth): number {
  return new Date(cursor.year, cursor.month, 0).getDate()
}

export function startOfMonth(cursor: YearMonth): Date {
  return new Date(cursor.year, cursor.month - 1, 1)
}

export function isSameMonth(a: YearMonth, b: YearMonth): boolean {
  return a.year === b.year && a.month === b.month
}

export function formatMonthLabel(cursor: YearMonth): string {
  return `${cursor.month}月`
}

export function formatWeekdayZh(date: Date): string {
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'] as const
  return `周${weekdays[date.getDay()]}`
}

export function addDaysToNaiveDateKey(dateKey: string, deltaDays: number): string | null {
  const parts = parseNaiveDate(dateKey)
  if (!parts) return null
  const date = new Date(parts.year, parts.month - 1, parts.day, 12)
  date.setDate(date.getDate() + deltaDays)
  return formatNaiveDateKey({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() })
}

export function startOfWeekFromNaiveDateKey(dateKey: string, weekStart: 0 | 1 = 1): string | null {
  const parts = parseNaiveDate(dateKey)
  if (!parts) return null
  const date = new Date(parts.year, parts.month - 1, parts.day, 12)
  const delta = (date.getDay() - weekStart + 7) % 7
  date.setDate(date.getDate() - delta)
  return formatNaiveDateKey({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() })
}

export function startOfMonthFromNaiveDateKey(dateKey: string): string | null {
  const parts = parseNaiveDate(dateKey)
  if (!parts) return null
  return formatNaiveDateKey({ year: parts.year, month: parts.month, day: 1 })
}

export function weekdayIndexMon0FromNaiveDateKey(dateKey: string): number | null {
  const parts = parseNaiveDate(dateKey)
  if (!parts) return null
  const date = new Date(parts.year, parts.month - 1, parts.day, 12)
  return (date.getDay() + 6) % 7
}
