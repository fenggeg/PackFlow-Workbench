import {
    CopyOutlined,
    DeleteOutlined,
    DownloadOutlined,
    FullscreenOutlined,
    PauseCircleOutlined,
    PlayCircleOutlined
} from '@ant-design/icons'
import {Button, Card, Input, List, Modal, Select, Space, Tag, Tooltip, Typography} from 'antd'
import {useEffect, useMemo, useRef, useState} from 'react'
import {LogConsole} from '../common/LogConsole'
import {useAppStore} from '../../store/useAppStore'
import {useNavigationStore} from '../../store/navigationStore'
import type {BuildStatus} from '../../types/domain'
import {classifyBuildLogEvent, classifyLogLine, diagnosisCategoryText} from '../../utils/format'

const { Text } = Typography

type LogFilter = 'all' | 'error' | 'warn' | 'success'

const statusText: Record<BuildStatus, string> = {
  IDLE: '未开始',
  RUNNING: '构建中',
  SUCCESS: '构建成功',
  FAILED: '构建失败',
  CANCELLED: '已停止',
}

const statusColor: Record<BuildStatus, string> = {
  IDLE: 'default',
  RUNNING: 'processing',
  SUCCESS: 'success',
  FAILED: 'error',
  CANCELLED: 'warning',
}

export function BuildLogPanel() {
  // Build logs
  const logs = useAppStore((state) => state.logs)
  const diagnosis = useAppStore((state) => state.diagnosis)
  const buildStatus = useAppStore((state) => state.buildStatus)
  const buildCancelling = useAppStore((state) => state.buildCancelling)
  const buildStartedAt = useAppStore((state) => state.startedAt)
  const cancelBuild = useAppStore((state) => state.cancelBuild)
  const clearBuildLogs = useAppStore((state) => state.clearBuildLogs)

  const panelRef = useRef<HTMLDivElement>(null)
  const modalPanelRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [logFilter, setLogFilter] = useState<LogFilter>('all')
  const [autoScroll, setAutoScroll] = useState(true)
  const activeSource = useNavigationStore((state) => state.inspectorLogSource)
  const setActiveSource = useNavigationStore((state) => state.setInspectorLogSource)

  const lastLaunchRef = useRef<{
    buildStartedAt?: number
  }>({})

  useEffect(() => {
    const previous = lastLaunchRef.current

    if (buildStartedAt && buildStatus === 'RUNNING' && buildStartedAt !== previous.buildStartedAt) {
      setActiveSource('build')
    }

    lastLaunchRef.current = {
      buildStartedAt,
    }
  }, [
    buildStartedAt,
    buildStatus,
    setActiveSource,
  ])

  const currentLogCount = logs.length

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && panelRef.current) {
      panelRef.current.scrollTop = panelRef.current.scrollHeight
    }
    if (autoScroll && modalPanelRef.current) {
      modalPanelRef.current.scrollTop = modalPanelRef.current.scrollHeight
    }
  }, [autoScroll, currentLogCount])

  // Scroll to bottom when modal opens
  useEffect(() => {
    if (expanded && autoScroll) {
      requestAnimationFrame(() => {
        if (modalPanelRef.current) {
          modalPanelRef.current.scrollTop = modalPanelRef.current.scrollHeight
        }
      })
    }
  }, [expanded, autoScroll])

  // Filter by keyword
  const keywordValue = keyword.trim().toLowerCase()
  const visibleBuildLogs = useMemo(() => logs.filter((event) => {
    if (logFilter !== 'all' && classifyBuildLogEvent(event) !== logFilter) return false
    if (keywordValue && !event.line.toLowerCase().includes(keywordValue)) return false
    return true
  }), [keywordValue, logFilter, logs])

  const visibleBuildLogLines = useMemo(
    () => visibleBuildLogs.map((event) => event.line),
    [visibleBuildLogs],
  )

  const copyLogs = async () => {
    const text = logs.map((event) => event.line).join('\n')
    try {
      await navigator.clipboard?.writeText(text)
    } catch {
      // Clipboard API unavailable or denied
    }
  }

  const downloadLogs = () => {
    const text = logs.map((event) => event.line).join('\n')
    if (!text) return
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'build-log.txt'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 100)
  }

  const clearLogs = () => {
    clearBuildLogs()
  }

  // Build status tag for header
  const renderStatusTag = () => {
    return <Tag color={statusColor[buildStatus]}>{statusText[buildStatus]}</Tag>
  }

  const copyDiagnosis = () => {
    if (!diagnosis) {
      return
    }
    const content = [
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
      ...diagnosis.keywordLines.map((item) => `> ${item}`),
    ].join('\n')
    void navigator.clipboard?.writeText(content)
  }

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Card
        title="日志输出"
        className="panel-card log-panel-card"
        size="small"
        extra={
          <Space wrap size={4} className="log-card-extra">
            {renderStatusTag()}
            {activeSource === 'build' && (
              <Tooltip title="停止构建">
                <Button
                  size="small"
                  danger
                  type="text"
                  disabled={buildStatus !== 'RUNNING' || buildCancelling}
                  icon={<PauseCircleOutlined />}
                  onClick={() => void cancelBuild()}
                />
              </Tooltip>
            )}
            {activeSource === 'build' && (
              <Tooltip title="清空日志">
                <Button size="small" type="text" icon={<DeleteOutlined />} onClick={clearLogs} />
              </Tooltip>
            )}
            <Tooltip title="复制日志">
              <Button
                size="small"
                type="text"
                disabled={currentLogCount === 0}
                icon={<CopyOutlined />}
                onClick={copyLogs}
              />
            </Tooltip>
            <Tooltip title="下载日志">
              <Button
                size="small"
                type="text"
                disabled={currentLogCount === 0}
                icon={<DownloadOutlined />}
                onClick={downloadLogs}
              />
            </Tooltip>
            <Tooltip title={autoScroll ? '关闭自动滚动' : '开启自动滚动'}>
              <Button
                size="small"
                type={autoScroll ? 'primary' : 'text'}
                icon={<PlayCircleOutlined />}
                onClick={() => setAutoScroll((value) => !value)}
              />
            </Tooltip>
            <Tooltip title="放大查看">
              <Button
                aria-label="放大查看日志"
                icon={<FullscreenOutlined />}
                size="small"
                type="text"
                onClick={() => setExpanded(true)}
              />
            </Tooltip>
          </Space>
        }
      >
        <Space size={4}>
          <Select
            size="small"
            value={logFilter}
            onChange={setLogFilter}
            style={{ width: 100 }}
            options={[
              { value: 'all', label: '全部' },
              { value: 'error', label: '错误' },
              { value: 'warn', label: '告警' },
              { value: 'success', label: '成功' },
            ]}
          />
          <Input
            allowClear
            size="small"
            className="log-search"
            placeholder="搜索日志关键词"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </Space>
        <LogConsole
          ref={panelRef}
          lines={visibleBuildLogLines}
          classifyLine={classifyLogLine}
          emptyTitle="准备开始构建"
          emptyDescription="请选择模块并点击开始打包。"
          keyPrefix="build-log"
        />
        <Modal
          title="日志输出 · 构建"
          open={expanded}
          footer={null}
          width="88vw"
          onCancel={() => setExpanded(false)}
        >
          <LogConsole
            ref={modalPanelRef}
            className="log-panel log-panel-large"
            lines={visibleBuildLogLines}
            classifyLine={classifyLogLine}
            emptyTitle="准备开始构建"
            emptyDescription="请选择模块并点击开始打包。"
            keyPrefix="build-log-modal"
          />
        </Modal>
      </Card>

      {activeSource === 'build' && diagnosis && (
        <Card
          title="诊断面板"
          className="panel-card diagnosis-card"
          size="small"
          extra={
            <Tooltip title="复制诊断结果">
              <Button
                size="small"
                type="text"
                icon={<CopyOutlined />}
                onClick={copyDiagnosis}
              />
            </Tooltip>
          }
        >
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            <Space size={8} wrap>
              <Tag color="error">{diagnosisCategoryText[diagnosis.category]}</Tag>
              <Text strong>{diagnosis.summary}</Text>
            </Space>
            <div className="diagnosis-grid">
              <div>
                <Text strong>可能原因</Text>
                <List
                  size="small"
                  dataSource={diagnosis.possibleCauses}
                  renderItem={(item) => <List.Item>{item}</List.Item>}
                />
              </div>
              <div>
                <Text strong>建议动作</Text>
                <List
                  size="small"
                  dataSource={diagnosis.suggestedActions}
                  renderItem={(item) => <List.Item>{item}</List.Item>}
                />
              </div>
            </div>
            <div>
              <Text strong>高价值关键字行</Text>
              <div className="diagnosis-keyword-lines">
                {diagnosis.keywordLines.slice(0, 6).map((line, index) => (
                  <pre key={`${diagnosis.id}-${index}`}>{line}</pre>
                ))}
              </div>
            </div>
          </Space>
        </Card>
      )}
    </Space>
  )
}
