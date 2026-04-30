import {CopyOutlined, FullscreenOutlined, MenuFoldOutlined, MenuUnfoldOutlined} from '@ant-design/icons'
import {Button, Card, Empty, List, Modal, Space, Tabs, Tag, Typography} from 'antd'
import {useEffect, useMemo, useState} from 'react'
import {BuildLogPanel} from '../components/BuildLogPanel/BuildLogPanel'
import {LogConsole} from '../components/common/LogConsole'
import {RemoteLogViewer} from '../features/service-ops/components/RemoteLogViewer'
import {useServiceOperationStore} from '../features/service-ops/stores/serviceOperationStore'
import {useAppStore} from '../store/useAppStore'
import {type InspectorTab, useNavigationStore} from '../store/navigationStore'
import {useWorkflowStore} from '../store/useWorkflowStore'
import type {BuildDiagnosis, DeploymentStage} from '../types/domain'

const {Text} = Typography

const diagnosisCategoryText: Record<BuildDiagnosis['category'], string> = {
  jdk_mismatch: 'JDK 版本不匹配',
  maven_missing: 'Maven 不存在',
  wrapper_issue: 'Wrapper 失效',
  settings_missing: 'settings.xml 缺失',
  dependency_download_failed: '依赖下载失败',
  repo_unreachable: '私服不可达',
  profile_invalid: 'profile 不存在',
  module_invalid: '模块路径错误',
  test_failed: '单元测试失败',
  unknown: '未知错误',
}

const deploymentRunning = (status?: string) =>
  Boolean(status && !['success', 'failed', 'cancelled'].includes(status))

const deploymentStatusText = (status?: string) => {
  switch (status) {
    case 'success': return '部署成功'
    case 'failed': return '部署失败'
    case 'cancelled': return '已停止'
    case 'pending': return '等待中'
    case 'uploading': return '上传中'
    case 'stopping': return '停止旧服务'
    case 'starting': return '启动中'
    case 'checking': return '检测中'
    default: return status ?? '未知'
  }
}

const stageStatusText = (status: string) => {
  switch (status) {
    case 'pending': return '等待中'
    case 'waiting': return '等待中'
    case 'running': return '执行中'
    case 'checking': return '检测中'
    case 'success': return '成功'
    case 'failed': return '失败'
    case 'skipped': return '已跳过'
    case 'timeout': return '超时'
    case 'cancelled': return '已停止'
    default: return status
  }
}

const stageStatusColor = (status: string) => {
  switch (status) {
    case 'success': return 'success'
    case 'failed':
    case 'timeout': return 'error'
    case 'cancelled': return 'warning'
    case 'running':
    case 'checking':
    case 'waiting': return 'processing'
    case 'skipped': return 'default'
    default: return 'default'
  }
}

const stepTypeText = (type?: string) => {
  switch (type) {
    case 'ssh_command': return 'SSH 命令'
    case 'wait': return '等待'
    case 'port_check': return '端口检测'
    case 'http_check': return 'HTTP 健康检查'
    case 'log_check': return '日志关键字检测'
    case 'upload_file': return '文件上传'
    case 'startup_probe': return '启动探针'
    default: return type ?? '部署步骤'
  }
}

const probeTypeText = (type: string) => {
  switch (type) {
    case 'process': return '进程探针'
    case 'port': return '端口探针'
    case 'http': return 'HTTP 探针'
    case 'log': return '日志探针'
    case 'timeout': return '超时'
    default: return type
  }
}

const probeStatusColor = (status: string) => {
  switch (status) {
    case 'success':
    case 'alive':
    case 'open': return 'green'
    case 'failed':
    case 'dead':
    case 'closed': return 'red'
    case 'warning': return 'gold'
    case 'checking': return 'processing'
    default: return 'default'
  }
}

const formatDuration = (durationMs?: number) => {
  if (!durationMs) {
    return ''
  }
  return durationMs >= 1000 ? `${(durationMs / 1000).toFixed(1)}s` : `${durationMs}ms`
}

const stageMetaText = (stage: DeploymentStage) =>
  [
    stepTypeText(stage.type),
    stage.durationMs ? `耗时 ${formatDuration(stage.durationMs)}` : '',
    stage.retryCount ? `重试 ${stage.currentRetry ?? 0}/${stage.retryCount}` : '',
  ].filter(Boolean).join(' · ')

const classifyServiceOpsLine = (line: string) => {
  const lower = line.toLowerCase()
  if (lower.includes('失败') || lower.includes('error') || lower.includes('failed') || lower.includes('permission denied')) return 'error'
  if (lower.includes('sudo') || lower.includes('等待') || lower.includes('warn')) return 'warn'
  if (lower.includes('完成') || lower.includes('通过') || lower.includes('success')) return 'success'
  return ''
}

export function InspectorDrawer() {
  const inspectorOpen = useNavigationStore((state) => state.inspectorOpen)
  const inspectorTab = useNavigationStore((state) => state.inspectorTab)
  const inspectorLogSource = useNavigationStore((state) => state.inspectorLogSource)
  const setInspectorOpen = useNavigationStore((state) => state.setInspectorOpen)
  const setInspectorTab = useNavigationStore((state) => state.setInspectorTab)
  const setInspectorLogSource = useNavigationStore((state) => state.setInspectorLogSource)
  const buildStatus = useAppStore((state) => state.buildStatus)
  const diagnosis = useAppStore((state) => state.diagnosis)
  const logs = useAppStore((state) => state.logs)
  const artifacts = useAppStore((state) => state.artifacts)
  const selectedModules = useAppStore((state) => state.selectedModules)
  const currentDeploymentTask = useWorkflowStore((state) => state.currentDeploymentTask)
  const serverProfiles = useWorkflowStore((state) => state.serverProfiles)
  const deploymentProfiles = useWorkflowStore((state) => state.deploymentProfiles)
  const currentServiceTaskId = useServiceOperationStore((state) => state.currentTaskId)
  const serviceTasksById = useServiceOperationStore((state) => state.tasksById)
  const serviceLogsByTaskId = useServiceOperationStore((state) => state.logsByTaskId)
  const [expanded, setExpanded] = useState(false)
  const [inspectorWidth, setInspectorWidth] = useState(520)
  const [resizing, setResizing] = useState(false)

  useEffect(() => {
    if (!resizing) {
      return undefined
    }
    const onMouseMove = (event: MouseEvent) => {
      const nextWidth = Math.min(840, Math.max(420, window.innerWidth - event.clientX))
      setInspectorWidth(nextWidth)
    }
    const onMouseUp = () => setResizing(false)
    document.body.classList.add('inspector-resizing')
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      document.body.classList.remove('inspector-resizing')
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [resizing])

  useEffect(() => {
    if (buildStatus === 'RUNNING') {
      setInspectorOpen(true)
      setInspectorTab('logs')
      setInspectorLogSource('build')
    }
    if (buildStatus === 'FAILED') {
      setInspectorOpen(true)
      setInspectorTab('diagnosis')
      setInspectorLogSource('build')
    }
    if (deploymentRunning(currentDeploymentTask?.status)) {
      setInspectorOpen(true)
      setInspectorTab('logs')
      setInspectorLogSource('deployment')
    }
  }, [buildStatus, currentDeploymentTask?.status, setInspectorOpen, setInspectorTab, setInspectorLogSource])

  const currentServiceTask = currentServiceTaskId ? serviceTasksById[currentServiceTaskId] : undefined
  const currentServiceLogs = useMemo(
    () => currentServiceTaskId ? (serviceLogsByTaskId[currentServiceTaskId] ?? currentServiceTask?.outputLines ?? []) : [],
    [currentServiceTask?.outputLines, currentServiceTaskId, serviceLogsByTaskId],
  )

  const logContent = useMemo(() => {
    if (inspectorLogSource === 'remoteLog') {
      return <RemoteLogViewer />
    }
    if (inspectorLogSource === 'serviceOps') {
      return (
        <Card title="服务操作日志" className="panel-card log-panel-card" size="small">
          <Space direction="vertical" size={10} style={{width: '100%'}}>
            {currentServiceTask ? (
              <Space size={8} wrap>
                <Tag color={currentServiceTask.status === 'success' ? 'green' : currentServiceTask.status === 'failed' ? 'red' : 'processing'}>
                  {currentServiceTask.type === 'restart' ? '重启' : '健康检查'} · {currentServiceTask.status}
                </Tag>
                <Text type="secondary">{currentServiceTask.command ?? '服务操作执行中'}</Text>
              </Space>
            ) : null}
            <LogConsole
              className="log-panel service-operation-log-panel"
              lines={currentServiceLogs}
              classifyLine={classifyServiceOpsLine}
              emptyTitle="暂无服务操作日志"
              keyPrefix="service-operation-log"
            />
          </Space>
        </Card>
      )
    }
    return <BuildLogPanel />
  }, [currentServiceLogs, currentServiceTask, inspectorLogSource])

  const diagnosisText = useMemo(() => {
    if (!diagnosis) {
      return ''
    }
    return [
      `错误类型：${diagnosisCategoryText[diagnosis.category]}`,
      `摘要：${diagnosis.summary}`,
      '',
      '可能原因：',
      ...diagnosis.possibleCauses.map((item) => `- ${item}`),
      '',
      '建议动作：',
      ...diagnosis.suggestedActions.map((item) => `- ${item}`),
      '',
      '关键日志：',
      ...diagnosis.keywordLines.map((line) => `> ${line}`),
    ].join('\n')
  }, [diagnosis])

  // ---- Dynamic diagnosis content based on log source ----
  const diagnosisContent = useMemo(() => {
    if (inspectorLogSource === 'build') {
      return (
        <Card
          title="构建诊断"
          className="panel-card"
          size="small"
          extra={(
            <Button
              size="small"
              icon={<CopyOutlined />}
              disabled={!diagnosis}
              onClick={() => void navigator.clipboard?.writeText(diagnosisText)}
            >
              复制
            </Button>
          )}
        >
          {diagnosis ? (
            <Space direction="vertical" size={10} style={{width: '100%'}}>
              <Space size={8} wrap>
                <Tag color="error">{diagnosisCategoryText[diagnosis.category]}</Tag>
                <Text strong>{diagnosis.summary}</Text>
              </Space>
              <Text strong>建议动作</Text>
              <List
                size="small"
                dataSource={diagnosis.suggestedActions}
                renderItem={(item) => <List.Item>{item}</List.Item>}
              />
            </Space>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="构建失败后自动生成诊断" />
          )}
        </Card>
      )
    }

    if (inspectorLogSource === 'serviceOps' || inspectorLogSource === 'remoteLog') {
      return (
        <Card title="服务运维诊断" className="panel-card" size="small">
          {currentServiceTask?.errorMessage ? (
            <Space direction="vertical" size={8}>
              <Tag color="error">操作失败</Tag>
              <Text>{currentServiceTask.errorMessage}</Text>
            </Space>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="服务操作失败后在这里显示诊断信息" />
          )}
        </Card>
      )
    }

    const task = currentDeploymentTask
    const currentStage = task?.stages.find((s) => ['running', 'checking', 'waiting'].includes(s.status)) ?? task?.stages.find((s) => ['failed', 'timeout'].includes(s.status))
    const server = serverProfiles.find((s) => s.id === task?.serverId)
    const profile = deploymentProfiles.find((p) => p.id === task?.deploymentProfileId)
    return (
      <Card title="部署诊断" className="panel-card" size="small">
        {!task ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无运行中的部署任务" />
        ) : (
          <Space direction="vertical" size={10} style={{width: '100%'}}>
            <Space size={8} wrap>
              <Tag color={task.status === 'success' ? 'success' : task.status === 'pending' ? 'processing' : task.status === 'cancelled' ? 'warning' : 'error'}>
                {deploymentStatusText(task.status)}
              </Tag>
              <Text strong>{task.artifactName}</Text>
            </Space>
            <Text type="secondary">目标服务器：{server?.name ?? task.serverId} ({server?.host ?? '-'})</Text>
            <Text type="secondary">部署配置：{profile?.name ?? task.deploymentProfileId}</Text>
            {currentStage && (
              <>
                <Text strong type={currentStage.status === 'failed' ? 'danger' : undefined}>
                  当前阶段：{currentStage.label} · {stageStatusText(currentStage.status)}
                </Text>
                {task.log && task.log.length > 0 && (
                  <div className="diagnosis-keyword-lines">
                    {task.log.slice(-6).map((line, index) => (
                      <pre key={`${task.id}-${index}`}>{line}</pre>
                    ))}
                  </div>
                )}
              </>
            )}
          </Space>
        )}
      </Card>
    )
  }, [inspectorLogSource, diagnosis, diagnosisText, currentDeploymentTask, serverProfiles, deploymentProfiles, currentServiceTask])

  // ---- Dynamic details content based on log source ----
  const detailsContent = useMemo(() => {
    if (inspectorLogSource === 'build') {
      return (
        <Card title="构建上下文" className="panel-card" size="small">
          <Space direction="vertical" size={8} style={{width: '100%'}}>
            <Text type="secondary">构建状态：{buildStatus}</Text>
            <Text type="secondary">日志行数：{logs.length}</Text>
            <Text type="secondary">选中模块：{selectedModules.length || '全部项目'}</Text>
            <Text type="secondary">当前产物：{artifacts.length}</Text>
          </Space>
        </Card>
      )
    }

    if (inspectorLogSource === 'serviceOps' || inspectorLogSource === 'remoteLog') {
      return (
        <Card title="服务运维上下文" className="panel-card" size="small">
          {currentServiceTask ? (
            <Space direction="vertical" size={8} style={{width: '100%'}}>
              <Text type="secondary">任务：{currentServiceTask.id}</Text>
              <Text type="secondary">类型：{currentServiceTask.type}</Text>
              <Text type="secondary">状态：{currentServiceTask.status}</Text>
              <Text type="secondary">开始：{currentServiceTask.startedAt ? new Date(currentServiceTask.startedAt).toLocaleString() : '-'}</Text>
              <Text type="secondary">结束：{currentServiceTask.finishedAt ? new Date(currentServiceTask.finishedAt).toLocaleString() : '-'}</Text>
            </Space>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无服务操作上下文" />
          )}
        </Card>
      )
    }

    const task = currentDeploymentTask
    const server = serverProfiles.find((s) => s.id === task?.serverId)
    const profile = deploymentProfiles.find((p) => p.id === task?.deploymentProfileId)
    return (
      <Card title="部署上下文" className="panel-card" size="small">
        {!task ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无部署任务记录" />
        ) : (
          <Space direction="vertical" size={8} style={{width: '100%'}}>
            <Text type="secondary">部署产物：{task.artifactName}</Text>
            <Text type="secondary">目标服务器：{server?.name ?? task.serverId} ({server?.host ?? '-'})</Text>
            <Text type="secondary">部署配置：{profile?.name ?? task.deploymentProfileId}</Text>
            <Text type="secondary">状态：{deploymentStatusText(task.status)}</Text>
            <div className="inspector-deploy-flow">
              <Text strong>部署流程</Text>
              <List
                size="small"
                dataSource={task.stages}
                locale={{emptyText: '暂无部署步骤'}}
                renderItem={(stage, index) => (
                  <List.Item className="inspector-deploy-step">
                    <div className="inspector-deploy-step-index">{index + 1}</div>
                    <div className="inspector-deploy-step-body">
                      <Space size={6} wrap className="inspector-deploy-step-title">
                        <Text strong>{stage.label}</Text>
                        <Tag color={stageStatusColor(stage.status)}>{stageStatusText(stage.status)}</Tag>
                      </Space>
                      <Text type="secondary" className="inspector-deploy-step-meta">
                        {stageMetaText(stage) || stepTypeText(stage.type)}
                      </Text>
                      {stage.message ? (
                        <Text className="inspector-deploy-step-message">
                          {stage.message}
                        </Text>
                      ) : null}
                      {stage.probeStatuses && stage.probeStatuses.length > 0 ? (
                        <div className="inspector-probe-list">
                          {stage.probeStatuses.map((probe, probeIndex) => (
                            <div className="inspector-probe-row" key={`${stage.key}-${probeIndex}`}>
                              <Tag color={probeStatusColor(probe.status)}>{probe.status}</Tag>
                              <Text className="inspector-probe-text">
                                {probeTypeText(probe.probeType)}：{probe.message ?? probe.status}
                                {probe.checkCount ? `（已检测 ${probe.checkCount} 次）` : ''}
                              </Text>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </List.Item>
                )}
              />
            </div>
          </Space>
        )}
      </Card>
    )
  }, [inspectorLogSource, buildStatus, logs.length, selectedModules.length, artifacts.length, currentDeploymentTask, serverProfiles, deploymentProfiles, currentServiceTask])

  if (!inspectorOpen) {
    return (
      <aside className="inspector-collapsed">
        <Button
          type="text"
          icon={<MenuUnfoldOutlined />}
          aria-label="展开详情面板"
          onClick={() => setInspectorOpen(true)}
        />
      </aside>
    )
  }

  return (
    <aside className="inspector-drawer" style={{width: inspectorWidth}}>
      <div
        className="inspector-resize-handle"
        role="separator"
        aria-label="拖动调整右侧面板宽度"
        onMouseDown={() => setResizing(true)}
      />
      <div className="inspector-header">
        <Text strong>检查器</Text>
        <Space size={4}>
          <Button
            size="small"
            type="text"
            icon={<FullscreenOutlined />}
            aria-label="全屏查看"
            onClick={() => setExpanded(true)}
          />
          <Button
            size="small"
            type="text"
            icon={<MenuFoldOutlined />}
            aria-label="收起详情面板"
            onClick={() => setInspectorOpen(false)}
          />
        </Space>
      </div>
      <Tabs
        className="inspector-tabs"
        activeKey={inspectorTab}
        onChange={(key) => setInspectorTab(key as InspectorTab)}
        items={[
          {
            key: 'logs',
            label: '日志',
            children: logContent,
          },
          {
            key: 'diagnosis',
            label: inspectorLogSource === 'build' ? '构建诊断' : inspectorLogSource === 'deployment' ? '部署诊断' : '服务诊断',
            children: diagnosisContent,
          },
          {
            key: 'details',
            label: inspectorLogSource === 'build' ? '构建详情' : inspectorLogSource === 'deployment' ? '部署详情' : '服务详情',
            children: detailsContent,
          },
        ]}
      />
      <Modal
        title="检查器"
        open={expanded}
        footer={null}
        width="90vw"
        onCancel={() => setExpanded(false)}
      >
        {logContent}
      </Modal>
    </aside>
  )
}
