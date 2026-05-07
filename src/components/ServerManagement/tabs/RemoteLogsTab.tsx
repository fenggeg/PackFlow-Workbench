import {Button, Card, Empty, Input, message, Select, Space, Tag, Typography} from 'antd'
import {
  ClearOutlined,
  DownloadOutlined,
  FileOutlined,
  PauseOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import {useCallback, useEffect, useRef, useState} from 'react'
import {api} from '../../../services/tauri-api'
import type {LogSource, ServerProfile} from '../../../types/domain'

const {Text} = Typography

interface RemoteLogsTabProps {
  server: ServerProfile
}

const defaultHighlightRules = [
  {pattern: 'ERROR', color: '#f44747'},
  {pattern: 'Exception', color: '#f44747'},
  {pattern: 'WARN', color: '#ffa500'},
  {pattern: 'INFO', color: '#4ec9b0'},
  {pattern: 'DEBUG', color: '#6a9955'},
  {pattern: 'Caused by', color: '#c586c0'},
  {pattern: 'Timeout', color: '#f44747'},
  {pattern: 'Connection refused', color: '#f44747'},
  {pattern: 'OutOfMemoryError', color: '#f44747'},
  {pattern: 'NullPointerException', color: '#f44747'},
  {pattern: 'failed', color: '#f44747'},
  {pattern: 'success', color: '#4ec9b0'},
]

const getHighlightColor = (line: string): string | undefined => {
  for (const rule of defaultHighlightRules) {
    if (line.includes(rule.pattern)) {
      return rule.color
    }
  }
  return undefined
}

export function RemoteLogsTab({server}: RemoteLogsTabProps) {
  const [logSources, setLogSources] = useState<LogSource[]>([])
  const [selectedPath, setSelectedPath] = useState<string>()
  const [logLines, setLogLines] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [tailing, setTailing] = useState(false)
  const [paused, setPaused] = useState(false)
  const [tailLines, setTailLines] = useState(500)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [filterLevel, setFilterLevel] = useState<string>()
  const outputRef = useRef<HTMLDivElement>(null)
  const tailIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pausedRef = useRef(false)

  const loadLogSources = useCallback(async () => {
    try {
      const data = await api.listLogSources(server.id)
      setLogSources(data)
    } catch (error) {
      console.error('加载日志源失败：', error)
    }
  }, [server.id])

  useEffect(() => {
    queueMicrotask(() => void loadLogSources())
  }, [loadLogSources])

  const scrollToBottom = useCallback(() => {
    if (outputRef.current && !paused) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [paused])

  const handleLoadLog = async () => {
    if (!selectedPath) {
      message.warning('请选择或输入日志路径')
      return
    }

    setLoading(true)
    setLogLines([])
    try {
      const lines = await api.readRemoteLogLines(server.id, selectedPath, tailLines)
      setLogLines(lines)
      setTimeout(scrollToBottom, 100)
    } catch (error) {
      message.error(`加载日志失败：${error}`)
    } finally {
      setLoading(false)
    }
  }

  const handleStartTail = () => {
    if (!selectedPath) {
      message.warning('请选择或输入日志路径')
      return
    }

    if (tailIntervalRef.current) {
      clearInterval(tailIntervalRef.current)
      tailIntervalRef.current = null
    }

    setTailing(true)
    setPaused(false)
    pausedRef.current = false

    tailIntervalRef.current = setInterval(async () => {
      if (pausedRef.current) return
      try {
        const lines = await api.readRemoteLogLines(server.id, selectedPath!, tailLines)
        setLogLines(lines)
        setTimeout(scrollToBottom, 100)
      } catch (error) {
        console.error('Tail 日志失败：', error)
      }
    }, 3000)
  }

  const handleStopTail = () => {
    setTailing(false)
    setPaused(false)
    pausedRef.current = false
    if (tailIntervalRef.current) {
      clearInterval(tailIntervalRef.current)
      tailIntervalRef.current = null
    }
  }

  const handleTogglePause = () => {
    const nextPaused = !pausedRef.current
    pausedRef.current = nextPaused
    setPaused(nextPaused)
  }

  const handleClear = () => {
    setLogLines([])
  }

  const handleDownload = () => {
    const content = logLines.join('\n')
    const blob = new Blob([content], {type: 'text/plain'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${server.name}-${selectedPath?.split('/').pop() ?? 'log'}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    return () => {
      if (tailIntervalRef.current) {
        clearInterval(tailIntervalRef.current)
      }
    }
  }, [])

  const filteredLines = logLines.filter((line) => {
    if (searchKeyword && !line.toLowerCase().includes(searchKeyword.toLowerCase())) {
      return false
    }
    if (filterLevel) {
      if (filterLevel === 'ERROR' && !line.includes('ERROR') && !line.includes('Exception'))
        return false
      if (filterLevel === 'WARN' && !line.includes('WARN') && !line.includes('ERROR'))
        return false
    }
    return true
  })

  return (
    <Card
      title={
        <Space>
          <FileOutlined />
          <span>远程日志</span>
          {tailing && (
            <Tag color={paused ? 'warning' : 'processing'}>
              {paused ? '已暂停' : '实时监听中'}
            </Tag>
          )}
        </Space>
      }
      size="small"
      extra={
        <Space>
          {!tailing ? (
            <Button
              size="small"
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleStartTail}
              disabled={!selectedPath}
            >
              实时 Tail
            </Button>
          ) : (
            <>
              <Button
                size="small"
                icon={paused ? <PlayCircleOutlined /> : <PauseOutlined />}
                onClick={handleTogglePause}
              >
                {paused ? '继续' : '暂停'}
              </Button>
              <Button size="small" danger onClick={handleStopTail}>
                停止
              </Button>
            </>
          )}
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={() => void handleLoadLog()}
            loading={loading}
          >
            读取
          </Button>
          <Button size="small" icon={<ClearOutlined />} onClick={handleClear}>
            清空
          </Button>
          <Button
            size="small"
            icon={<DownloadOutlined />}
            onClick={handleDownload}
            disabled={logLines.length === 0}
          >
            下载
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" size={8} style={{width: '100%'}}>
        <Space wrap>
          <Select
            placeholder="选择日志源"
            style={{width: 200}}
            value={selectedPath}
            onChange={setSelectedPath}
            options={logSources.map((ls) => ({
              label: `${ls.name} (${ls.path})`,
              value: ls.path,
            }))}
            showSearch
          />
          <Input
            placeholder="或输入日志路径"
            style={{width: 300}}
            value={selectedPath}
            onChange={(e) => setSelectedPath(e.target.value)}
          />
          <Select
            value={tailLines}
            onChange={setTailLines}
            options={[
              {label: '100 行', value: 100},
              {label: '500 行', value: 500},
              {label: '1000 行', value: 1000},
              {label: '5000 行', value: 5000},
            ]}
            style={{width: 100}}
          />
        </Space>

        <Space wrap>
          <Input
            placeholder="搜索关键字"
            prefix={<SearchOutlined />}
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            style={{width: 200}}
            allowClear
          />
          <Select
            placeholder="日志级别"
            value={filterLevel}
            onChange={setFilterLevel}
            allowClear
            style={{width: 120}}
            options={[
              {label: 'ERROR', value: 'ERROR'},
              {label: 'WARN', value: 'WARN'},
            ]}
          />
          <Text type="secondary">
            {filteredLines.length} / {logLines.length} 行
          </Text>
        </Space>

        <div
          ref={outputRef}
          style={{
            backgroundColor: '#1e1e1e',
            color: '#d4d4d4',
            padding: '12px',
            fontFamily: 'Consolas, Monaco, monospace',
            fontSize: '13px',
            lineHeight: '1.5',
            height: '400px',
            overflowY: 'auto',
            borderRadius: '4px',
          }}
        >
          {filteredLines.length === 0 ? (
            <Empty
              description={
                <Text style={{color: '#666'}}>
                  选择日志路径后点击"读取"或"实时 Tail"
                </Text>
              }
              style={{marginTop: '100px'}}
            />
          ) : (
            filteredLines.map((line, index) => (
              <div
                key={index}
                style={{
                  color: getHighlightColor(line) ?? '#d4d4d4',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {line}
              </div>
            ))
          )}
        </div>
      </Space>
    </Card>
  )
}
