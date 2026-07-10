import {Alert, Button, Card, Collapse, Empty, Modal, Progress, Space, Spin, Tag, Typography, message} from 'antd'
import {CodeOutlined, CopyOutlined, StopOutlined, ThunderboltOutlined, WarningOutlined} from '@ant-design/icons'
import {listen} from '@tauri-apps/api/event'
import {useEffect, useRef, useState} from 'react'
import {api} from '../../services/tauri-api'
import {useAppStore} from '../../store/useAppStore'
import type {ConflictScanProgress, DependencyConflict, DependencyConflictResult} from '../../types/domain'

const {Text} = Typography

function ConflictRow({conflict, onPreview}: {conflict: DependencyConflict; onPreview: (code: string) => void}) {
  const handleGenerate = async () => {
    try {
      const code = await api.generateExclusionCode(conflict.groupId, conflict.artifactId)
      onPreview(code)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      message.error('生成失败：' + msg)
    }
  }

  return (
    <div className="dependency-info-block" style={{padding: '8px 0'}}>
      <Space align="center" size={8}>
        <Tag color="red" style={{margin: 0}}>{conflict.groupId}:{conflict.artifactId}</Tag>
      </Space>
      <div style={{marginTop: 4, fontSize: 13}}>
        <Text type="secondary">冲突版本：</Text>
        <Text delete>{conflict.requestedVersion}</Text>
        <Text style={{margin: '0 8px'}}>&rarr;</Text>
        <Text strong style={{color: '#52c41a'}}>{conflict.selectedVersion}</Text>
      </div>
      <div style={{marginTop: 2, fontSize: 12}}>
        <Text type="secondary">依赖路径：{conflict.dependencyPath}</Text>
      </div>
      <div style={{marginTop: 4}}>
        <Button size="small" icon={<CodeOutlined />} onClick={handleGenerate}>
          生成排除代码
        </Button>
      </div>
    </div>
  )
}

function ExclusionPreviewModal({open, code, onClose}: {open: boolean; code: string; onClose: () => void}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      message.success('已复制到剪贴板')
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      message.error('复制失败：' + msg)
    }
  }

  return (
    <Modal
      title="Maven 排除代码预览"
      open={open}
      onCancel={onClose}
      width={520}
      footer={
        <Space>
          <Button onClick={onClose}>关闭</Button>
          <Button type="primary" icon={<CopyOutlined />} onClick={handleCopy}>
            {copied ? '已复制' : '复制到剪贴板'}
          </Button>
        </Space>
      }
    >
      <Text type="secondary" style={{display: 'block', marginBottom: 8}}>
        将以下代码添加到对应 &lt;dependency&gt; 声明中即可排除冲突的传递依赖：
      </Text>
      <pre
        style={{
          background: '#1e1e1e',
          color: '#d4d4d4',
          padding: '12px 16px',
          borderRadius: 6,
          fontSize: 13,
          lineHeight: 1.6,
          overflowX: 'auto',
          margin: 0,
          fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
        }}
      >
        <code>{code}</code>
      </pre>
    </Modal>
  )
}

export function DependencyConflictPanel() {
  const project = useAppStore((state) => state.project)
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<DependencyConflictResult | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [progress, setProgress] = useState<ConflictScanProgress | undefined>()
  const [elapsed, setElapsed] = useState(0)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewCode, setPreviewCode] = useState('')
  const abortRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 监听后端进度事件
  useEffect(() => {
    let unlisten: (() => void) | undefined

    listen<ConflictScanProgress>('dependency-conflict-progress', (event) => {
      setProgress(event.payload)
    }).then((fn) => {
      unlisten = fn
    })

    return () => {
      unlisten?.()
    }
  }, [])

  const startTimer = () => {
    setElapsed(0)
    timerRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1)
    }, 1000)
  }

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const handleScan = async () => {
    if (!project?.rootPath) {
      message.warning('请先选择项目')
      return
    }
    setScanning(true)
    setError(undefined)
    setResult(undefined)
    setProgress(undefined)
    abortRef.current = false
    startTimer()
    try {
      const data = await api.detectDependencyConflicts(project.rootPath)
      if (abortRef.current) return
      setResult(data)
      if (!data.hasConflicts) {
        message.success('未发现依赖冲突')
      }
    } catch (err) {
      if (abortRef.current) return
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      message.error('扫描失败：' + msg)
    } finally {
      stopTimer()
      setScanning(false)
    }
  }

  const handleCancel = () => {
    abortRef.current = true
    setScanning(false)
    stopTimer()
    message.info('扫描已取消')
  }

  const handlePreview = (code: string) => {
    setPreviewCode(code)
    setPreviewOpen(true)
  }

  const handleBulkPreview = async (conflicts: DependencyConflict[]) => {
    try {
      const code = await api.generateBulkExclusionCode(conflicts)
      if (code) {
        handlePreview(code)
      } else {
        message.info('无冲突可生成排除代码')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      message.error('批量生成失败：' + msg)
    }
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return m > 0 ? `${m}分${s}秒` : `${s}秒`
  }

  const progressPercent = progress && progress.totalModules > 0
    ? Math.round((progress.scannedModules / progress.totalModules) * 100)
    : undefined

  return (
    <Card title="依赖冲突检测" className="panel-card" size="small">
      <Space direction="vertical" size={12} style={{width: '100%'}}>
        <Text type="secondary">
          通过 mvn dependency:tree -Dverbose 分析项目中各模块的传递依赖冲突，并可生成 Maven 排除代码。
        </Text>

        <Space style={{width: '100%'}}>
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            loading={scanning}
            onClick={handleScan}
            disabled={!project}
            style={{flex: 1}}
          >
            {scanning ? '正在扫描...' : '扫描依赖冲突'}
          </Button>
          {scanning && (
            <Button
              icon={<StopOutlined />}
              onClick={handleCancel}
              danger
            >
              取消
            </Button>
          )}
        </Space>

        {scanning ? (
          <div style={{padding: '8px 0'}}>
            {progressPercent !== undefined ? (
              <>
                <Progress
                  percent={progressPercent}
                  size="small"
                  format={() => `${progress!.scannedModules} / ${progress!.totalModules} 模块`}
                />
                {progress?.currentModule && (
                  <div style={{marginTop: 4, fontSize: 12}}>
                    <Text type="secondary" ellipsis>
                      正在扫描：{progress.currentModule}
                    </Text>
                  </div>
                )}
              </>
            ) : (
              <div style={{textAlign: 'center', padding: '16px 0'}}>
                <Spin />
                <div style={{marginTop: 8}}><Text type="secondary">正在启动 dependency:tree...</Text></div>
              </div>
            )}
            {elapsed > 2 && (
              <div style={{marginTop: 4, fontSize: 12, textAlign: 'right'}}>
                <Text type="secondary">已用时 {formatTime(elapsed)}</Text>
              </div>
            )}
          </div>
        ) : null}

        {error ? (
          <Alert type="error" showIcon message="扫描失败" description={error} />
        ) : null}

        {result && !result.hasConflicts ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<Text type="secondary">未发现依赖冲突，所有依赖版本一致</Text>}
          />
        ) : null}

        {result && result.hasConflicts && (
          <div style={{fontSize: 12, textAlign: 'right'}}>
            <Text type="secondary">
              共 {result.modules.length} 个模块存在冲突，扫描耗时 {formatTime(elapsed)}
            </Text>
          </div>
        )}

        {result?.modules.map((mod) => (
          <div key={mod.moduleId}>
            <div style={{marginBottom: 4}}>
              <div style={{display: 'flex', alignItems: 'center', gap: 4, minWidth: 0}}>
                <WarningOutlined style={{color: '#faad14', flexShrink: 0}} />
                <Text strong style={{minWidth: 0}}>{mod.artifactId}</Text>
                <Tag color="orange" style={{flexShrink: 0, marginInlineEnd: 0}}>{mod.conflicts.length} 个冲突</Tag>
              </div>
              <Button
                size="small"
                type="link"
                icon={<CodeOutlined />}
                onClick={() => handleBulkPreview(mod.conflicts)}
                style={{padding: 0, fontSize: 12, marginTop: 4}}
              >
                批量排除
              </Button>
            </div>
            <Collapse
              size="small"
              ghost
              items={[
                {
                  key: 'conflicts',
                  label: `显示 ${mod.conflicts.length} 个冲突详情`,
                  children: (
                    <div>
                      {mod.conflicts.map((conflict) => (
                        <ConflictRow
                          key={`${conflict.groupId}:${conflict.artifactId}:${conflict.requestedVersion}`}
                          conflict={conflict}
                          onPreview={handlePreview}
                        />
                      ))}
                    </div>
                  ),
                },
              ]}
            />
          </div>
        ))}

        {result && !project ? (
          <Alert type="warning" showIcon message="请先选择 Maven 项目再扫描" />
        ) : null}
      </Space>

      <ExclusionPreviewModal
        open={previewOpen}
        code={previewCode}
        onClose={() => setPreviewOpen(false)}
      />
    </Card>
  )
}
