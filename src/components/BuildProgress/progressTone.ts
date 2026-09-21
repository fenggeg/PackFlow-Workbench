import type {BuildProgressStatus} from '@/services/buildProgressService'

/** 进度条配色统一走设计令牌，浅色/深色主题都能保持一致语义 */
export const progressBarClass = (status: BuildProgressStatus) => {
  switch (status) {
    case 'success':
      return 'bg-[var(--success)]'
    case 'failed':
      return 'bg-[var(--error)]'
    case 'cancelled':
    case 'cancelling':
      return 'bg-[var(--warning)]'
    default:
      return 'bg-[var(--primary)]'
  }
}

export const progressTextClass = (status: BuildProgressStatus) => {
  switch (status) {
    case 'success':
      return 'text-[var(--success)]'
    case 'failed':
      return 'text-[var(--error)]'
    case 'cancelled':
    case 'cancelling':
      return 'text-[var(--warning)]'
    default:
      return 'text-[var(--foreground)]'
  }
}

export const progressLabel = (status: BuildProgressStatus) => {
  switch (status) {
    case 'success':
      return '已完成'
    case 'failed':
      return '构建失败'
    case 'cancelling':
      return '正在停止'
    case 'cancelled':
      return '已停止'
    default:
      return '进行中'
  }
}

export const isActiveStatus = (status: BuildProgressStatus) =>
  status === 'running' || status === 'cancelling'
