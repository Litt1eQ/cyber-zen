import type { ReactNode } from 'react'

import { Card } from '../ui/card'

export function SettingCard({ children }: { children: ReactNode }) {
  return <Card className="p-4">{children}</Card>
}

export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="space-y-5">
      <div>
        <div className="text-sm font-semibold text-slate-900 uppercase tracking-wide">{title}</div>
        {description && <div className="text-sm text-slate-500 mt-1.5">{description}</div>}
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  )
}

export function SettingRow({
  title,
  description,
  extra,
  extraVariant = 'error',
  control,
}: {
  title: string
  description?: ReactNode
  extra?: string
  extraVariant?: 'error' | 'info'
  control: ReactNode
}) {
  return (
    <div className="rounded-lg border border-slate-200/60 bg-white shadow-sm p-4 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="font-medium text-slate-900">{title}</div>
        {description && <div className="text-sm text-slate-500 mt-1">{description}</div>}
        {extra && (
          <div className={`text-xs mt-1 ${extraVariant === 'info' ? 'text-slate-600' : 'text-red-600'}`}>
            {extra}
          </div>
        )}
      </div>
      <div className="shrink-0" data-no-drag>
        {control}
      </div>
    </div>
  )
}
