import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs'
import {FavoriteGroupsCard} from '@/components/FavoriteGroups/FavoriteGroupsCard'
import {GitStatusCard} from '@/components/GitStatus/GitStatusCard'
import {DependencyConflictPanel} from '@/components/DependencyConflict/DependencyConflictPanel'
import {ModuleTreePanel} from '@/components/ModuleTree/ModuleTreePanel'
import {motion, slideInUp} from '@/lib/motion'
import {useNavigationStore} from '@/store/navigationStore'

export function SidebarPanel() {
  const activePage = useNavigationStore((state) => state.activePage)

  if (activePage === 'build') {
    return (
      <aside className="flex w-[260px] shrink-0 flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--sidebar)] xl:w-[312px]">
        <Tabs defaultValue="git" className="flex min-h-0 flex-1 flex-col px-3 pb-3">
          <TabsList className="mt-1 h-9 shrink-0 justify-start gap-0.5 rounded-none border-b border-[var(--border)] bg-transparent p-0">
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
          <TabsContent value="git" className="mt-0 min-h-0 flex-1 overflow-y-auto pt-3">
            <motion.div {...slideInUp}>
              <GitStatusCard />
            </motion.div>
          </TabsContent>
          <TabsContent value="modules" className="mt-0 min-h-0 flex-1 overflow-y-auto pt-3">
            <motion.div {...slideInUp}>
              <ModuleTreePanel />
            </motion.div>
          </TabsContent>
          <TabsContent value="conflicts" className="mt-0 min-h-0 flex-1 overflow-y-auto pt-3">
            <motion.div {...slideInUp}>
              <DependencyConflictPanel />
            </motion.div>
          </TabsContent>
          <TabsContent value="favorites" className="mt-0 min-h-0 flex-1 overflow-y-auto pt-3">
            <motion.div {...slideInUp}>
              <FavoriteGroupsCard />
            </motion.div>
          </TabsContent>
        </Tabs>
      </aside>
    )
  }

  if (activePage === 'dashboard' || activePage === 'artifacts' || activePage === 'history') {
    return null
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
