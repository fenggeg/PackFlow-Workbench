import {forwardRef, useMemo, useRef, useState} from 'react'
import type {MutableRefObject, UIEvent} from 'react'
import {Copy, X} from 'lucide-react'
import {cn} from '@/lib/utils'
import {describeError, notifyError, notifySuccess} from '@/store/useFeedbackStore'
import {sanitizeLogLine} from '@/utils/logText'

export type LogLineTone = '' | 'success' | 'error' | 'warn' | 'warning'

interface LogConsoleProps {
  lines: readonly string[]
  classifyLine?: (line: string) => LogLineTone
  className?: string
  emptyTitle: string
  emptyDescription?: string
  renderLimit?: number
  keyPrefix?: string
  /** 自动换行；关闭后保留原始列对齐，由容器横向滚动 */
  wrap?: boolean
  /** 用户滚动时回调，用于自动关闭「自动滚动」 */
  onUserScroll?: (atBottom: boolean) => void
}

const toneClassName = (tone: LogLineTone) => (tone === 'warning' ? 'warn' : tone)

const toneTextClass: Record<string, string> = {
  success: 'text-[#4ade80]',
  error: 'text-[#f87171]',
  warn: 'text-[#fbbf24]',
}

export const LogConsole = forwardRef<HTMLDivElement, LogConsoleProps>(function LogConsole({
  lines,
  classifyLine,
  className,
  emptyTitle,
  emptyDescription,
  renderLimit = 300,
  keyPrefix = 'log',
  wrap = true,
  onUserScroll,
}, ref) {
  const innerRef = useRef<HTMLDivElement | null>(null)
  const [hasSelection, setHasSelection] = useState(false)

  const setRefs = (node: HTMLDivElement | null) => {
    innerRef.current = node
    if (typeof ref === 'function') {
      ref(node)
    } else if (ref) {
      (ref as MutableRefObject<HTMLDivElement | null>).current = node
    }
  }

  const {hiddenCount, renderedLines, offset} = useMemo(() => {
    const nextLines = lines.slice(-renderLimit)
    // 清洗 + 分类各算一次，避免每行重复解析
    const classified = nextLines.map((raw) => {
      const line = sanitizeLogLine(raw)
      return {line, tone: toneClassName(classifyLine?.(line) ?? '')}
    })
    return {
      hiddenCount: Math.max(0, lines.length - nextLines.length),
      renderedLines: classified,
      offset: Math.max(0, lines.length - nextLines.length),
    }
  }, [classifyLine, lines, renderLimit])

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!onUserScroll) return
    const target = event.currentTarget
    const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight
    onUserScroll(distanceToBottom <= 24)
  }

  /** 仅在选中内容位于本日志区内时才展示「复制选中」 */
  const refreshSelection = () => {
    const selection = window.getSelection()
    if (!selection) {
      setHasSelection(false)
      return
    }
    const text = selection.toString() ?? ''
    const anchor = selection.anchorNode
    const inside = Boolean(anchor && innerRef.current?.contains(anchor))
    setHasSelection(inside && text.trim().length > 0)
  }

  const copySelection = async () => {
    const selected = window.getSelection()?.toString() ?? ''
    if (!selected.trim()) return
    try {
      await navigator.clipboard?.writeText(selected)
      notifySuccess(`已复制 ${selected.trim().split('\n').length} 行选中日志`)
      window.getSelection()?.removeAllRanges()
      setHasSelection(false)
    } catch (error) {
      notifyError('复制失败', describeError(error))
    }
  }

  return (
    <div
      ref={setRefs}
      onScroll={handleScroll}
      onMouseUp={refreshSelection}
      onKeyUp={refreshSelection}
      data-allow-context-menu
      data-scroll-surface="console"
      className={cn(
        'relative h-full min-h-0 select-text overflow-y-auto overscroll-contain rounded-[var(--radius-md)] border border-[var(--console-border)] bg-[var(--console-bg)] p-2 font-[family-name:var(--font-mono)]',
        !wrap && 'overflow-x-auto',
        className,
      )}
    >
      {lines.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
          <span className="text-[13px] text-[var(--console-text)]">{emptyTitle}</span>
          {emptyDescription ? (
            <span className="text-[12px] text-[var(--console-muted)]">{emptyDescription}</span>
          ) : null}
        </div>
      ) : (
        <>
          {hasSelection ? (
            <div className="sticky top-0 z-10 flex justify-end">
              <div className="flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--console-border)] bg-[var(--card)] px-1 py-0.5">
                <button
                  type="button"
                  className="flex items-center gap-1 rounded-[var(--radius)] px-1.5 py-0.5 text-[12px] text-[var(--foreground)] transition-colors hover:bg-[var(--accent)]"
                  onClick={() => void copySelection()}
                >
                  <Copy className="size-3" />
                  复制选中
                </button>
                <button
                  type="button"
                  aria-label="清除选择"
                  className="rounded-[var(--radius)] p-0.5 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)]"
                  onClick={() => {
                    window.getSelection()?.removeAllRanges()
                    setHasSelection(false)
                  }}
                >
                  <X className="size-3" />
                </button>
              </div>
            </div>
          ) : null}
          {hiddenCount > 0 ? (
            <div className="mb-1 rounded-[var(--radius)] bg-[var(--console-border)] px-2 py-1 text-[11px] text-[var(--console-muted)]">
              仅渲染最近 {renderLimit} 行（已折叠较早的 {hiddenCount} 行），复制/下载仍包含完整日志。
            </div>
          ) : null}
          {renderedLines.map((item, index) => (
            <pre
              key={`${keyPrefix}-${offset + index}`}
              className={cn(
                // log-line 提供悬挂缩进 + 显式允许鼠标选中
                'log-line m-0 cursor-text py-px text-[12px] leading-5 text-[var(--console-text)]',
                wrap ? 'whitespace-pre-wrap [overflow-wrap:anywhere]' : 'whitespace-pre',
                toneTextClass[item.tone],
              )}
            >
              {item.line}
            </pre>
          ))}
        </>
      )}
    </div>
  )
})
