import {ListOrdered, Plus, Trash2, X} from 'lucide-react'
import {useState} from 'react'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Checkbox} from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {StatusPill} from '@/components/ui/status-pill'
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip'
import {useAppStore} from '@/store/useAppStore'
import {type QueueItemStatus, useBuildQueueStore} from '@/store/useBuildQueueStore'
import {formatDuration} from '@/utils/buildStats'

const statusText: Record<QueueItemStatus, string> = {
  waiting: '等待中',
  running: '构建中',
  success: '成功',
  failed: '失败',
  cancelled: '已停止',
}

const statusTone: Record<
  QueueItemStatus,
  'neutral' | 'processing' | 'success' | 'error' | 'warning'
> = {
  waiting: 'neutral',
  running: 'processing',
  success: 'success',
  failed: 'error',
  cancelled: 'warning',
}

/**
 * 构建队列：把多个模块 / 多个项目的构建一次排好，依次自动执行。
 * 解决「手动反复点开始构建、还要盯着上一个跑完」的问题。
 */
export function BuildQueuePanel() {
  const items = useBuildQueueStore((state) => state.items)
  const enqueueCurrent = useBuildQueueStore((state) => state.enqueueCurrent)
  const enqueueProjects = useBuildQueueStore((state) => state.enqueueProjects)
  const removeItem = useBuildQueueStore((state) => state.removeItem)
  const clearFinished = useBuildQueueStore((state) => state.clearFinished)
  const savedProjectPaths = useAppStore((state) => state.savedProjectPaths)
  const project = useAppStore((state) => state.project)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [picked, setPicked] = useState<string[]>([])

  const waitingCount = items.filter((item) => item.status === 'waiting').length
  const finishedCount = items.length - waitingCount - items.filter((item) => item.status === 'running').length

  const togglePicked = (path: string, checked: boolean) => {
    setPicked((current) =>
      checked ? [...current, path] : current.filter((item) => item !== path),
    )
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <div className="flex min-w-0 items-center gap-2">
          <CardTitle>构建队列</CardTitle>
          {items.length > 0 ? (
            <StatusPill tone={waitingCount > 0 ? 'processing' : 'neutral'}>
              等待 {waitingCount} / 共 {items.length}
            </StatusPill>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            className="h-7 gap-1.5"
            disabled={!project}
            onClick={enqueueCurrent}
          >
            <Plus className="size-3.5" />
            加入当前配置
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="iconSm"
                aria-label="批量加入项目"
                disabled={savedProjectPaths.length === 0}
                onClick={() => {
                  setPicked([])
                  setPickerOpen(true)
                }}
              >
                <ListOrdered />
              </Button>
            </TooltipTrigger>
            <TooltipContent>选择多个项目依次构建</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="iconSm"
                aria-label="清除已完成"
                disabled={finishedCount === 0}
                onClick={clearFinished}
              >
                <Trash2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>清除已完成的任务</TooltipContent>
          </Tooltip>
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <span className="text-[13px] text-[var(--muted-foreground)]">
            把当前配置加入队列，或选择多个项目依次构建；队列会在当前构建结束后自动继续。
          </span>
        ) : (
          <ul className="m-0 flex list-none flex-col divide-y divide-[var(--border)] p-0">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium" title={item.projectRoot}>
                    {item.label}
                  </div>
                  <div className="truncate text-[11px] text-[var(--muted-foreground)]" title={item.projectRoot}>
                    {item.projectRoot}
                  </div>
                </div>
                {item.durationMs ? (
                  <span className="shrink-0 text-[11px] text-[var(--muted-foreground)]">
                    {formatDuration(item.durationMs)}
                  </span>
                ) : null}
                <StatusPill tone={statusTone[item.status]}>{statusText[item.status]}</StatusPill>
                <Button
                  variant="ghost"
                  size="iconSm"
                  aria-label="移出队列"
                  disabled={item.status === 'running'}
                  onClick={() => removeItem(item.id)}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>选择要依次构建的项目</DialogTitle>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto px-5 py-2">
            {savedProjectPaths.length === 0 ? (
              <span className="text-[13px] text-[var(--muted-foreground)]">暂无已保存项目。</span>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {savedProjectPaths.map((path) => (
                  <li key={path} className="flex items-start gap-2">
                    <Checkbox
                      className="mt-0.5"
                      checked={picked.includes(path)}
                      onCheckedChange={(checked) => togglePicked(path, checked === true)}
                    />
                    <span className="min-w-0 flex-1 break-all text-[12px]">{path}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPickerOpen(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              disabled={picked.length === 0}
              onClick={() => {
                enqueueProjects(picked)
                setPickerOpen(false)
              }}
            >
              加入队列（{picked.length}）
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
