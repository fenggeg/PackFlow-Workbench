import {lazy, Suspense} from 'react'
import {AnimatePresence} from 'motion/react'
import {type AppPage} from '../store/navigationStore'
import {useNavigationStore} from '../store/navigationStore'
import {motion, pageTransition} from '@/lib/motion'

const pageComponents = {
  dashboard: lazy(() => import('../pages/DashboardPage').then((module) => ({default: module.DashboardPage}))),
  build: lazy(() => import('../pages/BuildPage').then((module) => ({default: module.BuildPage}))),
  artifacts: lazy(() => import('../pages/ArtifactPage').then((module) => ({default: module.ArtifactPage}))),
  history: lazy(() => import('../pages/HistoryPage').then((module) => ({default: module.HistoryPage}))),
} satisfies Record<AppPage, ReturnType<typeof lazy>>

export function MainWorkspace() {
  // 直接订阅 store，避免 activePage 通过 props 逐层传递造成视图与状态脱节
  const activePage = useNavigationStore((state) => state.activePage)
  const Page = pageComponents[activePage]

  return (
    <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-[var(--background)] [scrollbar-gutter:stable]">
      <Suspense
        fallback={
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-6">
            <span className="size-5 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--primary)]" />
            <span className="text-[13px] text-[var(--muted-foreground)]">加载工作区...</span>
          </div>
        }
      >
        <AnimatePresence mode="wait">
          <motion.div key={activePage} {...pageTransition} className="h-full">
            <Page />
          </motion.div>
        </AnimatePresence>
      </Suspense>
    </main>
  )
}
