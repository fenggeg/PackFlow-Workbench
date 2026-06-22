import {Typography} from 'antd'
import {CommandCenterPanel} from '../components/CommandCenter/CommandCenterPanel'

const {Title, Text} = Typography

export function DeploymentPage() {
  return (
    <main className="workspace-page">
      <div className="workspace-heading">
        <div>
          <Title level={3}>命令调度中心</Title>
          <Text type="secondary">模板化命令链执行，支持文件上传和远程命令，面向运维场景。</Text>
        </div>
      </div>
      <CommandCenterPanel />
    </main>
  )
}