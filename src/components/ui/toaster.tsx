import {AlertTriangle, CheckCircle2, Info, X, XCircle} from 'lucide-react'
import {cn} from '@/lib/utils'
import {useFeedbackStore, type FeedbackTone} from '@/store/useFeedbackStore'

const toneIcon: Record<FeedbackTone, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
}

const toneIconClass: Record<FeedbackTone, string> = {
  info: 'text-[var(--info)]',
  success: 'text-[var(--success)]',
  warning: 'text-[var(--warning)]',
  error: 'text-[var(--error)]',
}

const toneBorderClass: Record<FeedbackTone, string> = {
  info: 'border-[var(--info)]/40',
  success: 'border-[var(--success)]/40',
  warning: 'border-[var(--warning)]/40',
  error: 'border-[var(--error)]/40',
}

export function Toaster() {
  const items = useFeedbackStore((state) => state.items)
  const dismiss = useFeedbackStore((state) => state.dismiss)

  if (items.length === 0) return null

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(360px,calc(100vw-32px))] flex-col gap-2"
      role="region"
      aria-label="通知"
    >
      {items.map((item) => {
        const Icon = toneIcon[item.tone]
        return (
          <div
            key={item.id}
            role={item.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex items-start gap-2.5 rounded-[var(--radius-md)] border bg-[var(--popover)] px-3 py-2.5 shadow-[0_8px_24px_rgba(15,23,42,0.12)]',
              toneBorderClass[item.tone],
            )}
          >
            <Icon className={cn('mt-px size-4 shrink-0', toneIconClass[item.tone])} />
            <div className="min-w-0 flex-1">
              <div className="break-words text-[13px] font-medium text-[var(--foreground)]">
                {item.title}
              </div>
              {item.description ? (
                <div className="mt-0.5 break-words text-[12px] leading-5 text-[var(--muted-foreground)]">
                  {item.description}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="关闭通知"
              className="shrink-0 rounded-[var(--radius)] p-0.5 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
              onClick={() => dismiss(item.id)}
            >
              <X className="size-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
