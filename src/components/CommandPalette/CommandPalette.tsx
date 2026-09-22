import {CornerDownLeft, Search} from 'lucide-react'
import {useMemo, useRef, useState} from 'react'
import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {commandPaletteShortcutLabel} from '@/lib/shortcuts'
import {useAppStore} from '@/store/useAppStore'
import {useNavigationStore} from '@/store/navigationStore'
import {useThemeStore} from '@/store/useThemeStore'
import {notifyError} from '@/store/useFeedbackStore'
import {getErrorMessage} from '@/utils/errors'

interface CommandItem {
  id: string
  label: string
  hint?: string
  run: () => void
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const setActivePage = useNavigationStore((state) => state.setActivePage)
  const buildStatus = useAppStore((state) => state.buildStatus)
  const startBuild = useAppStore((state) => state.startBuild)
  const cancelBuild = useAppStore((state) => state.cancelBuild)
  const refreshEnvironment = useAppStore((state) => state.refreshEnvironment)
  const scanSystemJdks = useAppStore((state) => state.scanSystemJdks)
  const savedProjectPaths = useAppStore((state) => state.savedProjectPaths)
  const parseProjectPath = useAppStore((state) => state.parseProjectPath)
  const setMode = useThemeStore((state) => state.setMode)

  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLDivElement | null>(null)

  const commands = useMemo<CommandItem[]>(() => {
    const running = buildStatus === 'RUNNING'
    const items: CommandItem[] = [
      {id: 'goto-dashboard', label: '前往首页', hint: '仪表盘', run: () => setActivePage('dashboard')},
      {id: 'goto-build', label: '前往构建中心', hint: '选模块并打包', run: () => setActivePage('build')},
      {id: 'goto-artifacts', label: '前往产物管理', run: () => setActivePage('artifacts')},
      {id: 'goto-history', label: '前往构建历史', run: () => setActivePage('history')},
      {
        id: 'build',
        label: running ? '停止当前构建' : '开始构建',
        hint: running ? '终止 Maven 进程树' : '按当前参数执行',
        run: () => {
          void (running ? cancelBuild() : startBuild())
        },
      },
      {id: 'refresh-env', label: '刷新环境检测', hint: '重新识别 JDK / Maven', run: () => void refreshEnvironment()},
      {id: 'scan-jdk', label: '扫描系统 JDK', run: () => void scanSystemJdks()},
      {id: 'theme-light', label: '切换到浅色主题', run: () => setMode('light')},
      {id: 'theme-dark', label: '切换到深色主题', run: () => setMode('dark')},
      {id: 'theme-system', label: '主题跟随系统', run: () => setMode('system')},
    ]

    // 已保存项目直接可切换，省去打开项目选择弹窗再搜索
    for (const path of savedProjectPaths) {
      items.push({
        id: `project-${path}`,
        label: `切换项目：${path.split(/[\\/]/).filter(Boolean).slice(-1)[0] ?? path}`,
        hint: path,
        run: () => {
          void parseProjectPath(path).catch((error) => notifyError('切换项目失败', getErrorMessage(error)))
        },
      })
    }
    return items
  }, [
    buildStatus,
    cancelBuild,
    parseProjectPath,
    refreshEnvironment,
    savedProjectPaths,
    scanSystemJdks,
    setActivePage,
    setMode,
    startBuild,
  ])

  const matches = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return commands
    return commands.filter(
      (item) =>
        item.label.toLowerCase().includes(keyword) || (item.hint ?? '').toLowerCase().includes(keyword),
    )
  }, [commands, query])

  // 过滤后条目变少时把选中位置收敛到有效范围，避免停留在已不存在的条目上
  const activeIndexSafe = Math.min(activeIndex, Math.max(0, matches.length - 1))

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setQuery('')
    }
    setActiveIndex(0)
    onOpenChange(next)
  }

  const execute = (item: CommandItem | undefined) => {
    if (!item) return
    setQuery('')
    setActiveIndex(0)
    onOpenChange(false)
    item.run()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg p-0">
        <DialogHeader className="px-4 pb-0 pt-4">
          <DialogTitle className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--muted-foreground)]">
            <Search className="size-3.5" />
            命令面板
          </DialogTitle>
        </DialogHeader>
        <div className="px-4 pb-2 pt-2">
          <Input
            autoFocus
            placeholder="输入命令或项目名称，↑↓ 选择，Enter 执行"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setActiveIndex(Math.min(activeIndexSafe + 1, Math.max(0, matches.length - 1)))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setActiveIndex(Math.max(activeIndexSafe - 1, 0))
              } else if (event.key === 'Enter') {
                event.preventDefault()
                execute(matches[activeIndexSafe])
              }
            }}
          />
        </div>
        <div ref={listRef} className="max-h-72 overflow-y-auto border-t border-[var(--border)] px-1 py-1">
          {matches.length === 0 ? (
            <div className="px-3 py-6 text-center text-[13px] text-[var(--muted-foreground)]">
              没有匹配的命令
            </div>
          ) : (
            matches.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={
                  index === activeIndexSafe
                    ? 'flex w-full items-center justify-between gap-2 rounded-[var(--radius)] bg-[var(--accent)] px-3 py-2 text-left text-[13px]'
                    : 'flex w-full items-center justify-between gap-2 rounded-[var(--radius)] px-3 py-2 text-left text-[13px] transition-colors hover:bg-[var(--accent)]'
                }
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => execute(item)}
              >
                <span className="truncate">{item.label}</span>
                {index === activeIndexSafe ? (
                  <CornerDownLeft className="size-3.5 shrink-0 text-[var(--muted-foreground)]" />
                ) : item.hint ? (
                  <span className="shrink-0 truncate text-[11px] text-[var(--muted-foreground)]">
                    {item.hint}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] px-4 py-2 text-[11px] text-[var(--muted-foreground)]">
          <span>↑↓ 选择 · Enter 执行 · Esc 关闭</span>
          <span>随时按 {commandPaletteShortcutLabel} 再次唤起</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
