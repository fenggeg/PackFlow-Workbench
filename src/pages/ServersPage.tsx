import {Typography} from 'antd'
import {useNavigationStore} from '../store/navigationStore'
import {ServerListPanel} from '../components/ServerManagement/ServerListPanel'
import {ServerDetailPage} from '../components/ServerManagement/ServerDetailPage'

const {Title, Text} = Typography

export function ServersPage() {
  const selectedServerId = useNavigationStore((state) => state.selectedServerId)

  if (selectedServerId) {
    return <ServerDetailPage serverId={selectedServerId} />
  }

  return (
    <main className="workspace-page">
      <div className="workspace-heading">
        <div>
          <Title level={3}>服务器管理</Title>
          <Text type="secondary">管理远程服务器连接、分组、标签，快速进入终端、文件、日志等运维操作。</Text>
        </div>
      </div>
      <ServerListPanel />
    </main>
  )
}
