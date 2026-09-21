import {cn} from '@/lib/utils'

type StatusTone = 'neutral' | 'success' | 'warning' | 'error' | 'info' | 'processing'

const toneDot: Record<StatusTone, string> = {
  neutral: 'bg-[var(--placeholder)]',
  success: 'bg-[var(--success)]',
  warning: 'bg-[var(--warning)]',
  error: 'bg-[var(--error)]',
  info: 'bg-[var(--info)]',
  processing: 'bg-[var(--info)] animate-pulse',
}

const toneText: Record<StatusTone, string> = {
  neutral: 'text-[var(--muted-foreground)]',
  success: 'text-[var(--success)]',
  warning: 'text-[var(--warning)]',
  error: 'text-[var(--error)]',
  info: 'text-[var(--info)]',
  processing: 'text-[var(--info)]',
}

export function StatusPill({
  tone = 'neutral',
  children,
  className,
  title,
}: {
  tone?: StatusTone
  children: React.ReactNode
  className?: string
  title?: string
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex h-[22px] items-center gap-1.5 rounded-full border border-[var(--border)] bg-transparent px-2 text-[12px] font-medium leading-[18px] whitespace-nowrap',
        toneText[tone],
        className,
      )}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', toneDot[tone])} aria-hidden />
      {children}
    </span>
  )
}
