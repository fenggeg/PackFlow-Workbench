import {Alert, Button, Space} from 'antd'
import type {ServiceOperationTask} from '../../../types/domain'

interface HealthCheckResultProps {
  task?: ServiceOperationTask
  onViewLog?: () => void
  onRetry?: () => void
}

export function HealthCheckResult({task, onViewLog, onRetry}: HealthCheckResultProps) {
  if (!task || task.type !== 'health_check') {
    return null
  }

  const success = task.status === 'success'
  const message = success ? '健康检查通过' : task.errorMessage ?? '健康检查失败'
  const description = task.outputLines.at(-1)

  return (
    <Alert
      type={success ? 'success' : 'error'}
      showIcon
      message={message}
      description={description}
      action={!success ? (
        <Space>
          <Button size="small" onClick={onViewLog}>查看日志</Button>
          <Button size="small" type="primary" onClick={onRetry}>重试健康检查</Button>
        </Space>
      ) : undefined}
    />
  )
}
