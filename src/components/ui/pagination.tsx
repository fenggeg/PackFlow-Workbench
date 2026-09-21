import {Button} from '@/components/ui/button'

export function Pagination({
  total,
  pageSize,
  currentPage,
  onPageChange,
}: {
  total: number
  pageSize: number
  currentPage: number
  onPageChange: (page: number) => void
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(currentPage, pageCount - 1)

  if (total <= pageSize) return null

  return (
    <div className="flex items-center justify-between border-t border-[var(--border)] px-3 py-2">
      <span className="text-[12px] text-[var(--muted-foreground)]">
        {total} 条 · 第 {safePage + 1}/{pageCount} 页
      </span>
      <div className="flex gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          disabled={safePage === 0}
          onClick={() => onPageChange(safePage - 1)}
        >
          上一页
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={safePage >= pageCount - 1}
          onClick={() => onPageChange(safePage + 1)}
        >
          下一页
        </Button>
      </div>
    </div>
  )
}