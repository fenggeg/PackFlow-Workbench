import {FolderOpen, RefreshCw, Trash2} from 'lucide-react'
import {useState} from 'react'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {MonoText} from '@/components/ui/mono-text'
import {useAppStore} from '@/store/useAppStore'

const projectNameFromPath = (path: string) => {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts.at(-1) ?? path
}

interface ProjectSelectorProps {
  framed?: boolean
  onProjectSelected?: () => void
}

export function ProjectSelector({framed = true, onProjectSelected}: ProjectSelectorProps) {
  const project = useAppStore((state) => state.project)
  const savedProjectPaths = useAppStore((state) => state.savedProjectPaths)
  const error = useAppStore((state) => state.error)
  const loading = useAppStore((state) => state.loading)
  const chooseProject = useAppStore((state) => state.chooseProject)
  const parseProjectPath = useAppStore((state) => state.parseProjectPath)
  const removeSavedProject = useAppStore((state) => state.removeSavedProject)
  const [manualPath, setManualPath] = useState('')
  const [removeTarget, setRemoveTarget] = useState<string | null>(null)

  const currentPath = project?.rootPath ?? ''

  const content = (
    <div className="flex w-full flex-col gap-3">
      <Button variant="primary" className="w-full gap-1.5" disabled={loading} onClick={chooseProject}>
        <FolderOpen />
        {loading ? '加载中…' : '选择 Maven 项目'}
      </Button>
      <form
        className="flex gap-1.5"
        onSubmit={(event) => {
          event.preventDefault()
          const value = manualPath.trim()
          if (value) {
            void parseProjectPath(value).then(onProjectSelected)
            setManualPath('')
          }
        }}
      >
        <Input
          placeholder="也可以粘贴项目根目录"
          value={manualPath}
          onChange={(event) => setManualPath(event.target.value)}
        />
        <Button type="submit" variant="secondary" size="icon" aria-label="解析路径">
          <RefreshCw />
        </Button>
      </form>
      {currentPath ? (
        <MonoText className="break-all text-[12px] text-[var(--muted-foreground)]">{currentPath}</MonoText>
      ) : (
        <span className="text-[13px] text-[var(--muted-foreground)]">请选择包含 pom.xml 的父工程目录。</span>
      )}
      {error ? (
        <div className="rounded-[var(--radius)] border border-[var(--error)]/30 bg-[var(--error)]/5 px-3 py-2 text-[13px] text-[var(--error)]">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium">已保存项目</span>
        {savedProjectPaths.length === 0 ? (
          <div className="flex min-h-12 items-center justify-center text-[13px] text-[var(--muted-foreground)]">
            暂无保存项目
          </div>
        ) : (
          <ul className="m-0 list-none divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] p-0">
            {savedProjectPaths.map((path) => {
              const active = path.toLowerCase() === currentPath.toLowerCase()
              return (
                <li
                  key={path}
                  className={
                    active
                      ? 'flex cursor-default items-center gap-2 bg-[var(--accent)] px-3 py-2'
                      : 'flex cursor-pointer items-center gap-2 px-3 py-2 transition-colors hover:bg-[var(--accent)]'
                  }
                  onClick={() => {
                    if (!active) void parseProjectPath(path).then(onProjectSelected)
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium" title={projectNameFromPath(path)}>
                      {projectNameFromPath(path)}
                    </div>
                    <MonoText className="block truncate text-[11px] text-[var(--muted-foreground)]" as="div">
                      {path}
                    </MonoText>
                  </div>
                  <Button
                    variant="ghost"
                    size="iconSm"
                    className="shrink-0 text-[var(--error)]"
                    aria-label="移除项目"
                    onClick={(event) => {
                      event.stopPropagation()
                      setRemoveTarget(path)
                    }}
                  >
                    <Trash2 />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <Dialog open={Boolean(removeTarget)} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>从列表移除该项目？</DialogTitle>
          </DialogHeader>
          <p className="m-0 px-5 py-1 text-[13px] text-[var(--muted-foreground)]">{removeTarget}</p>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRemoveTarget(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (removeTarget) void removeSavedProject(removeTarget)
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

  if (!framed) {
    return content
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>项目选择</CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  )
}
