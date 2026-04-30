import {Alert, Descriptions, Input, Modal, Space, Typography} from 'antd'
import {useMemo, useState} from 'react'
import type {ServerProfile, ServiceRuntimeConfig} from '../../../types/domain'
import {isHighRiskEnvironment, isPreRiskEnvironment} from '../services/serviceRuntimeConfigService'

const {Text} = Typography

interface RestartConfirmDialogProps {
  open: boolean
  config?: ServiceRuntimeConfig
  server?: ServerProfile
  confirming?: boolean
  onCancel: () => void
  onConfirm: () => void
}

const commandText = (config?: ServiceRuntimeConfig) => {
  if (!config) return '-'
  if (config.restartCommand?.trim()) return config.restartCommand
  const commands = [config.stopCommand, config.startCommand]
    .map((command) => command?.trim())
    .filter((command): command is string => Boolean(command))
  return Array.from(new Set(commands)).join('\n')
}

const restartSummary = (config?: ServiceRuntimeConfig) => {
  if (!config) return '-'
  if (config.restartCommand?.trim()) {
    return '执行重启命令，随后采样启动日志并进行健康检查'
  }
  return '停止旧进程，等待 2 秒，启动服务，采样启动日志并进行健康检查'
}

export function RestartConfirmDialog({
  open,
  config,
  server,
  confirming,
  onCancel,
  onConfirm,
}: RestartConfirmDialogProps) {
  const [confirmText, setConfirmText] = useState('')
  const highRisk = isHighRiskEnvironment(config?.environmentId ?? '')
  const preRisk = isPreRiskEnvironment(config?.environmentId ?? '')
  const canConfirm = !highRisk || confirmText.trim() === config?.serviceName

  const title = highRisk ? '确认重启生产服务？' : '确认重启服务？'
  const riskMessage = useMemo(() => {
    if (highRisk) return '生产环境重启必须输入服务名确认，重启期间服务可能短暂不可用。'
    if (preRisk) return '预发环境重启风险较高，请确认当前服务和服务器无误。'
    return '重启期间服务可能短暂不可用。'
  }, [highRisk, preRisk])

  return (
    <Modal
      title={title}
      open={open}
      okText={highRisk ? '确认重启生产服务' : '确认重启'}
      cancelText="取消"
      okButtonProps={{danger: highRisk, disabled: !canConfirm, loading: confirming}}
      onOk={onConfirm}
      onCancel={onCancel}
    >
      <Space direction="vertical" size={14} style={{width: '100%'}}>
        <Alert type={highRisk ? 'error' : preRisk ? 'warning' : 'info'} showIcon message={riskMessage} />
        <Descriptions size="small" bordered column={1}>
          <Descriptions.Item label="服务">{config?.serviceName ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="环境">{config?.environmentId ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="服务器">
            {server ? `${server.name} · ${server.username}@${server.host}:${server.port}` : config?.serverId ?? '-'}
          </Descriptions.Item>
          <Descriptions.Item label="执行流程">
            {restartSummary(config)}
          </Descriptions.Item>
        </Descriptions>
        <details className="service-command-details">
          <summary>查看完整命令（调试用）</summary>
          <Text code className="service-command-code">{commandText(config)}</Text>
        </details>
        {highRisk ? (
          <Input
            placeholder={`请输入服务名 ${config?.serviceName ?? ''} 确认重启`}
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
          />
        ) : null}
      </Space>
    </Modal>
  )
}
