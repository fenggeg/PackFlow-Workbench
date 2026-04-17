import { Button, Card, Empty, Modal } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import type { BuildLogEvent } from '../../types/domain'

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
  const panelRef = useRef<HTMLDivElement>(null)
  const modalPanelRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (panelRef.current) {
      panelRef.current.scrollTop = panelRef.current.scrollHeight
    }
    if (modalPanelRef.current) {
      modalPanelRef.current.scrollTop = modalPanelRef.current.scrollHeight
    }
  }, [logs])

  const renderContent = () =>
    logs.length === 0 ? (
      <Empty description="暂无构建日志" image={Empty.PRESENTED_IMAGE_SIMPLE} />
    ) : (
      logs.map((event, index) => (
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
      extra={<Button size="small" onClick={() => setExpanded(true)}>放大</Button>}
    >
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
