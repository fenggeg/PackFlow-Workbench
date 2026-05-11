import {WorkbenchHistoryPanel} from '../components/HistoryTable/WorkbenchHistoryPanel'

export function HistoryPage() {
  return (
    <main className="workspace-page">
      <div className="workspace-heading">
        <div>
          <h3 className="text-lg font-medium">历史管理</h3>
          <span className="text-sm text-muted-foreground">统一查看构建记录和部署记录。</span>
        </div>
      </div>
      <WorkbenchHistoryPanel />
    </main>
  )
}