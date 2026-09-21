import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {StatusPill} from '@/components/ui/status-pill'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs'
import {FavoriteGroupsCard} from '@/components/FavoriteGroups/FavoriteGroupsCard'
import {GitStatusCard} from '@/components/GitStatus/GitStatusCard'
import {DependencyConflictPanel} from '@/components/DependencyConflict/DependencyConflictPanel'
import {ModuleTreePanel} from '@/components/ModuleTree/ModuleTreePanel'
import {ProjectSelector} from '@/components/ProjectSelector/ProjectSelector'
import {useAppStore} from '@/store/useAppStore'
import {type BuildSidebarTab, useNavigationStore} from '@/store/navigationStore'

export function SidebarPanel() {
  const history = useAppStore((state) => state.history)
  const activePage = useNavigationStore((state) => state.activePage)
  const buildSidebarTab = useNavigationStore((state) => state.buildSidebarTab)
  const setBuildSidebarTab = useNavigationStore((state) => state.setBuildSidebarTab)

  if (activePage === 'build') {
    return (
      <aside className="flex w-[260px] shrink-0 flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--sidebar)] xl:w-[312px]">
        <Tabs
          value={buildSidebarTab}
          onValueChange={(key) => setBuildSidebarTab(key as BuildSidebarTab)}
          className="flex min-h-0 flex-1 flex-col px-3 pb-3"
        >
          <TabsList className="mt-1 h-9 shrink-0 justify-start gap-0.5 rounded-none border-b border-[var(--border)] bg-transparent p-0">
            <TabsTrigger value="project" className="h-9 rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-[var(--primary)] data-[state=active]:bg-transparent">
              项目
            </TabsTrigger>
            <TabsTrigger value="git" className="h-9 rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-[var(--primary)] data-[state=active]:bg-transparent">
              Git
            </TabsTrigger>
            <TabsTrigger value="modules" className="h-9 rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-[var(--primary)] data-[state=active]:bg-transparent">
              模块
            </TabsTrigger>
            <TabsTrigger value="conflicts" className="h-9 rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-[var(--primary)] data-[state=active]:bg-transparent">
              冲突
            </TabsTrigger>
            <TabsTrigger value="favorites" className="h-9 rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-[var(--primary)] data-[state=active]:bg-transparent">
              常用
            </TabsTrigger>
          </TabsList>
          <TabsContent value="project" className="mt-0 min-h-0 flex-1 overflow-y-auto pt-3">
            <ProjectSelector />
          </TabsContent>
          <TabsContent value="git" className="mt-0 min-h-0 flex-1 overflow-y-auto pt-3">
            <GitStatusCard />
          </TabsContent>
          <TabsContent value="modules" className="mt-0 min-h-0 flex-1 overflow-y-auto pt-3">
            <ModuleTreePanel />
          </TabsContent>
          <TabsContent value="conflicts" className="mt-0 min-h-0 flex-1 overflow-y-auto pt-3">
            <DependencyConflictPanel />
          </TabsContent>
          <TabsContent value="favorites" className="mt-0 min-h-0 flex-1 overflow-y-auto pt-3">
            <FavoriteGroupsCard />
          </TabsContent>
        </Tabs>
      </aside>
    )
  }

  if (activePage === 'dashboard' || activePage === 'artifacts') {
    return null
  }

  if (activePage === 'history') {
    const buildSuccess = history.filter((h) => h.status === 'SUCCESS').length
    const buildFailed = history.filter((h) => h.status === 'FAILED').length
    const lastBuild = history[0]

    return (
      <aside className="flex w-[260px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-[var(--border)] bg-[var(--sidebar)] p-4 xl:w-[312px]">
        <Card>
          <CardHeader>
            <CardTitle>构建统计</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              <span className="text-[12px] text-[var(--muted-foreground)]">构建记录</span>
              <div className="flex flex-wrap gap-1.5">
                <StatusPill tone="info">总计 {history.length}</StatusPill>
                <StatusPill tone="success">成功 {buildSuccess}</StatusPill>
                <StatusPill tone="error">失败 {buildFailed}</StatusPill>
              </div>
              {lastBuild ? (
                <span className="text-[12px] text-[var(--muted-foreground)]">
                  最近：{new Date(lastBuild.createdAt).toLocaleString()} ·{' '}
                  {lastBuild.status === 'SUCCESS' ? '成功' : lastBuild.status === 'FAILED' ? '失败' : '已取消'}
                </span>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </aside>
    )
  }

  return (
    <aside className="flex w-[260px] shrink-0 flex-col overflow-y-auto border-r border-[var(--border)] bg-[var(--sidebar)] p-4 xl:w-[312px]">
      <Card>
        <CardHeader>
          <CardTitle>工作区</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="m-0 text-[13px] text-[var(--muted-foreground)]">选择左侧功能后，这里会显示对应的辅助信息。</p>
        </CardContent>
      </Card>
    </aside>
  )
}
