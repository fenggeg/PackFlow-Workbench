import {Alert, Button, Card, Col, Empty, List, Row, Space, Tag, Typography,} from 'antd'
import {
  CloudServerOutlined,
  DatabaseOutlined,
  FileSearchOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  RocketOutlined,
} from '@ant-design/icons'
import {useMemo} from 'react'
import {useAppStore} from '../store/useAppStore'
import {useNavigationStore} from '../store/navigationStore'
import {useReleaseStore} from '../store/useReleaseStore'
import {useWorkflowStore} from '../store/useWorkflowStore'

const {Title, Text} = Typography

const releaseStatusMeta = (status: string) => {
  switch (status) {
    case 'success': return {label: '成功', color: 'green'}
    case 'failed': return {label: '失败', color: 'red'}
    case 'cancelled': return {label: '已取消', color: 'default'}
    case 'building': return {label: '构建中', color: 'processing'}
    case 'deploying': return {label: '部署中', color: 'processing'}
    case 'checking': return {label: '验证中', color: 'processing'}
    default: return {label: '进行中', color: 'blue'}
  }
}

const targetBindingMode = (targetServerId?: string, mode?: string) =>
  mode ?? (targetServerId ? 'fixed' : 'runtime')

export function DashboardPage() {
  const setActivePage = useNavigationStore((state) => state.setActivePage)
  const navigateToDeployment = useNavigationStore((state) => state.navigateToDeployment)
  const navigateToServerDetail = useNavigationStore((state) => state.navigateToServerDetail)
  const project = useAppStore((state) => state.project)
  const environment = useAppStore((state) => state.environment)
  const buildStatus = useAppStore((state) => state.buildStatus)
  const releaseTemplates = useReleaseStore((state) => state.templates)
  const releaseRecords = useReleaseStore((state) => state.records)
  const startRelease = useReleaseStore((state) => state.startRelease)
  const runningRelease = useReleaseStore((state) => state.running)
  const currentRelease = useReleaseStore((state) => state.currentRecord)
  const deploymentTask = useWorkflowStore((state) => state.currentDeploymentTask)
  const serverProfiles = useWorkflowStore((state) => state.serverProfiles)

  const favoriteTemplates = useMemo(() => releaseTemplates.slice(0, 5), [releaseTemplates])
  const recentRecords = useMemo(() => releaseRecords.slice(0, 6), [releaseRecords])
  const runningTasks = [
    buildStatus === 'RUNNING' ? 'Maven 构建正在运行' : undefined,
    runningRelease && currentRelease ? `发布任务：${currentRelease.moduleName}` : undefined,
    deploymentTask && !['success', 'failed', 'timeout', 'cancelled'].includes(deploymentTask.status)
      ? `部署任务：${deploymentTask.deploymentProfileName ?? deploymentTask.id}`
      : undefined,
  ].filter((item): item is string => Boolean(item))

  return (
    <main className="workspace-page">
      <div className="workspace-heading">
        <div>
          <Title level={3}>首页 Dashboard</Title>
          <Text type="secondary">围绕一键发布闭环聚合模板、历史、环境和正在运行的任务。</Text>
        </div>
        <Button type="primary" icon={<RocketOutlined />} onClick={() => setActivePage('release')}>
          一键发布
        </Button>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <Card title="常用发布模板" className="panel-card">
            {favoriteTemplates.length === 0 ? (
              <Empty description="暂无发布模板" image={Empty.PRESENTED_IMAGE_SIMPLE}>
                <Button type="primary" icon={<RocketOutlined />} onClick={() => setActivePage('release')}>
                  创建发布模板
                </Button>
              </Empty>
            ) : (
              <List
                dataSource={favoriteTemplates}
                renderItem={(template) => (
                  <List.Item
                    actions={[
                      <Button
                        key="run"
                        type="primary"
                        size="small"
                        icon={<PlayCircleOutlined />}
                        loading={runningRelease && Boolean(template.targetServerId)}
                        onClick={() => {
                          if (targetBindingMode(template.targetServerId, template.targetBindingMode) === 'runtime') {
                            setActivePage('release')
                            return
                          }
                          void startRelease(template)
                        }}
                      >
                        {targetBindingMode(template.targetServerId, template.targetBindingMode) === 'runtime' ? '选择服务器' : '发布'}
                      </Button>,
                    ]}
                  >
                    <List.Item.Meta
                      title={template.name}
                      description={`${template.moduleName} → ${targetBindingMode(template.targetServerId, template.targetBindingMode) === 'runtime' ? '发布时选择服务器' : serverProfiles.find((server) => server.id === template.targetServerId)?.name ?? '目标服务器'} · ${template.remoteDeployDir}`}
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>

        <Col xs={24} xl={12}>
          <Card title="最近发布记录" className="panel-card">
            {recentRecords.length === 0 ? (
              <Empty description="暂无发布历史" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <List
                dataSource={recentRecords}
                renderItem={(record) => {
                  const meta = releaseStatusMeta(record.status)
                  return (
                    <List.Item>
                      <List.Item.Meta
                        title={(
                          <Space size={8} wrap>
                            <Tag color={meta.color}>{meta.label}</Tag>
                            <Text>{record.moduleName}</Text>
                          </Space>
                        )}
                        description={`${new Date(record.startedAt).toLocaleString()} · ${record.gitBranch ?? '未记录分支'} · ${record.failureSummary ?? record.artifactPath ?? '链路已记录'}`}
                      />
                    </List.Item>
                  )
                }}
              />
            )}
          </Card>
        </Col>

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
              {environment?.errors?.length ? (
                <Alert type="warning" showIcon message={environment.errors.join('；')} />
              ) : null}
            </Space>
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card title="正在运行任务" className="panel-card">
            {runningTasks.length === 0 ? (
              <Empty description="当前没有运行中的构建、发布或部署任务" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <List dataSource={runningTasks} renderItem={(item) => <List.Item><Tag color="processing">{item}</Tag></List.Item>} />
            )}
          </Card>
        </Col>

        <Col xs={24}>
          <Card title="快捷操作" className="panel-card">
            <Space wrap>
              <Button type="primary" icon={<RocketOutlined />} onClick={() => setActivePage('release')}>一键发布</Button>
              <Button icon={<DatabaseOutlined />} onClick={() => setActivePage('build')}>仅打包</Button>
              <Button icon={<CloudServerOutlined />} onClick={() => navigateToDeployment()}>仅部署</Button>
              <Button icon={<FileSearchOutlined />} onClick={() => setActivePage('servers')}>查看日志</Button>
              <Button
                icon={<ReloadOutlined />}
                disabled={serverProfiles.length === 0}
                onClick={() => {
                  const firstServer = serverProfiles[0]
                  if (firstServer) {
                    navigateToServerDetail(firstServer.id, 'commands')
                  }
                }}
              >
                重启服务
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>
    </main>
  )
}
