import {DeploymentCenterPanel} from '../components/Deployment/DeploymentCenterPanel'

export function DeploymentPage() {
  return (
    <main className="workspace-page">
      <div className="workspace-heading">
        <div>
          <h3 className="text-lg font-medium">部署中心</h3>
          <span className="text-sm text-muted-foreground">从最近产物进入发布映射、环境选择、部署步骤与健康检查。</span>
        </div>
      </div>
      <DeploymentCenterPanel />
    </main>
  )
}