import {Check, Plus, Search, Trash2} from 'lucide-react'
import {useState} from 'react'
import {Button} from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {StatusPill} from '@/components/ui/status-pill'
import {selectLocalDirectory} from '@/services/tauri-api'
import {useAppStore} from '@/store/useAppStore'

interface JdkRegistryPanelProps {
  onSelect?: (jdkPath: string) => void
}

export function JdkRegistryPanel({onSelect}: JdkRegistryPanelProps) {
  const environment = useAppStore((state) => state.environment)
  const jdkRegistry = useAppStore((state) => state.jdkRegistry)
  const scanSystemJdks = useAppStore((state) => state.scanSystemJdks)
  const addJdkToRegistry = useAppStore((state) => state.addJdkToRegistry)
  const removeJdkFromRegistry = useAppStore((state) => state.removeJdkFromRegistry)
  const [removeTarget, setRemoveTarget] = useState<{id: string; name: string} | null>(null)

  const currentJdkPath = environment?.javaHome

  const handleAddJdk = async () => {
    const selected = await selectLocalDirectory('选择 JDK 安装目录')
    if (selected) {
      await addJdkToRegistry(selected)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {jdkRegistry.length > 0 ? (
        <ul className="m-0 list-none divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] p-0">
          {jdkRegistry.map((entry) => {
            const isCurrent = currentJdkPath?.toLowerCase() === entry.path.toLowerCase()
            return (
              <li
                key={entry.id}
                className={
                  isCurrent
                    ? 'flex cursor-pointer items-center gap-2 bg-[var(--accent)] px-3 py-2'
                    : 'flex cursor-pointer items-center gap-2 px-3 py-2 transition-colors hover:bg-[var(--accent)]'
                }
                onClick={() => onSelect?.(entry.path)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-medium">{entry.name}</span>
                    {entry.isDefault ? <StatusPill tone="warning">默认</StatusPill> : null}
                    {isCurrent ? <Check className="size-3.5 text-[var(--success)]" /> : null}
                  </div>
                  <div className="truncate font-[family-name:var(--font-mono)] text-[11px] text-[var(--muted-foreground)]" title={entry.path}>
                    {entry.path}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="iconSm"
                  className="shrink-0 text-[var(--error)]"
                  aria-label="移除 JDK"
                  onClick={(event) => {
                    event.stopPropagation()
                    setRemoveTarget({id: entry.id, name: entry.name})
                  }}
                >
                  <Trash2 />
                </Button>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="py-3 text-center text-[13px] text-[var(--muted-foreground)]">
          暂无已注册 JDK，请先扫描或手动添加
        </div>
      )}

      <div className="flex gap-1.5">
        <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => void scanSystemJdks()}>
          <Search />
          扫描系统 JDK
        </Button>
        <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => void handleAddJdk()}>
          <Plus />
          添加 JDK
        </Button>
      </div>

      <Dialog open={Boolean(removeTarget)} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>移除此 JDK？</DialogTitle>
          </DialogHeader>
          <p className="m-0 px-5 py-1 text-[13px] text-[var(--muted-foreground)]">{removeTarget?.name}</p>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRemoveTarget(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (removeTarget) void removeJdkFromRegistry(removeTarget.id)
                setRemoveTarget(null)
              }}
            >
              移除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
