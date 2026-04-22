import {Button, Card, Input, Modal, Space, Tag, Typography} from 'antd'
import {useEffect, useRef, useState} from 'react'
import {useAppStore} from '../../store/useAppStore'
import type {BuildLogEvent, BuildStatus} from '../../types/domain'

const { Text } = Typography

const statusText: Record<BuildStatus, string> = {
  IDLE: '未开始',
  RUNNING: 'BUILDING',
  SUCCESS: 'BUILD SUCCESS',
  FAILED: 'BUILD FAILED',
  CANCELLED: '已停止',
}

const statusColor: Record<BuildStatus, string> = {
  IDLE: 'default',
  RUNNING: 'processing',
  SUCCESS: 'success',
  FAILED: 'error',
  CANCELLED: 'warning',
}

const classifyLog = (event: BuildLogEvent) => {
  const line = event.line.toLowerCase()
  if (line.includes('build success')) {
    return 'success'
  }
  if (
    line.includes('[error]') ||
    line.includes('build failure') ||
    line.includes('could not resolve dependencies') ||
    line.includes('java_home is not defined correctly') ||
    line.includes('non-resolvable parent pom')
  ) {
    return 'error'
  }
  if (line.includes('[warning]')) {
    return 'warn'
  }
  return ''
}

export function BuildLogPanel() {
  const logs = useAppStore((state) => state.logs)
  const buildStatus = useAppStore((state) => state.buildStatus)
  const cancelBuild = useAppStore((state) => state.cancelBuild)
  const clearBuildLogs = useAppStore((state) => state.clearBuildLogs)
  const panelRef = useRef<HTMLDivElement>(null)
  const modalPanelRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    if (autoScroll && panelRef.current) {
      panelRef.current.scrollTop = panelRef.current.scrollHeight
    }
    if (autoScroll && modalPanelRef.current) {
      modalPanelRef.current.scrollTop = modalPanelRef.current.scrollHeight
    }
  }, [autoScroll, logs])

  const visibleLogs = keyword.trim()
    ? logs.filter((event) => event.line.toLowerCase().includes(keyword.trim().toLowerCase()))
    : logs

  const renderContent = () =>
    visibleLogs.length === 0 ? (
      <div className="log-empty">
        <Text>准备开始构建</Text>
        <Text type="secondary">请选择模块并点击“开始打包”。</Text>
      </div>
    ) : (
      visibleLogs.map((event, index) => (
        <pre className={`log-line ${classifyLog(event)}`} key={`${event.buildId}-${index}`}>
          {event.line}
        </pre>
      ))
    )

  return (
    <Card
      title="实时日志"
      className="panel-card"
      size="small"
      extra={
        <Space wrap>
          <Tag color={statusColor[buildStatus]}>{statusText[buildStatus]}</Tag>
          <Button size="small" disabled={buildStatus !== 'RUNNING'} onClick={() => void cancelBuild()}>
            停止
          </Button>
          <Button size="small" onClick={clearBuildLogs}>
            清空
          </Button>
          <Button
            size="small"
            disabled={logs.length === 0}
            onClick={() => void navigator.clipboard?.writeText(logs.map((event) => event.line).join('\n'))}
          >
            复制
          </Button>
          <Button size="small" type={autoScroll ? 'primary' : 'default'} onClick={() => setAutoScroll((value) => !value)}>
            自动滚动
          </Button>
          <Button size="small" onClick={() => setExpanded(true)}>放大</Button>
        </Space>
      }
    >
      <Input
        allowClear
        size="small"
        className="log-search"
        placeholder="搜索日志关键词"
        value={keyword}
        onChange={(event) => setKeyword(event.target.value)}
      />
      <div className="log-panel" ref={panelRef}>
        {renderContent()}
      </div>
      <Modal
        title="实时日志"
        open={expanded}
        footer={null}
        width="88vw"
        onCancel={() => setExpanded(false)}
      >
        <div className="log-panel log-panel-large" ref={modalPanelRef}>
          {renderContent()}
        </div>
      </Modal>
    </Card>
  )
}
