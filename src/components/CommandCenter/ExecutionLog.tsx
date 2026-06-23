import {useEffect, useRef, useState} from 'react'
import {Card, Tag, Space, Progress, Empty, Button, Tooltip, Popconfirm} from 'antd'
import {PauseCircleOutlined, PlayCircleOutlined, DisconnectOutlined} from '@ant-design/icons'
import {useCommandStore} from '../../store/useCommandStore'

export function ExecutionLog() {
  const {
    currentExecutionId,
    currentExecutionLogs,
    currentExecutionStatus,
    uploadProgress,
    cancelExecution,
  } = useCommandStore()

  const logContainerRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  // 自动滚动到底部
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [currentExecutionLogs, autoScroll])

  const statusTag = {
    idle: <Tag>空闲</Tag>,
    running: <Tag color="processing">执行中</Tag>,
    success: <Tag color="success">成功</Tag>,
    failed: <Tag color="error">失败</Tag>,
    cancelled: <Tag color="warning">已取消</Tag>,
  }

  const logCount = currentExecutionLogs.length
  const isRunning = currentExecutionStatus === 'running'

  return (
    <Card
      title={
        <Space>
          <span>执行日志</span>
          {statusTag[currentExecutionStatus]}
          {logCount > 0 && <Tag>{logCount} 行</Tag>}
        </Space>
      }
      size="small"
      className="panel-card"
      extra={
        <Space size={4}>
          {isRunning && currentExecutionId && (
            <Popconfirm
              title="确定要停止当前执行吗？"
              description="这将中断正在运行的命令"
              onConfirm={() => cancelExecution(currentExecutionId)}
              okText="停止"
              cancelText="取消"
            >
              <Tooltip title="停止执行">
                <Button
                  size="small"
                  danger
                  icon={<DisconnectOutlined />}
                >
                  停止
                </Button>
              </Tooltip>
            </Popconfirm>
          )}
          <Tooltip title={autoScroll ? '关闭自动滚动' : '开启自动滚动'}>
            <Button
              size="small"
              type={autoScroll ? 'primary' : 'text'}
              icon={autoScroll ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
              onClick={() => setAutoScroll(!autoScroll)}
            />
          </Tooltip>
        </Space>
      }
      style={{height: '100%', display: 'flex', flexDirection: 'column'}}
      styles={{body: {flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column'}}}
    >
      {uploadProgress && (
        <div style={{marginBottom: 8, fontFamily: 'Consolas, "Cascadia Mono", monospace', flexShrink: 0}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4}}>
            <span style={{fontFamily: 'inherit'}}>上传进度</span>
            <span style={{minWidth: 60, textAlign: 'right', fontVariantNumeric: 'tabular-nums'}}>
              {uploadProgress.percent != null ? Math.round(uploadProgress.percent) : 0}%
            </span>
          </div>
          <Progress
            percent={uploadProgress.percent != null ? Math.round(uploadProgress.percent) : 0}
            status={uploadProgress.percent != null && uploadProgress.percent >= 100 ? 'success' : 'active'}
            showInfo={false}
            size="small"
          />
          <div style={{display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#666', fontVariantNumeric: 'tabular-nums'}}>
            <span style={{minWidth: 160}}>{formatBytes(uploadProgress.uploaded)} / {formatBytes(uploadProgress.total)}</span>
            <span style={{minWidth: 90, textAlign: 'right'}}>{uploadProgress.speed || ''}</span>
          </div>
        </div>
      )}

      {currentExecutionLogs.length === 0 ? (
        <Empty
          description="暂无日志"
          style={{margin: 'auto'}}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        <div
          ref={logContainerRef}
          className="log-panel"
          style={{flex: 1, minHeight: 0, maxHeight: '400px'}}
        >
          {currentExecutionLogs.map((line, index) => (
            <div
              key={index}
              className={`log-line ${getLineClass(line)}`}
            >
              {line}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function getLineClass(line: string): string {
  if (line.includes('[错误]') || line.includes('[执行失败]') || line.includes('Error') || line.includes('❌')) {
    return 'error'
  }
  if (line.includes('[警告]') || line.includes('Warning')) {
    return 'warn'
  }
  if (line.includes('[执行完成]') || line.includes('[成功]') || line.includes('✅')) {
    return 'success'
  }
  return ''
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
