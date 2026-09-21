import {
  Hammer,
  Database,
  History,
  Home,
  Settings,
} from 'lucide-react'
import type {ReactNode} from 'react'
import {useState} from 'react'
import {cn} from '@/lib/utils'
import {Button} from '@/components/ui/button'
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip'
import {useAppStore} from '@/store/useAppStore'
import {type AppPage, useNavigationStore} from '@/store/navigationStore'
import {useNavigationConfigStore} from '@/store/useNavigationConfigStore'
import {NavigationSettings} from '@/components/NavigationSettings/NavigationSettings'

const pageIcons: Record<AppPage, ReactNode> = {
  dashboard: <Home />,
  build: <Hammer />,
  artifacts: <Database />,
  history: <History />,
}

export function ActivityBar() {
  const activePage = useNavigationStore((state) => state.activePage)
  const setActivePage = useNavigationStore((state) => state.setActivePage)
  const buildStatus = useAppStore((state) => state.buildStatus)
  const navigationItems = useNavigationConfigStore((state) => state.items)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const visibleItems = navigationItems
    .filter((item) => item.visible)
    .sort((a, b) => a.order - b.order)

  return (
    <>
      <nav className="flex w-12 shrink-0 flex-col items-center gap-0.5 border-r border-[var(--border)] bg-[var(--sidebar)] py-2" aria-label="一级功能导航">
        <div className="flex flex-1 flex-col items-center gap-0.5">
          {visibleItems.map((item) => {
            const running = item.key === 'build' && buildStatus === 'RUNNING'
            return (
              <Tooltip key={item.key}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'relative size-9 rounded-[var(--radius-md)]',
                      activePage === item.key
                        ? 'bg-[var(--accent)] text-[var(--foreground)]'
                        : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
                    )}
                    aria-label={item.label}
                    onClick={() => setActivePage(item.key)}
                  >
                    {pageIcons[item.key]}
                    {running ? (
                      <span
                        className="absolute right-1 top-1 size-1.5 rounded-full bg-[var(--info)] animate-pulse"
                        aria-label="构建中"
                      />
                    ) : null}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            )
          })}
        </div>
        <div className="mx-auto my-1 h-px w-6 bg-[var(--border)]" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-9 rounded-[var(--radius-md)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              aria-label="导航栏设置"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">导航栏设置</TooltipContent>
        </Tooltip>
      </nav>
      <NavigationSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}
