import {Boxes, Check, Folder, FolderOpen, RefreshCw, Search, Trash2} from 'lucide-react'
import {useMemo, useState} from 'react'
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
import {StatusPill} from '@/components/ui/status-pill'
import {cn} from '@/lib/utils'
import {useAppStore} from '@/store/useAppStore'

const projectNameFromPath = (path: string) => {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts.at(-1) ?? path
}

interface ProjectSelectorProps {
  framed?: boolean
  showSavedProjects?: boolean
  showActions?: boolean
  onProjectSelected?: () => void
}

export function ProjectSelector({
  framed = true,
  showSavedProjects = true,
  showActions = true,
  onProjectSelected,
}: ProjectSelectorProps) {
  const project = useAppStore((state) => state.project)
  const savedProjectPaths = useAppStore((state) => state.savedProjectPaths)
  const error = useAppStore((state) => state.error)
  const loading = useAppStore((state) => state.loading)
  const chooseProject = useAppStore((state) => state.chooseProject)
  const parseProjectPath = useAppStore((state) => state.parseProjectPath)
  const removeSavedProject = useAppStore((state) => state.removeSavedProject)
  const [manualPath, setManualPath] = useState('')
  const [removeTarget, setRemoveTarget] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const currentPath = project?.rootPath ?? ''
  const moduleCount = project?.modules.length ?? 0

  const filteredSavedProjects = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return savedProjectPaths
    return savedProjectPaths.filter((path) => {
      const name = projectNameFromPath(path).toLowerCase()
      return name.includes(query) || path.toLowerCase().includes(query)
    })
  }, [savedProjectPaths, searchQuery])

  const content = (
    <div className="flex w-full flex-col gap-3">
      {project ? (
        <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]/40 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)]">
              <Boxes className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[14px] font-semibold text-[var(--foreground)]">
                  {project.artifactId}
                </span>
                {project.version ? <StatusPill className="shrink-0">{project.version}</StatusPill> : null}
              </div>
            </div>
          </div>
          <MonoText className="block truncate text-[11px] text-[var(--muted-foreground)]" as="div">
            {project.rootPath}
          </MonoText>
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusPill>模块 {moduleCount}</StatusPill>
            {project.packaging ? <StatusPill>打包 {project.packaging}</StatusPill> : null}
            {project.groupId ? <StatusPill>{project.groupId}</StatusPill> : null}
            <StatusPill tone="success" className="ml-auto shrink-0">
              <Check className="mr-0.5 size-3" />
              当前项目
            </StatusPill>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] px-3 py-3">
          <span className="text-[13px] font-medium text-[var(--foreground)]">尚未选择项目</span>
          <span className="text-[12px] text-[var(--muted-foreground)]">
            请选择包含 pom.xml 的父工程目录，或从下方已保存项目中选择。
          </span>
        </div>
      )}

      {showActions ? (
        <div className="flex flex-col gap-2">
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
        </div>
      ) : null}

      {error ? (
        <div className="rounded-[var(--radius)] border border-[var(--error)]/30 bg-[var(--error)]/5 px-3 py-2 text-[13px] text-[var(--error)]">
          {error}
        </div>
      ) : null}

      {showSavedProjects ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium">已保存项目</span>
            {savedProjectPaths.length > 0 ? (
              <span className="text-[12px] text-[var(--muted-foreground)]">
                {filteredSavedProjects.length}/{savedProjectPaths.length}
              </span>
            ) : null}
          </div>
          {savedProjectPaths.length > 0 ? (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--muted-foreground)]" />
              <Input
                className="h-8 pl-8 text-[13px]"
                placeholder="搜索项目名称或路径…"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
          ) : null}
          {savedProjectPaths.length === 0 ? (
            <div className="flex min-h-12 items-center justify-center text-[13px] text-[var(--muted-foreground)]">
              暂无保存项目
            </div>
          ) : filteredSavedProjects.length === 0 ? (
            <div className="flex min-h-12 items-center justify-center text-[13px] text-[var(--muted-foreground)]">
              未找到匹配的项目
            </div>
          ) : (
            <ul className="m-0 max-h-72 list-none divide-y divide-[var(--border)] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] p-0">
              {filteredSavedProjects.map((path) => {
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
                    <Folder
                      className={cn(
                        'size-4 shrink-0',
                        active ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)]',
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium" title={projectNameFromPath(path)}>
                        {projectNameFromPath(path)}
                      </div>
                      <MonoText className="block truncate text-[11px] text-[var(--muted-foreground)]" as="div">
                        {path}
                      </MonoText>
                    </div>
                    {active ? (
                      <StatusPill tone="success">当前</StatusPill>
                    ) : null}
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
      ) : null}

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