import {EnvPanel} from '../components/EnvPanel/EnvPanel'

export function EnvironmentPage() {
  return (
    <main className="workspace-page">
      <div className="workspace-heading">
        <div>
          <h3 className="text-lg font-medium">环境管理</h3>
          <span className="text-sm text-muted-foreground">管理 JDK、Maven、Wrapper、settings.xml、本地仓库和 Git 检测结果。</span>
        </div>
      </div>
      <EnvPanel />
    </main>
  )
}