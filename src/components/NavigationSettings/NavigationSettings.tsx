import {ArrowDown, ArrowUp} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {type AppPage} from '@/store/navigationStore'
import {useNavigationConfigStore} from '@/store/useNavigationConfigStore'

interface NavigationSettingsProps {
  open: boolean
  onClose: () => void
}

export function NavigationSettings({open, onClose}: NavigationSettingsProps) {
  // 单一数据源：直接读写 store，避免本地副本与 store 不一致
  const items = useNavigationConfigStore((state) => state.items)
  const defaultPage = useNavigationConfigStore((state) => state.defaultPage)
  const toggleVisibility = useNavigationConfigStore((state) => state.toggleVisibility)
  const moveItem = useNavigationConfigStore((state) => state.moveItem)
  const setDefaultPage = useNavigationConfigStore((state) => state.setDefaultPage)
  const resetToDefault = useNavigationConfigStore((state) => state.resetToDefault)

  const handleMoveUp = (index: number) => {
    if (index > 0) moveItem(index, index - 1)
  }

  const handleMoveDown = (index: number) => {
    if (index < items.length - 1) moveItem(index, index + 1)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>导航栏设置</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 px-5 py-2">
          <div className="flex flex-col gap-2">
            <span className="text-[12px] text-[var(--muted-foreground)]">启动时默认打开页面</span>
            <Select value={defaultPage} onValueChange={(value) => setDefaultPage(value as AppPage)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={item.key} value={item.key} disabled={!item.visible}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[12px] text-[var(--muted-foreground)]">
              使用箭头调整导航栏顺序，开关控制是否在主页显示
            </span>
            <div className="flex flex-col gap-2">
              {items.map((item, index) => (
                <div
                  key={item.key}
                  className={
                    item.visible
                      ? 'flex items-center justify-between rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-3 py-2'
                      : 'flex items-center justify-between rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] px-3 py-2 opacity-60'
                  }
                >
                  <span
                    className={
                      item.visible
                        ? 'text-[13px] font-medium text-[var(--foreground)]'
                        : 'text-[13px] text-[var(--muted-foreground)] line-through'
                    }
                  >
                    {item.label}
                  </span>
                  <div className="flex items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="iconSm"
                      disabled={index === 0}
                      aria-label="上移"
                      onClick={() => handleMoveUp(index)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="iconSm"
                      disabled={index === items.length - 1}
                      aria-label="下移"
                      onClick={() => handleMoveDown(index)}
                    >
                      <ArrowDown />
                    </Button>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={item.visible}
                      aria-label={`${item.label} 显示开关`}
                      onClick={() => toggleVisibility(item.key)}
                      className={
                        item.visible
                          ? 'relative h-5 w-9 rounded-full bg-[var(--primary)] transition-colors'
                          : 'relative h-5 w-9 rounded-full bg-[var(--border-strong)] transition-colors'
                      }
                    >
                      <span
                        className={
                          item.visible
                            ? 'absolute right-0.5 top-0.5 size-4 rounded-full bg-[var(--background)] transition-transform'
                            : 'absolute left-0.5 top-0.5 size-4 rounded-full bg-[var(--background)] transition-transform'
                        }
                      />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={resetToDefault}>
            恢复默认
          </Button>
          <Button variant="primary" onClick={onClose}>
            完成
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
