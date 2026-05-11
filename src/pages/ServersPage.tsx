import {useNavigationStore} from '../store/navigationStore'
import {ServerListPanel} from '../components/ServerManagement/ServerListPanel'
import {ServerDetailPage} from '../components/ServerManagement/ServerDetailPage'

export function ServersPage() {
  const selectedServerId = useNavigationStore((state) => state.selectedServerId)

  if (selectedServerId) {
    return <ServerDetailPage serverId={selectedServerId} />
  }

  return (
    <main className="workspace-page">
      <div className="workspace-heading">
        <div>
          <h3 className="text-lg font-medium">服务器管理</h3>
          <span className="text-sm text-muted-foreground">管理远程服务器连接、分组、标签，快速进入终端、文件、日志等运维操作。</span>
        </div>
      </div>
      <ServerListPanel />
    </main>
  )
}