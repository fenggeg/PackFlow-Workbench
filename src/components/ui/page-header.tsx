import type {HTMLAttributes, ReactNode} from 'react'
import {cn} from '@/lib/utils'

export function PageHeader({
  title,
  description,
  actions,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div
      data-slot="page-header"
      className={cn('mb-5 flex items-start justify-between gap-4', className)}
      {...props}
    >
      <div className="min-w-0 flex-1">
        <h1 className="m-0 text-[20px] font-semibold leading-7 tracking-[-0.01em] text-[var(--foreground)]">
          {title}
        </h1>
        {description ? (
          <p className="mt-0.5 text-[13px] text-[var(--muted-foreground)]">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  )
}
