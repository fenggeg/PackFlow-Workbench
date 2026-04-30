import {Alert, Input, InputNumber, Modal, Select, Space, Typography} from 'antd'
import {useState} from 'react'
import type {LogSourceType, ServiceRuntimeConfig} from '../../../types/domain'

const {Text} = Typography

interface ServiceRuntimeConfigEditorProps {
  open: boolean
  config?: ServiceRuntimeConfig
  onCancel: () => void
  onSave: (config: ServiceRuntimeConfig) => void
}

const logSourceOptions: {label: string; value: LogSourceType}[] = [
  {label: '文件日志', value: 'file'},
  {label: 'systemd', value: 'systemd'},
  {label: 'Docker', value: 'docker'},
  {label: '自定义命令', value: 'custom'},
]

export function ServiceRuntimeConfigEditor({
  open,
  config,
  onCancel,
  onSave,
}: ServiceRuntimeConfigEditorProps) {
  const [draft, setDraft] = useState<ServiceRuntimeConfig | undefined>(config)

  if (!draft) {
    return null
  }

  const logSource = draft.logSource ?? {type: 'file' as const, tailLines: 300}

  return (
    <Modal
      title={`服务运行配置 · ${draft.serviceName}`}
      open={open}
      width={780}
      okText="保存配置"
      cancelText="取消"
      onCancel={onCancel}
      onOk={() => onSave(draft)}
    >
      <Space direction="vertical" size={14} style={{width: '100%'}}>
        <Text type="secondary">服务：{draft.serviceName} · 环境：{draft.environmentId}</Text>
        <Alert
          type="info"
          showIcon
          message="通常不需要手写重启命令"
          description="默认会复用部署配置中的停止、启动和健康检查流程。只有服务使用 systemd、Docker 或自定义脚本时，再展开高级命令覆盖。"
        />
        <details className="service-command-details">
          <summary>高级命令覆盖</summary>
          <Space direction="vertical" size={10} style={{width: '100%', marginTop: 10}}>
            <Input.TextArea
              rows={2}
              placeholder="restartCommand，例如 sh restart.sh"
              value={draft.restartCommand}
              onChange={(event) => setDraft({...draft, restartCommand: event.target.value || undefined})}
            />
            <Input.TextArea
              rows={2}
              placeholder="stopCommand，没有 restartCommand 时使用"
              value={draft.stopCommand}
              onChange={(event) => setDraft({...draft, stopCommand: event.target.value || undefined})}
            />
            <Input.TextArea
              rows={2}
              placeholder="startCommand，没有 restartCommand 时使用"
              value={draft.startCommand}
              onChange={(event) => setDraft({...draft, startCommand: event.target.value || undefined})}
            />
          </Space>
        </details>
        <Input
          placeholder="healthCheckUrl，例如 http://127.0.0.1:8080/actuator/health"
          value={draft.healthCheckUrl}
          onChange={(event) => setDraft({...draft, healthCheckUrl: event.target.value || undefined})}
        />
        <Input
          placeholder="workDir，例如 /opt/apps/business-service"
          value={draft.workDir}
          onChange={(event) => setDraft({...draft, workDir: event.target.value || undefined})}
        />
        <Space wrap>
          <Select
            style={{width: 160}}
            value={logSource.type}
            options={logSourceOptions}
            onChange={(value) => setDraft({...draft, logSource: {...logSource, type: value}})}
          />
          <InputNumber
            min={50}
            max={5000}
            value={logSource.tailLines}
            addonBefore="tail"
            onChange={(value) => setDraft({...draft, logSource: {...logSource, tailLines: Number(value) || 300}})}
          />
        </Space>
        {logSource.type === 'file' ? (
          <Input
            placeholder="日志文件路径，例如 /opt/apps/business/logs/app.log"
            value={logSource.logPath}
            onChange={(event) => setDraft({...draft, logSource: {...logSource, logPath: event.target.value || undefined}})}
          />
        ) : null}
        {logSource.type === 'systemd' ? (
          <Input
            placeholder="systemd Unit，例如 business-service"
            value={logSource.systemdUnit}
            onChange={(event) => setDraft({...draft, logSource: {...logSource, systemdUnit: event.target.value || undefined}})}
          />
        ) : null}
        {logSource.type === 'docker' ? (
          <Input
            placeholder="Docker 容器名称"
            value={logSource.dockerContainerName}
            onChange={(event) => setDraft({...draft, logSource: {...logSource, dockerContainerName: event.target.value || undefined}})}
          />
        ) : null}
        {logSource.type === 'custom' ? (
          <Input.TextArea
            rows={3}
            placeholder="自定义日志命令，例如 tail -n 300 -f /opt/apps/business/logs/app.log"
            value={logSource.customCommand}
            onChange={(event) => setDraft({...draft, logSource: {...logSource, customCommand: event.target.value || undefined}})}
          />
        ) : null}
      </Space>
    </Modal>
  )
}
