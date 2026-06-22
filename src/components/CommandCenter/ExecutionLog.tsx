import {useEffect, useRef} from 'react'
import {Card, Tag, Space, Progress, Empty} from 'antd'
import {useCommandStore} from '../../store/useCommandStore'

export function ExecutionLog() {
  const {
    currentExecutionLogs,
    currentExecutionStatus,
    uploadProgress,
  } = useCommandStore()

  const logContainerRef = useRef<HTMLDivElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [currentExecutionLogs])

  const statusTag = {
    idle: <Tag>空闲</Tag>,
    running: <Tag color="processing">执行中</Tag>,
    success: <Tag color="success">成功</Tag>,
    failed: <Tag color="error">失败</Tag>,
    cancelled: <Tag color="warning">已取消</Tag>,
  }

  return (
    <Card
      title={
        <Space>
          <span>执行日志</span>
          {statusTag[currentExecutionStatus]}
        </Space>
      }
      size="small"
      className="panel-card"
      style={{height: '100%', display: 'flex', flexDirection: 'column'}}
      styles={{body: {flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column'}}}
    >
      {uploadProgress && (
        <div style={{marginBottom: 12, fontFamily: 'Consolas, "Cascadia Mono", monospace'}}>
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
        />
      ) : (
        <div
          ref={logContainerRef}
          className="log-panel"
          style={{flex: 1, minHeight: 0}}
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
  if (line.includes('[错误]') || line.includes('[执行失败]') || line.includes('Error')) {
    return 'error'
  }
  if (line.includes('[警告]') || line.includes('Warning')) {
    return 'warn'
  }
  if (line.includes('[执行完成]') || line.includes('[成功]')) {
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
