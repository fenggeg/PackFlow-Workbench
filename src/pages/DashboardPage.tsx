import {Button, Card, Col, Empty, List, Row, Space, Tag, Typography} from 'antd'
import {
  CloudServerOutlined,
  DatabaseOutlined,
  RocketOutlined,
} from '@ant-design/icons'
import {useAppStore} from '../store/useAppStore'
import {useNavigationStore} from '../store/navigationStore'
import {useWorkflowStore} from '../store/useWorkflowStore'

const {Title, Text} = Typography

export function DashboardPage() {
  const setActivePage = useNavigationStore((state) => state.setActivePage)
  const navigateToDeployment = useNavigationStore((state) => state.navigateToDeployment)
  const navigateToServerDetail = useNavigationStore((state) => state.navigateToServerDetail)
  const project = useAppStore((state) => state.project)
  const environment = useAppStore((state) => state.environment)
  const buildStatus = useAppStore((state) => state.buildStatus)
  const serverProfiles = useWorkflowStore((state) => state.serverProfiles)

  const runningTasks = [
    buildStatus === 'RUNNING' ? 'Maven 构建正在运行' : undefined,
  ].filter((item): item is string => Boolean(item))

  return (
    <main className="workspace-page">
      <div className="workspace-heading">
        <div>
          <Title level={3}>首页 Dashboard</Title>
          <Text type="secondary">构建、部署、服务运维一站式管理。</Text>
        </div>
        <Button type="primary" icon={<RocketOutlined />} onClick={() => setActivePage('deployment')}>
          命令调度中心
        </Button>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card title="当前环境状态" className="panel-card">
            <Space direction="vertical" size={8} style={{width: '100%'}}>
              <Text>项目：{project?.artifactId ?? '未选择'}</Text>
              <Text type="secondary" ellipsis title={project?.rootPath}>{project?.rootPath ?? '选择项目后显示路径'}</Text>
              <Space wrap>
                <Tag color={environment?.status === 'ok' ? 'green' : environment?.status === 'error' ? 'red' : 'gold'}>
                  {environment?.status === 'ok' ? '环境正常' : environment?.status === 'error' ? '环境异常' : '待检查'}
                </Tag>
                <Tag>JDK：{environment?.javaVersion ?? '未识别'}</Tag>
                <Tag>Maven：{environment?.mavenVersion ?? (environment?.hasMavenWrapper ? 'mvnw' : '未识别')}</Tag>
              </Space>
            </Space>
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card title="正在运行任务" className="panel-card">
            {runningTasks.length === 0 ? (
              <Empty description="当前没有运行中的构建任务" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <List dataSource={runningTasks} renderItem={(item) => <List.Item><Tag color="processing">{item}</Tag></List.Item>} />
            )}
          </Card>
        </Col>

        <Col xs={24}>
          <Card title="快捷操作" className="panel-card">
            <Space wrap>
              <Button type="primary" icon={<RocketOutlined />} onClick={() => setActivePage('deployment')}>命令调度中心</Button>
              <Button icon={<DatabaseOutlined />} onClick={() => setActivePage('build')}>构建打包</Button>
              <Button icon={<CloudServerOutlined />} onClick={() => navigateToDeployment()}>部署管理</Button>
              <Button
                disabled={serverProfiles.length === 0}
                onClick={() => {
                  const firstServer = serverProfiles[0]
                  if (firstServer) {
                    navigateToServerDetail(firstServer.id, 'commands')
                  }
                }}
              >
                服务器管理
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>
    </main>
  )
}
