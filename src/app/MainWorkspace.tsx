import {type AppPage} from '../store/navigationStore'
import {lazy, Suspense} from 'react'

interface MainWorkspaceProps {
  activePage: AppPage
}

const pageComponents = {
  dashboard: lazy(() => import('../pages/DashboardPage').then((module) => ({default: module.DashboardPage}))),
  build: lazy(() => import('../pages/BuildPage').then((module) => ({default: module.BuildPage}))),
  artifacts: lazy(() => import('../pages/ArtifactPage').then((module) => ({default: module.ArtifactPage}))),
  history: lazy(() => import('../pages/HistoryPage').then((module) => ({default: module.HistoryPage}))),
} satisfies Record<AppPage, ReturnType<typeof lazy>>

export function MainWorkspace({activePage}: MainWorkspaceProps) {
  const Page = pageComponents[activePage]

  return (
    <section className="main-workspace">
      <Suspense fallback={<div className="workspace-loading">加载工作区...</div>}>
        <Page />
      </Suspense>
    </section>
  )
}
