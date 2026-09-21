import {Folder, GitBranch, PanelRight} from 'lucide-react'
import {useEffect, useState} from 'react'
import {Button} from '@/components/ui/button'
import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {StatusPill} from '@/components/ui/status-pill'
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/components/ui/tooltip'
import {Toaster} from '@/components/ui/toaster'
import {ProjectSelector} from '@/components/ProjectSelector/ProjectSelector'
import {UpdateChecker} from '@/components/UpdateChecker/UpdateChecker'
import {useAppStore} from '@/store/useAppStore'
import {useNavigationStore} from '@/store/navigationStore'
import {useNavigationConfigStore} from '@/store/useNavigationConfigStore'
import {ActivityBar} from './ActivityBar'
import {BottomActionBar} from './BottomActionBar'
import {InspectorDrawer} from './InspectorDrawer'
import {MainWorkspace} from './MainWorkspace'
import {SidebarPanel} from './SidebarPanel'
import {ThemeToggle} from './ThemeToggle'
import {TitleBarControls} from './TitleBarControls'
import {useInspectorAvailable} from './inspectorAvailability'

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
  const inspectorAvailable = useInspectorAvailable()
  const [projectSwitcherOpen, setProjectSwitcherOpen] = useState(false)

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
        <Dialog open={projectSwitcherOpen} onOpenChange={setProjectSwitcherOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>项目切换</DialogTitle>
            </DialogHeader>
            <div className="px-1 pb-2">
              <ProjectSelector framed={false} onProjectSelected={() => setProjectSwitcherOpen(false)} />
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <Toaster />
    </TooltipProvider>
  )
}
