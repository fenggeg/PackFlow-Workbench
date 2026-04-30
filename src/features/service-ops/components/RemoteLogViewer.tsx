import {
    ClearOutlined,
    CopyOutlined,
    FullscreenOutlined,
    PauseCircleOutlined,
    PlayCircleOutlined,
    StopOutlined,
} from '@ant-design/icons'
import {Button, Input, Modal, Space, Switch, Tag, Tooltip, Typography} from 'antd'
import {useEffect, useMemo, useRef, useState} from 'react'
import {LogConsole} from '../../../components/common/LogConsole'
import {useRemoteLogSessionStore} from '../stores/remoteLogSessionStore'

const {Text} = Typography

const classifyRemoteLine = (line: string) => {
  const upper = line.toUpperCase()
  if (upper.includes('ERROR') || upper.includes('EXCEPTION') || upper.includes('FAILED')) return 'error'
  if (upper.includes('WARN')) return 'warn'
  return ''
}

export function RemoteLogViewer() {
  const activeSessionId = useRemoteLogSessionStore((state) => state.activeSessionId)
  const sessionsById = useRemoteLogSessionStore((state) => state.sessionsById)
  const linesBySessionId = useRemoteLogSessionStore((state) => state.linesBySessionId)
  const autoScrollBySessionId = useRemoteLogSessionStore((state) => state.autoScrollBySessionId)
  const stopSession = useRemoteLogSessionStore((state) => state.stopSession)
  const clearSessionLines = useRemoteLogSessionStore((state) => state.clearSessionLines)
  const setAutoScroll = useRemoteLogSessionStore((state) => state.setAutoScroll)
  const [keyword, setKeyword] = useState('')
  const [errorOnly, setErrorOnly] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const session = activeSessionId ? sessionsById[activeSessionId] : undefined
  const lines = useMemo(
    () => activeSessionId ? (linesBySessionId[activeSessionId] ?? []) : [],
    [activeSessionId, linesBySessionId],
  )
  const autoScroll = activeSessionId ? (autoScrollBySessionId[activeSessionId] ?? true) : true
  const filteredLines = useMemo(() => {
    const lowerKeyword = keyword.trim().toLowerCase()
    return lines.filter((line) => {
      if (errorOnly && classifyRemoteLine(line) !== 'error') return false
      if (!lowerKeyword) return true
      return line.toLowerCase().includes(lowerKeyword)
    })
  }, [errorOnly, keyword, lines])

  useEffect(() => {
    if (!autoScroll) return
    const node = panelRef.current
    if (node) {
      node.scrollTop = node.scrollHeight
    }
  }, [autoScroll, filteredLines.length])

  if (!session || !activeSessionId) {
    return (
      <div className="service-log-empty">
        <Text type="secondary">尚未打开远程日志会话</Text>
      </div>
    )
  }

  const copyLines = () => void navigator.clipboard?.writeText(filteredLines.join('\n'))

  return (
    <Space direction="vertical" size={10} style={{width: '100%'}}>
      <Space size={8} wrap className="service-log-toolbar">
        <Tag color={session.status === 'streaming' ? 'processing' : session.status === 'failed' ? 'red' : 'default'}>
          {session.status === 'connecting' ? '连接中' : session.status === 'streaming' ? '实时 tail' : session.status === 'failed' ? '失败' : '已停止'}
        </Tag>
        <Input
          allowClear
          size="small"
          placeholder="搜索日志"
          style={{width: 180}}
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <Switch
          size="small"
          checked={autoScroll}
          checkedChildren={<PlayCircleOutlined />}
          unCheckedChildren={<PauseCircleOutlined />}
          onChange={(checked) => setAutoScroll(activeSessionId, checked)}
        />
        <Switch
          size="small"
          checked={errorOnly}
          checkedChildren="ERROR"
          unCheckedChildren="全部"
          onChange={setErrorOnly}
        />
        <Tooltip title="复制当前视图">
          <Button size="small" icon={<CopyOutlined />} disabled={filteredLines.length === 0} onClick={copyLines} />
        </Tooltip>
        <Tooltip title="清空当前视图">
          <Button size="small" icon={<ClearOutlined />} onClick={() => clearSessionLines(activeSessionId)} />
        </Tooltip>
        <Tooltip title="停止 tail">
          <Button
            size="small"
            danger
            icon={<StopOutlined />}
            disabled={session.status !== 'streaming' && session.status !== 'connecting'}
            onClick={() => void stopSession(activeSessionId)}
          />
        </Tooltip>
        <Tooltip title="全屏查看">
          <Button size="small" icon={<FullscreenOutlined />} onClick={() => setExpanded(true)} />
        </Tooltip>
      </Space>
      <LogConsole
        ref={panelRef}
        className="log-panel service-remote-log-panel"
        lines={filteredLines}
        classifyLine={classifyRemoteLine}
        emptyTitle="暂无远程日志"
        keyPrefix="remote-log"
      />
      <Modal
        title="远程服务日志"
        open={expanded}
        footer={null}
        width="92vw"
        onCancel={() => setExpanded(false)}
      >
        <LogConsole
          className="log-panel log-panel-large"
          lines={filteredLines}
          classifyLine={classifyRemoteLine}
          emptyTitle="暂无远程日志"
          keyPrefix="remote-log-full"
        />
      </Modal>
    </Space>
  )
}
