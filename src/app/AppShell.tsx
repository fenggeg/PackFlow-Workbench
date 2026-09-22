import {Folder, GitBranch, PanelRight, Search} from 'lucide-react'
import {useEffect, useState} from 'react'
import {Button} from '@/components/ui/button'
import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {StatusPill} from '@/components/ui/status-pill'
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/components/ui/tooltip'
import {Toaster} from '@/components/ui/toaster'
import {CommandPalette} from '@/components/CommandPalette/CommandPalette'
import {commandPaletteShortcutLabel} from '@/lib/shortcuts'
import {DataToolsMenu} from '@/components/DataTools/DataToolsMenu'
import {ProjectSelector} from '@/components/ProjectSelector/ProjectSelector'
import {UpdateChecker} from '@/components/UpdateChecker/UpdateChecker'
import {ExternalLinks} from '@/components/common/ExternalLinks'
import {useAppStore} from '@/store/useAppStore'
import {useNavigationStore} from '@/store/navigationStore'
import {useNavigationConfigStore} from '@/store/useNavigationConfigStore'
import {notifyInfo} from '@/store/useFeedbackStore'
import {ActivityBar} from './ActivityBar'
import {BottomActionBar} from './BottomActionBar'
import {InspectorDrawer} from './InspectorDrawer'
import {MainWorkspace} from './MainWorkspace'
import {SidebarPanel} from './SidebarPanel'
import {ThemeToggle} from './ThemeToggle'
import {TitleBarControls} from './TitleBarControls'
import {useInspectorAvailable} from './inspectorAvailability'

/** 快捷键提示最多出现 2 次，之后不再打扰 */
const PALETTE_HINT_KEY = 'packflow.command-palette-hint'
const PALETTE_HINT_MAX = 2

const branchTone = (hasLocalChanges?: boolean, hasRemoteUpdates?: boolean) => {
  if (hasRemoteUpdates) return 'warning' as const
  if (hasLocalChanges) return 'info' as const
  return 'success' as const
}

export function AppShell() {
  const project = useAppStore((state) => state.project)
  const gitStatus = useAppStore((state) => state.gitStatus)
  const defaultPage = useNavigationConfigStore((state) => state.defaultPage)
  const setActivePage = useNavigationStore((state) => state.setActivePage)
  const inspectorOpen = useNavigationStore((state) => state.inspectorOpen)
  const setInspectorOpen = useNavigationStore((state) => state.setInspectorOpen)
  const projectSwitcherOpen = useNavigationStore((state) => state.projectSwitcherOpen)
  const setProjectSwitcherOpen = useNavigationStore((state) => state.setProjectSwitcherOpen)
  const inspectorAvailable = useInspectorAvailable()
  const initialized = useAppStore((state) => state.initialized)
  const [paletteOpen, setPaletteOpen] = useState(false)

  /**
   * 快捷键本身不可见，只在启动后轻提示几次。
   * 用 localStorage 计数，提示过就不再打扰 —— 避免每次启动都弹。
   */
  useEffect(() => {
    if (!initialized) return
    let seenCount = 0
    try {
      seenCount = Number(window.localStorage.getItem(PALETTE_HINT_KEY) ?? '0')
    } catch {
      return
    }
    if (seenCount >= PALETTE_HINT_MAX) return
    try {
      window.localStorage.setItem(PALETTE_HINT_KEY, String(seenCount + 1))
    } catch {
      // 存储不可用时忽略，不影响功能
    }
    const timer = setTimeout(() => {
      notifyInfo('快捷键提示', `按 ${commandPaletteShortcutLabel} 可随时打开命令面板。`)
    }, 2000)
    return () => clearTimeout(timer)
  }, [initialized])

  // Ctrl/Cmd + K 打开命令面板：桌面工具里最常用的全局快捷入口
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((value) => !value)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    // 仅在首次挂载应用「启动时默认页面」，后续用户切换不再被覆盖
    const {activePage} = useNavigationStore.getState()
    if (activePage === 'dashboard' && defaultPage !== 'dashboard') {
      setActivePage(defaultPage)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <TooltipProvider>
      <div className="grid h-screen grid-rows-[48px_minmax(0,1fr)_56px] overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
        <header className="flex h-12 items-stretch border-b border-[var(--border)] bg-[var(--card)]">
          <div data-tauri-drag-region className="flex min-w-0 flex-1 items-center gap-2 px-3 md:px-4">
            <div className="flex size-6 shrink-0 items-center justify-center rounded-[4px] bg-[var(--primary)] text-[10px] font-semibold text-[var(--primary-foreground)]">
              PF
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 max-w-[200px] shrink gap-1.5 rounded-full border border-[var(--border)] px-2.5 text-[12px] font-medium text-[var(--foreground)] hover:bg-[var(--accent)]"
              onClick={() => setProjectSwitcherOpen(true)}
              title={project?.rootPath}
            >
              <Folder className="size-3.5 shrink-0 text-[var(--muted-foreground)]" />
              <span className="truncate">{project?.artifactId ?? '尚未选择项目'}</span>
            </Button>
            <StatusPill tone={branchTone(gitStatus?.hasLocalChanges, gitStatus?.hasRemoteUpdates)} className="shrink-0 max-xl:hidden">
              <GitBranch className="mr-0.5 size-3" />
              {gitStatus?.branch ?? '未识别分支'}
            </StatusPill>
            <button
              type="button"
              className="hidden min-w-0 max-w-[420px] truncate rounded-[var(--radius)] px-1.5 py-0.5 text-[12px] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)] lg:block"
              title={project?.rootPath}
              onClick={() => setProjectSwitcherOpen(true)}
            >
              {project?.rootPath ?? '选择项目后自动识别模块、Git 与构建环境'}
            </button>
          </div>
          <div className="flex min-w-0 shrink items-center gap-2">
            {inspectorAvailable ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={inspectorOpen ? 'primary' : 'ghost'}
                    size="iconSm"
                    aria-label={inspectorOpen ? '收起检查器' : '展开检查器'}
                    aria-pressed={inspectorOpen}
                    onClick={() => setInspectorOpen(!inspectorOpen)}
                  >
                    <PanelRight />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{inspectorOpen ? '收起检查器' : '展开检查器'}</TooltipContent>
              </Tooltip>
            ) : null}
            {/* 命令面板必须有常驻入口，只靠快捷键用户不会知道它存在 */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 rounded-full border border-[var(--border)] px-2.5 text-[12px] font-medium text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
                  aria-label={`打开命令面板（${commandPaletteShortcutLabel}）`}
                  onClick={() => setPaletteOpen(true)}
                >
                  <Search className="size-3.5" />
                  <span className="hidden xl:inline">命令</span>
                  <kbd className="hidden rounded-[4px] border border-[var(--border)] bg-[var(--muted)] px-1 py-px font-[family-name:var(--font-mono)] text-[10px] leading-4 text-[var(--muted-foreground)] xl:inline">
                    {commandPaletteShortcutLabel}
                  </kbd>
                </Button>
              </TooltipTrigger>
              <TooltipContent>打开命令面板（{commandPaletteShortcutLabel}）</TooltipContent>
            </Tooltip>
            <DataToolsMenu />
            <ExternalLinks />
            <ThemeToggle />
            <UpdateChecker />
          </div>
          <TitleBarControls />
        </header>
        <div className="relative flex min-h-0 min-w-0 overflow-hidden">
          <ActivityBar />
          <SidebarPanel />
          <MainWorkspace />
          <InspectorDrawer />
        </div>
        <BottomActionBar />
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        <Dialog open={projectSwitcherOpen} onOpenChange={setProjectSwitcherOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>项目切换</DialogTitle>
            </DialogHeader>
            <div className="flex min-h-80 flex-col gap-3 px-5 py-2">
              <ProjectSelector framed={false} onProjectSelected={() => setProjectSwitcherOpen(false)} />
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <Toaster />
    </TooltipProvider>
  )
}
