import {
    Button,
    Card,
    Empty,
    Input,
    InputNumber,
    message,
    Modal,
    Popconfirm,
    Select,
    Space,
    Switch,
    Tag,
    Typography
} from 'antd'
import {
    ClearOutlined,
    DeleteOutlined,
    DownloadOutlined,
    EditOutlined,
    FileOutlined,
    PauseOutlined,
    PlayCircleOutlined,
    PlusOutlined,
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

const createEmptyLogSource = (serverId: string): LogSource => ({
  id: '',
  serverId,
  name: '',
  path: '',
  encoding: 'UTF-8',
  defaultTailLines: 500,
  enabled: true,
})

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
  const [sourceModalOpen, setSourceModalOpen] = useState(false)
  const [sourceSaving, setSourceSaving] = useState(false)
  const [sourceDraft, setSourceDraft] = useState<LogSource>(() => createEmptyLogSource(server.id))
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

  const selectedSource = logSources.find((source) => source.path === selectedPath)

  const openCreateSource = () => {
    setSourceDraft(createEmptyLogSource(server.id))
    setSourceModalOpen(true)
  }

  const openEditSource = () => {
    if (!selectedSource) {
      message.warning('请选择要编辑的日志源')
      return
    }
    setSourceDraft(selectedSource)
    setSourceModalOpen(true)
  }

  const handleSaveSource = async () => {
    const name = sourceDraft.name.trim()
    const path = sourceDraft.path.trim()
    if (!name || !path) {
      message.warning('请填写日志源名称和路径')
      return
    }
    setSourceSaving(true)
    try {
      const saved = await api.saveLogSource({
        ...sourceDraft,
        serverId: server.id,
        name,
        path,
        defaultTailLines: sourceDraft.defaultTailLines || 500,
      })
      message.success(sourceDraft.id ? '日志源已更新' : '日志源已新增')
      setSelectedPath(saved.path)
      setTailLines(saved.defaultTailLines)
      setSourceModalOpen(false)
      await loadLogSources()
    } catch (error) {
      message.error(`保存日志源失败：${error}`)
    } finally {
      setSourceSaving(false)
    }
  }

  const handleDeleteSource = async () => {
    if (!selectedSource) {
      message.warning('请选择要删除的日志源')
      return
    }
    try {
      await api.deleteLogSource(selectedSource.id)
      message.success('日志源已删除')
      if (selectedPath === selectedSource.path) {
        setSelectedPath(undefined)
      }
      await loadLogSources()
    } catch (error) {
      message.error(`删除日志源失败：${error}`)
    }
  }

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
            onChange={(value) => {
              setSelectedPath(value)
              const source = logSources.find((item) => item.path === value)
              if (source) {
                setTailLines(source.defaultTailLines)
              }
            }}
            options={logSources.map((ls) => ({
              label: `${ls.name} (${ls.path})`,
              value: ls.path,
              disabled: !ls.enabled,
            }))}
            showSearch
          />
          <Button icon={<PlusOutlined />} onClick={openCreateSource}>
            新增日志源
          </Button>
          <Button icon={<EditOutlined />} disabled={!selectedSource} onClick={openEditSource}>
            编辑
          </Button>
          <Popconfirm
            title="确定删除该日志源？"
            onConfirm={() => void handleDeleteSource()}
            disabled={!selectedSource}
          >
            <Button danger icon={<DeleteOutlined />} disabled={!selectedSource}>
              删除
            </Button>
          </Popconfirm>
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
      <Modal
        title={sourceDraft.id ? '编辑日志源' : '新增日志源'}
        open={sourceModalOpen}
        okText="保存"
        cancelText="取消"
        confirmLoading={sourceSaving}
        onOk={() => void handleSaveSource()}
        onCancel={() => setSourceModalOpen(false)}
      >
        <Space direction="vertical" size={12} style={{width: '100%'}}>
          <Input
            addonBefore="名称"
            placeholder="例如 应用主日志"
            value={sourceDraft.name}
            onChange={(event) => setSourceDraft({...sourceDraft, name: event.target.value})}
          />
          <Input
            addonBefore="路径"
            placeholder="例如 /home/my-project-test/logs/app.log"
            value={sourceDraft.path}
            onChange={(event) => setSourceDraft({...sourceDraft, path: event.target.value})}
          />
          <Space wrap>
            <Select
              value={sourceDraft.encoding}
              style={{width: 140}}
              options={[
                {label: 'UTF-8', value: 'UTF-8'},
                {label: 'GBK', value: 'GBK'},
                {label: '自动', value: 'auto'},
              ]}
              onChange={(encoding) => setSourceDraft({...sourceDraft, encoding})}
            />
            <InputNumber
              min={50}
              max={5000}
              addonBefore="默认行数"
              value={sourceDraft.defaultTailLines}
              onChange={(value) => setSourceDraft({...sourceDraft, defaultTailLines: Number(value) || 500})}
            />
            <Space>
              <Switch
                checked={sourceDraft.enabled}
                onChange={(enabled) => setSourceDraft({...sourceDraft, enabled})}
              />
              <Text>启用</Text>
            </Space>
          </Space>
          <Input.TextArea
            rows={3}
            placeholder="备注"
            value={sourceDraft.remark}
            onChange={(event) => setSourceDraft({...sourceDraft, remark: event.target.value || undefined})}
          />
        </Space>
      </Modal>
    </Card>
  )
}
