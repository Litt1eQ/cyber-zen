import { cn } from '@/lib/utils'

export type KeyComboPart = { type: 'key' | 'sep'; label: string }

export function KeyCombo({
  parts,
  size = 'md',
  wrap = false,
  className,
}: {
  parts: KeyComboPart[]
  size?: 'sm' | 'md'
  wrap?: boolean
  className?: string
}) {
  const keyClassName =
    size === 'sm'
      ? 'h-6 rounded-md px-2 text-[12px]'
      : 'h-7 rounded-md px-2.5 text-[13px]'

  const hasSeparator = parts.some((part) => part.type === 'sep')

  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center leading-none',
        hasSeparator ? 'gap-1' : 'gap-2',
        wrap ? 'flex-wrap' : 'whitespace-nowrap',
        className
      )}
    >
      {parts.map((part, index) => {
        if (part.type === 'sep') {
          return (
            <span
              key={`${part.label}-${index}`}
              className="mx-0.5 text-slate-400 font-semibold select-none"
            >
              {part.label}
            </span>
          )
        }
        return (
          <kbd
            key={`${part.label}-${index}`}
            className={cn(
              'inline-flex min-w-6 items-center justify-center border border-slate-200/70 bg-slate-50 font-semibold text-slate-900 shadow-[inset_0_-1px_0_rgba(0,0,0,0.06)]',
              keyClassName
            )}
          >
            {part.label}
          </kbd>
        )
      })}
    </span>
  )
}
