import type {BuildDiagnosis, DeploymentStage} from '../types/domain'

export const formatDuration = (durationMs?: number, fallback = ''): string => {
  if (!durationMs) {
    return fallback
  }
  return durationMs >= 1000 ? `${(durationMs / 1000).toFixed(1)}s` : `${durationMs}ms`
}

export const diagnosisCategoryText: Record<BuildDiagnosis['category'], string> = {
  jdk_mismatch: 'JDK 版本不匹配',
  maven_missing: 'Maven 不存在',
  wrapper_issue: 'Wrapper 失效',
  settings_missing: 'settings.xml 缺失',
  dependency_download_failed: '依赖下载失败',
  repo_unreachable: '私服不可达',
  profile_invalid: 'profile 不存在',
  module_invalid: '模块路径错误',
  test_failed: '单元测试失败',
  unknown: '未知错误',
}

export const deploymentStatusText = (status?: string): string => {
  switch (status) {
    case 'success': return '部署成功'
    case 'failed': return '部署失败'
    case 'cancelled': return '已停止'
    case 'pending': return '等待中'
    case 'uploading': return '上传中'
    case 'stopping': return '停止旧服务'
    case 'starting': return '启动中'
    case 'checking': return '检测中'
    default: return status ?? '未知'
  }
}

export const deploymentStatusColor: Record<string, string> = {
  pending: 'default',
  uploading: 'processing',
  stopping: 'orange',
  starting: 'cyan',
  checking: 'blue',
  waiting: 'processing',
  success: 'green',
  failed: 'red',
  timeout: 'red',
  cancelled: 'orange',
}

export const stageStatusText = (status: string): string => {
  switch (status) {
    case 'pending': return '等待中'
    case 'waiting': return '等待中'
    case 'running': return '执行中'
    case 'checking': return '检测中'
    case 'success': return '成功'
    case 'failed': return '失败'
    case 'skipped': return '已跳过'
    case 'timeout': return '超时'
    case 'cancelled': return '已停止'
    default: return status
  }
}

export const stageStatusColor = (status: string): string => {
  switch (status) {
    case 'success': return 'success'
    case 'failed':
    case 'timeout': return 'error'
    case 'cancelled': return 'warning'
    case 'running':
    case 'checking':
    case 'waiting': return 'processing'
    case 'skipped': return 'default'
    default: return 'default'
  }
}

export const stepTypeText = (type?: string): string => {
  switch (type) {
    case 'ssh_command': return 'SSH 命令'
    case 'wait': return '等待'
    case 'port_check': return '端口检测'
    case 'http_check': return 'HTTP 健康检查'
    case 'log_check': return '日志关键字检测'
    case 'upload_file': return '文件上传'
    case 'startup_probe': return '启动探针'
    default: return type ?? '部署步骤'
  }
}

export const probeTypeText = (type: string): string => {
  switch (type) {
    case 'process': return '进程探针'
    case 'port': return '端口探针'
    case 'http': return 'HTTP 探针'
    case 'log': return '日志探针'
    case 'timeout': return '超时'
    default: return type
  }
}

export const probeStatusColor = (status: string): string => {
  switch (status) {
    case 'success':
    case 'alive':
    case 'open': return 'green'
    case 'failed':
    case 'dead':
    case 'closed': return 'red'
    case 'warning': return 'gold'
    case 'checking': return 'processing'
    default: return 'default'
  }
}

export const releaseStatusMeta = (status: string): {label: string; color: string} => {
  switch (status) {
    case 'success': return {label: '成功', color: 'green'}
    case 'failed': return {label: '失败', color: 'red'}
    case 'cancelled': return {label: '已取消', color: 'default'}
    case 'prechecking': return {label: '预检中', color: 'processing'}
    case 'building': return {label: '构建中', color: 'processing'}
    case 'matching_artifact': return {label: '匹配产物', color: 'processing'}
    case 'deploying': return {label: '部署中', color: 'processing'}
    case 'checking': return {label: '健康检查', color: 'processing'}
    default: return {label: '等待', color: 'blue'}
  }
}

export const stageMetaText = (stage: DeploymentStage): string =>
  [
    stepTypeText(stage.type),
    stage.durationMs ? `耗时 ${formatDuration(stage.durationMs)}` : '',
    stage.retryCount ? `重试 ${stage.currentRetry ?? 0}/${stage.retryCount}` : '',
  ].filter(Boolean).join(' · ')
