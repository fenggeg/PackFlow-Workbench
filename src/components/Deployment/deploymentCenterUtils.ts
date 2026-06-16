import type {
    BackupConfig,
    BuildArtifact,
    DeployFailureStrategy,
    DeploymentProfile,
    DeploymentStage,
    DeployStep,
    DeployStepType,
    FrontendDeployMode,
    FrontendStaticDeployConfig,
    StartupProbeConfig,
} from '../../types/domain'
import {formatDuration, stepTypeText} from '../../utils/format'
import {summarizeDeploymentPipeline} from '../../services/deploymentRuntime'

export interface DeploymentTemplate {
  id: string
  name: string
  description: string
  steps: DeployStep[]
  builtin?: boolean
  updatedAt?: string
}

export type FormMode = 'create' | 'edit'

export const DEPLOYMENT_TEMPLATE_STORAGE_KEY = 'packflow-workbench.deploymentTemplates.v1'

export type SshCommandConfig = Extract<DeployStep['config'], {command: string}>
export type WaitConfig = Extract<DeployStep['config'], {waitSeconds: number}>
export type PortCheckConfig = Extract<DeployStep['config'], {host: string; port: number}>
export type HttpCheckConfig = Extract<DeployStep['config'], {url: string; method: string}>
export type LogCheckConfig = Extract<DeployStep['config'], {logPath: string; successKeywords: string[]}>
export type UploadFileConfig = Extract<DeployStep['config'], {localPath: string; remotePath: string}>

export const createDefaultStartupProbe = (): StartupProbeConfig => ({
  enabled: true,
  timeoutSeconds: 120,
  intervalSeconds: 3,
  processProbe: {enabled: true},
  portProbe: {enabled: true, host: '127.0.0.1', port: 8080, consecutiveSuccesses: 2},
  httpProbe: {enabled: false, method: 'GET', consecutiveSuccesses: 2},
  logProbe: {
    enabled: true,
    successPatterns: ['Started'],
    failurePatterns: [
      'APPLICATION FAILED TO START',
      'Application run failed',
      'Port already in use',
      'Web server failed to start',
      'Address already in use',
      'BindException',
      'OutOfMemoryError',
    ],
    warningPatterns: ['Exception', 'ERROR'],
    useRegex: false,
    onlyCurrentDeployLog: true,
  },
  successPolicy: 'health_first',
})

export const createDefaultBackupConfig = (): BackupConfig => ({
  enabled: true,
  backupDir: '',
  retentionCount: 5,
  autoRollback: false,
  restartAfterRollback: false,
})

export const createDefaultFrontendConfig = (): FrontendStaticDeployConfig => ({
  artifactSourceType: 'directory',
  localDistPath: 'dist',
  localArchivePath: '',
  remoteSiteDir: '',
  remoteTempDir: '/tmp/deploy',
  deployMode: 'backup_then_overwrite',
  entryFile: 'index.html',
  backupBeforeDeploy: true,
  remoteBackupDir: '',
  cleanBeforeDeploy: false,
  reloadCommand: '',
  verify: {
    enabled: false,
    url: '',
    method: 'GET',
    expectedStatusCodes: [200],
    expectedBodyContains: '<html',
    timeoutSeconds: 30,
    retryIntervalSeconds: 3,
  },
  releaseConfig: {
    releasesDir: '',
    currentLinkPath: '',
    keepReleases: 5,
  },
  cleanupTempFiles: true,
  autoRollback: false,
})

export const createDeploymentDraft = (): DeploymentProfile => ({
  id: crypto.randomUUID(),
  name: '',
  publishType: 'backend_service',
  projectRoot: '',
  moduleId: '',
  modulePath: '',
  moduleArtifactId: '',
  localArtifactPattern: '*.jar',
  remoteArtifactName: '',
  remoteDeployPath: '',
  serviceDescription: '',
  serviceAlias: '',
  javaBinPath: '',
  jvmOptions: '',
  springProfile: '',
  extraArgs: '',
  workingDir: '',
  logPath: '',
  logNamingMode: 'date',
  logName: '',
  logEncoding: 'UTF-8',
  enableDeployLog: true,
  backupConfig: createDefaultBackupConfig(),
  frontendConfig: createDefaultFrontendConfig(),
  deploymentSteps: [],
  customCommands: [],
  startupProbe: createDefaultStartupProbe(),
})

export const stepTypeOptions: {label: string; value: DeployStepType}[] = [
  {label: 'SSH 命令', value: 'ssh_command'},
  {label: '等待', value: 'wait'},
  {label: '端口检测', value: 'port_check'},
  {label: 'HTTP 健康检查', value: 'http_check'},
  {label: '日志关键字检测', value: 'log_check'},
  {label: '文件上传', value: 'upload_file'},
]

export const failureStrategyOptions: {label: string; value: DeployFailureStrategy}[] = [
  {label: '失败即停止', value: 'stop'},
  {label: '失败后继续', value: 'continue'},
  {label: '失败后回滚', value: 'rollback'},
]

export const stepTypeLabel = (type?: string) =>
  stepTypeOptions.find((item) => item.value === type)?.label ?? type ?? '部署步骤'

export const createDefaultStepConfig = (type: DeployStepType): DeployStep['config'] => {
  switch (type) {
    case 'wait':
      return {waitSeconds: 10}
    case 'port_check':
      return {host: '127.0.0.1', port: 8080, checkIntervalSeconds: 3}
    case 'http_check':
      return {
        url: 'http://127.0.0.1:8080/actuator/health',
        method: 'GET',
        expectedStatusCodes: [200],
        expectedBodyContains: 'UP',
        checkIntervalSeconds: 5,
      }
    case 'log_check':
      return {
        logPath: '${logFile}',
        successKeywords: ['Started'],
        failureKeywords: [
          'APPLICATION FAILED TO START',
          'Application run failed',
          'Port already in use',
          'Web server failed to start',
          'Address already in use',
          'BindException',
          'OutOfMemoryError',
        ],
        checkIntervalSeconds: 3,
      }
    case 'upload_file':
      return {
        localPath: '${artifactPath}',
        remotePath: '${remoteDeployPath}/.${artifactName}.uploading',
        overwrite: true,
      }
    case 'ssh_command':
    default:
      return {command: '', successExitCodes: [0]}
  }
}

export const createDeployStep = (type: DeployStepType, order: number, name?: string): DeployStep => ({
  id: crypto.randomUUID(),
  enabled: true,
  name: name ?? stepTypeLabel(type),
  type,
  order,
  timeoutSeconds: type === 'wait' ? undefined : type === 'http_check' || type === 'log_check' ? 90 : 60,
  retryCount: type === 'http_check' || type === 'port_check' || type === 'log_check' ? 1 : 0,
  retryIntervalSeconds: 3,
  failureStrategy: 'stop',
  config: createDefaultStepConfig(type),
})

export const toNumberList = (value: unknown, fallback: number[]) => {
  if (Array.isArray(value)) {
    const values = value.map((item) => Number(item)).filter((item) => Number.isFinite(item))
    return values.length > 0 ? values : fallback
  }
  if (typeof value === 'string') {
    const values = value.split(',').map((item) => Number(item.trim())).filter((item) => Number.isFinite(item))
    return values.length > 0 ? values : fallback
  }
  return fallback
}

export const toStringList = (value: unknown, fallback: string[] = []) => {
  if (Array.isArray(value)) {
    return value.map(String).map((item) => item.trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean)
  }
  return fallback
}

export const stepSummary = (step: DeployStep) => {
  switch (step.type) {
    case 'ssh_command': {
      const config = step.config as SshCommandConfig
      return config.command?.slice(0, 90) || '未配置命令'
    }
    case 'wait': {
      const config = step.config as WaitConfig
      return `等待 ${config.waitSeconds ?? 0} 秒`
    }
    case 'port_check': {
      const config = step.config as PortCheckConfig
      return `${config.host ?? ''}:${config.port ?? 0}，间隔 ${config.checkIntervalSeconds ?? 0} 秒`
    }
    case 'http_check': {
      const config = step.config as HttpCheckConfig
      return `${config.method ?? 'GET'} ${config.url ?? ''}，期望 ${toNumberList(config.expectedStatusCodes, [200]).join(',')}`
    }
    case 'log_check': {
      const config = step.config as LogCheckConfig
      return `${config.logPath ?? ''}，成功关键字 ${toStringList(config.successKeywords).join(', ') || '-'}`
    }
    case 'upload_file': {
      const config = step.config as UploadFileConfig
      return `${config.localPath ?? ''} → ${config.remotePath ?? ''}`
    }
    default:
      return ''
  }
}

const stopPortOwnerFragment =
  'if [ -n "${portProbePort}" ]; then echo "端口 Java 进程清理：${portProbePort}"; find_port_pids() { if command -v lsof >/dev/null 2>&1; then lsof -nP -t -iTCP:${portProbePort} -sTCP:LISTEN 2>/dev/null; elif command -v ss >/dev/null 2>&1; then ss -ltnp 2>/dev/null | awk \'$4 ~ /:${portProbePort}$/ {print}\' | grep -o "pid=[0-9]*" | cut -d= -f2; elif command -v fuser >/dev/null 2>&1; then fuser -n tcp ${portProbePort} 2>/dev/null; else PORT_HEX=$(printf "%04X" ${portProbePort}); INODES=$(awk -v p=":$PORT_HEX" \'$4=="0A" && toupper($2) ~ p"$" {gsub(/\\r/,"",$10); print $10}\' /proc/net/tcp /proc/net/tcp6 2>/dev/null | sort -u); for inode in $INODES; do for fd in /proc/[0-9]*/fd/*; do link=$(readlink "$fd" 2>/dev/null || true); if [ "$link" = "socket:[$inode]" ]; then pid=${fd#/proc/}; echo "${pid%%/*}"; fi; done; done; fi; }; java_port_pids() { for pid in $(find_port_pids | tr " " "\\n" | sed "/^$/d" | sort -u); do CMD=$(tr "\\0" " " < "/proc/$pid/cmdline" 2>/dev/null || ps -p "$pid" -o args= 2>/dev/null || true); COMM=$(cat "/proc/$pid/comm" 2>/dev/null || true); if echo "$COMM $CMD" | grep -qi "java"; then echo "$pid"; else echo "端口 ${portProbePort} 被非 Java 进程 PID $pid 占用，跳过查杀" >&2; fi; done; }; JAVA_PIDS=$(java_port_pids | tr " " "\\n" | sed "/^$/d" | sort -u | tr "\\n" " "); if [ -n "$JAVA_PIDS" ]; then echo "端口 ${portProbePort} 被 Java PID $JAVA_PIDS 占用，直接查杀"; kill $JAVA_PIDS 2>/dev/null || true; sleep 2; fi; JAVA_PIDS=$(java_port_pids | tr " " "\\n" | sed "/^$/d" | sort -u | tr "\\n" " "); if [ -n "$JAVA_PIDS" ]; then echo "端口 ${portProbePort} Java PID $JAVA_PIDS 仍存活，强制查杀"; kill -9 $JAVA_PIDS 2>/dev/null || true; sleep 1; fi; REMAINING=$(find_port_pids | tr " " "\\n" | sed "/^$/d" | sort -u | tr "\\n" " "); if [ -n "$REMAINING" ]; then echo "端口 ${portProbePort} 仍被 PID $REMAINING 占用，无法启动新服务"; exit 1; fi; else echo "未配置端口清理，跳过端口占用处理"; fi'

const springBootStopCommand =
  `PID_FILE="\${pidFile}"; if [ -f "$PID_FILE" ]; then PID=$(cat "$PID_FILE"); if [ -n "$PID" ]; then echo "====== 停止服务进程 PID=$PID"; kill -9 "$PID" 2>/dev/null || true; fi; rm -f "$PID_FILE"; fi; pkill -9 -f "\${remoteDeployPath}/\${remoteArtifactName}" 2>/dev/null || true; ${stopPortOwnerFragment}`

const springBootStartCommand =
  'mkdir -p "${logDir}" "${remoteDeployPath}/.packflow" && cd "${serviceDir}" || exit 1; nohup "${javaBin}" ${jvmOptions} -jar "${remoteDeployPath}/${remoteArtifactName}" ${springProfile} ${extraArgs} > "${logFile}" 2>&1 & PID=$!; echo "$PID" > "${pidFile}"; echo "${logFile}" > "${logPathFile}"; rm -f "${remoteDeployPath}/${remoteArtifactBaseName}.log.path"; echo "PID=$PID; LOG_FILE=${logFile}"'

export const createSpringBootJarSteps = (): DeployStep[] => {
  const steps: DeployStep[] = [
    createDeployStep('upload_file', 10, '上传 jar 包'),
    createDeployStep('ssh_command', 20, '备份旧 jar'),
    createDeployStep('ssh_command', 30, '停止旧服务'),
    createDeployStep('wait', 40, '等待端口释放'),
    createDeployStep('ssh_command', 50, '替换 jar 文件'),
    createDeployStep('ssh_command', 60, '启动新服务'),
  ]

  steps[1].config = {command: 'if [ -f "${remoteDeployPath}/${remoteArtifactName}" ]; then cp -f "${remoteDeployPath}/${remoteArtifactName}" "${remoteDeployPath}/${remoteArtifactName}.${timestamp}"; fi', successExitCodes: [0]}
  steps[2].config = {command: springBootStopCommand, successExitCodes: [0]}
  steps[3].config = {waitSeconds: 3}
  steps[4].config = {command: 'mkdir -p "${remoteDeployPath}" && mv -f "${remoteDeployPath}/.${artifactName}.uploading" "${remoteDeployPath}/${remoteArtifactName}"', successExitCodes: [0]}
  steps[5].config = {command: springBootStartCommand, successExitCodes: [0]}
  return steps
}

export const createTomcatWarSteps = (): DeployStep[] => {
  const steps: DeployStep[] = [
    createDeployStep('upload_file', 10, '上传 war 包'),
    createDeployStep('ssh_command', 20, '停止 Tomcat'),
    createDeployStep('ssh_command', 30, '备份旧包'),
    createDeployStep('ssh_command', 40, '替换 war 包'),
    createDeployStep('ssh_command', 50, '启动 Tomcat'),
    createDeployStep('http_check', 60, 'HTTP 验证'),
  ]
  steps[0].config = {localPath: '${artifactPath}', remotePath: '${remoteDeployPath}/.${artifactName}.uploading', overwrite: true}
  steps[1].config = {command: `if [ ! -x "\${remoteDeployPath}/bin/shutdown.sh" ]; then echo "缺少 Tomcat shutdown.sh 或没有执行权限"; exit 1; fi; "\${remoteDeployPath}/bin/shutdown.sh" || true; sleep 5; ${stopPortOwnerFragment}`, successExitCodes: [0]}
  steps[2].config = {command: 'if [ -f "${remoteDeployPath}/webapps/${remoteArtifactName}" ]; then cp -f "${remoteDeployPath}/webapps/${remoteArtifactName}" "${remoteDeployPath}/webapps/${remoteArtifactName}.${timestamp}"; fi', successExitCodes: [0]}
  steps[3].config = {command: 'mkdir -p "${remoteDeployPath}/webapps" && mv -f "${remoteDeployPath}/.${artifactName}.uploading" "${remoteDeployPath}/webapps/${remoteArtifactName}"', successExitCodes: [0]}
  steps[4].config = {command: 'if [ ! -x "${remoteDeployPath}/bin/startup.sh" ]; then echo "缺少 Tomcat startup.sh 或没有执行权限"; exit 1; fi; "${remoteDeployPath}/bin/startup.sh"', successExitCodes: [0]}
  steps[5].config = {url: 'http://127.0.0.1:8080/', method: 'GET', expectedStatusCodes: [200, 302], expectedBodyContains: '', checkIntervalSeconds: 5}
  return steps
}

const frontendArchiveExtractCommand = (targetDir: string) =>
  `rm -rf "${targetDir}" && mkdir -p "${targetDir}" && case "\${artifactName}" in *.tar.gz|*.tgz) tar -xzf "\${remoteUploadPath}" -C "${targetDir}" ;; *) unzip -oq "\${remoteUploadPath}" -d "${targetDir}" ;; esac`

export const createFrontendStaticSteps = (
  mode: FrontendDeployMode = 'backup_then_overwrite',
  config: FrontendStaticDeployConfig = createDefaultFrontendConfig(),
): DeployStep[] => {
  const tempDir = '${remoteTempDir}/${deploymentId}'
  const steps: DeployStep[] = [
    createDeployStep('upload_file', 10, '上传静态包'),
    createDeployStep('ssh_command', 20, '校验上传完整性'),
    createDeployStep('ssh_command', 30, mode === 'release_symlink' ? '解压到 release 目录' : '解压静态资源'),
    createDeployStep('ssh_command', 40, '校验入口文件'),
  ]
  steps[0].config = {localPath: '${artifactPath}', remotePath: '${remoteTempDir}/${artifactName}', overwrite: true}
  steps[1].config = {command: 'test -f "${remoteUploadPath}" && ACTUAL_SIZE=$(wc -c < "${remoteUploadPath}") && if [ "$ACTUAL_SIZE" != "${localArtifactSize}" ]; then echo "上传大小不一致：$ACTUAL_SIZE != ${localArtifactSize}"; exit 12; fi; echo "上传完整性校验通过：$ACTUAL_SIZE bytes"', successExitCodes: [0]}

  if (mode === 'release_symlink') {
    steps[2].config = {command: 'mkdir -p "${releasesDir}" && rm -rf "${releaseDir}" && mkdir -p "${releaseDir}" && case "${artifactName}" in *.tar.gz|*.tgz) tar -xzf "${remoteUploadPath}" -C "${releaseDir}" ;; *) unzip -oq "${remoteUploadPath}" -d "${releaseDir}" ;; esac', successExitCodes: [0]}
    steps[3].config = {command: 'test -f "${releaseDir}/${entryFile}" || { echo "入口文件不存在：${releaseDir}/${entryFile}"; exit 11; }', successExitCodes: [0]}
    steps.push(createDeployStep('ssh_command', 50, '切换 current 软链接'))
    steps[4].config = {command: 'ln -sfn "${releaseDir}" "${currentLinkPath}" && echo "current -> ${releaseDir}"', successExitCodes: [0]}
  } else {
    steps[2].config = {command: frontendArchiveExtractCommand(tempDir), successExitCodes: [0]}
    steps[3].config = {command: 'test -f "${remoteTempDir}/${deploymentId}/${entryFile}" || { echo "入口文件不存在：${remoteTempDir}/${deploymentId}/${entryFile}"; exit 11; }', successExitCodes: [0]}

    if (mode === 'backup_then_overwrite') {
      steps.push(createDeployStep('ssh_command', 50, '备份旧资源'))
      steps.at(-1)!.config = {command: 'mkdir -p "${remoteBackupDir}" "${remoteTempDir}" && BACKUP_FILE="${remoteBackupDir}/${remoteArtifactBaseName}-${timestamp}.tar.gz"; if [ -d "${remoteSiteDir}" ]; then tar -czf "$BACKUP_FILE" -C "${remoteSiteDir}" . && echo "$BACKUP_FILE" > "${remoteTempDir}/${deploymentId}.backup.path"; else echo "站点目录不存在，跳过备份"; : > "${remoteTempDir}/${deploymentId}.backup.path"; fi', successExitCodes: [0]}
    }

    steps.push(createDeployStep('ssh_command', (steps.length + 1) * 10, mode === 'clean_then_upload' ? '清空后发布到站点目录' : '发布到站点目录'))
    steps.at(-1)!.config = {
      command: mode === 'clean_then_upload'
        ? 'test -n "${remoteSiteDir}" && test "${remoteSiteDir}" != "/" && mkdir -p "${remoteSiteDir}" && find "${remoteSiteDir}" -mindepth 1 -maxdepth 1 -exec rm -rf {} + && cp -r "${remoteTempDir}/${deploymentId}"/. "${remoteSiteDir}"/'
        : 'mkdir -p "${remoteSiteDir}" && cp -r "${remoteTempDir}/${deploymentId}"/. "${remoteSiteDir}"/',
      successExitCodes: [0],
    }
  }

  if (config.reloadCommand?.trim()) {
    steps.push(createDeployStep('ssh_command', (steps.length + 1) * 10, 'Reload Nginx'))
    steps.at(-1)!.config = {command: '${reloadCommand}', successExitCodes: [0]}
  }

  if (config.verify?.enabled && config.verify.url?.trim()) {
    steps.push(createDeployStep('http_check', (steps.length + 1) * 10, '访问验证'))
    steps.at(-1)!.timeoutSeconds = config.verify.timeoutSeconds || 30
    steps.at(-1)!.retryIntervalSeconds = config.verify.retryIntervalSeconds || 3
    steps.at(-1)!.config = {
      url: '${verifyUrl}',
      method: 'GET',
      expectedStatusCodes: config.verify.expectedStatusCodes?.length ? config.verify.expectedStatusCodes : [200],
      expectedBodyContains: config.verify.expectedBodyContains ?? '',
      checkIntervalSeconds: config.verify.retryIntervalSeconds || 3,
    }
  }

  if (mode === 'release_symlink') {
    steps.push(createDeployStep('ssh_command', (steps.length + 1) * 10, '清理旧 release'))
    steps.at(-1)!.config = {command: 'cd "${releasesDir}" || exit 0; ls -1dt */ 2>/dev/null | tail -n +$(( ${keepReleases} + 1 )) | xargs -r rm -rf', successExitCodes: [0]}
  } else if (config.cleanupTempFiles !== false) {
    steps.push(createDeployStep('ssh_command', (steps.length + 1) * 10, '清理临时文件'))
    steps.at(-1)!.config = {command: 'rm -rf "${remoteTempDir}/${deploymentId}" "${remoteUploadPath}" "${remoteTempDir}/${deploymentId}.backup.path"', successExitCodes: [0]}
  }

  if (config.autoRollback && (mode === 'backup_then_overwrite' || mode === 'release_symlink')) {
    steps.forEach((step) => {
      const rollbackPoint = step.name.includes('发布到站点目录')
        || step.name.includes('切换 current')
        || step.name.includes('Reload')
        || step.name.includes('访问验证')
      if (rollbackPoint) {
        step.failureStrategy = 'rollback'
      }
    })
  }

  return steps
}

export const cloneDeploySteps = (steps: DeployStep[]) =>
  steps.map((step, index) => ({
    ...step,
    id: crypto.randomUUID(),
    order: (index + 1) * 10,
    config: JSON.parse(JSON.stringify(step.config)) as DeployStep['config'],
  }))

export const builtinDeploymentTemplates = (): DeploymentTemplate[] => [
  {
    id: 'builtin-spring-boot-jar',
    name: 'Spring Boot Jar 滚动替换',
    description: '上传、备份、停止旧进程、替换 Jar、nohup 启动并写入 PID/日志指针。',
    steps: createSpringBootJarSteps(),
    builtin: true,
  },
  {
    id: 'builtin-tomcat-war',
    name: 'Tomcat War 替换',
    description: '适用于独立 Tomcat：停服、备份 webapps、替换 War、启动后 HTTP 验证。',
    steps: createTomcatWarSteps(),
    builtin: true,
  },
  {
    id: 'builtin-frontend-backup-overwrite',
    name: '前端静态资源：备份后覆盖发布',
    description: '默认推荐：上传 zip/目录自动压缩，校验入口文件，备份旧站点后覆盖，不要求软链接。',
    steps: createFrontendStaticSteps('backup_then_overwrite'),
    builtin: true,
  },
  {
    id: 'builtin-frontend-clean-upload',
    name: '前端静态资源：清空后发布',
    description: '校验新包后清空站点目录再复制，适合需要清理旧 hash 文件的站点。',
    steps: createFrontendStaticSteps('clean_then_upload'),
    builtin: true,
  },
  {
    id: 'builtin-frontend-release-symlink',
    name: '前端静态资源：版本目录软链接发布',
    description: '发布到 releases 版本目录并切换 current 软链接，仅适合生产 root 已指向 current 的场景。',
    steps: createFrontendStaticSteps('release_symlink'),
    builtin: true,
  },
]

export const loadDeploymentTemplates = (): DeploymentTemplate[] => {
  if (typeof window === 'undefined') {
    return builtinDeploymentTemplates()
  }
  try {
    const saved = JSON.parse(window.localStorage.getItem(DEPLOYMENT_TEMPLATE_STORAGE_KEY) ?? '[]') as DeploymentTemplate[]
    return [...builtinDeploymentTemplates(), ...saved.filter((item) => !item.builtin)]
  } catch {
    return builtinDeploymentTemplates()
  }
}

export const saveCustomDeploymentTemplates = (templates: DeploymentTemplate[]) => {
  window.localStorage.setItem(
    DEPLOYMENT_TEMPLATE_STORAGE_KEY,
    JSON.stringify(templates.filter((item) => !item.builtin)),
  )
}

export const createTemplateDraft = (): DeploymentTemplate => ({
  id: crypto.randomUUID(),
  name: '',
  description: '',
  steps: createSpringBootJarSteps(),
  updatedAt: new Date().toISOString(),
})

export const probeStatusMeta = (status: string) => {
  switch (status) {
    case 'success': return {label: '通过', color: 'green'}
    case 'alive': return {label: '存活', color: 'green'}
    case 'open': return {label: '已监听', color: 'green'}
    case 'failed': return {label: '失败', color: 'red'}
    case 'dead': return {label: '已退出', color: 'red'}
    case 'closed': return {label: '未监听', color: 'red'}
    case 'warning': return {label: '告警', color: 'gold'}
    case 'checking': return {label: '检测中', color: 'processing'}
    case 'unknown': return {label: '未知', color: 'default'}
    default: return {label: status, color: 'default'}
  }
}

export const probeTypeLabel = (type: string) => {
  switch (type) {
    case 'process': return '进程探针'
    case 'port': return '端口探针'
    case 'http': return 'HTTP 探针'
    case 'log': return '日志探针'
    case 'timeout': return '超时'
    default: return type
  }
}

export const deploymentStageStatus = (status: DeploymentStage['status']) => {
  switch (status) {
    case 'success': return 'finish'
    case 'failed': return 'error'
    case 'cancelled': return 'error'
    case 'timeout': return 'error'
    case 'running': return 'process'
    case 'checking': return 'process'
    case 'waiting': return 'process'
    default: return 'wait'
  }
}

export const deploymentTaskFinished = (status?: string) =>
  Boolean(status && ['success', 'failed', 'timeout', 'cancelled'].includes(status))

export const deploymentTaskLabel = (status: string) => {
  switch (status) {
    case 'success': return '部署完成'
    case 'failed': return '部署失败'
    case 'timeout': return '部署超时'
    case 'cancelled': return '已停止'
    case 'waiting': return '等待中'
    default: return '部署中'
  }
}

export const profileArtifactName = (profile: DeploymentProfile) =>
  profile.remoteArtifactName?.trim() || profile.localArtifactPattern || '未配置产物'

export const profileArtifactBaseName = (profile: DeploymentProfile) =>
  profileArtifactName(profile).replace(/\.[^.]+$/, '')

export const profileLogSummary = (profile: DeploymentProfile) => {
  if (profile.enableDeployLog === false) {
    return '未输出部署日志'
  }
  if (profile.logPath?.trim()) {
    const trimmed = profile.logPath.trim()
    if (trimmed.toLowerCase().endsWith('.log') || trimmed.includes('*')) {
      return trimmed
    }
    const logName = profile.logNamingMode === 'fixed' && profile.logName?.trim()
      ? profile.logName.trim()
      : `${profileArtifactBaseName(profile)}-*`
    return `${trimmed.replace(/[\\/]+$/, '')}/${logName}.log`
  }
  if (profile.logNamingMode === 'fixed' && profile.logName?.trim()) {
    return `${profile.remoteDeployPath.replace(/[\\/]+$/, '')}/logs/${profile.logName}.log`
  }
  return `${profile.remoteDeployPath.replace(/[\\/]+$/, '')}/logs/${profileArtifactBaseName(profile)}-*.log`
}

export const profilePidSummary = (profile: DeploymentProfile) =>
  profile.startupProbe?.processProbe?.pidFile?.trim() || `${profileArtifactBaseName(profile)}.pid`

export const profileEnabledStepCount = (profile: DeploymentProfile) =>
  profile.deploymentSteps?.filter((step) => step.enabled).length
    ?? profile.customCommands?.filter((command) => command.enabled).length
    ?? 0

export const enabledProbeCount = (profile: DeploymentProfile) => {
  const probe = profile.startupProbe
  if (!probe || probe.enabled === false) {
    return 0
  }
  return [
    probe.processProbe?.enabled !== false,
    probe.portProbe?.enabled !== false,
    Boolean(probe.httpProbe?.enabled),
    probe.logProbe?.enabled !== false,
  ].filter(Boolean).length
}

export const deploymentTaskColor = (status: string) => {
  switch (status) {
    case 'success': return 'green'
    case 'failed': return 'red'
    case 'timeout': return 'red'
    case 'cancelled': return 'orange'
    case 'waiting': return 'processing'
    default: return 'processing'
  }
}

export const defaultDeploymentStages: DeploymentStage[] = [
  {key: 'upload', label: '上传产物', type: 'upload_file', status: 'pending', logs: []},
  {key: 'start', label: '启动服务', type: 'ssh_command', status: 'pending', logs: []},
  {key: 'health', label: '健康检查', type: 'http_check', status: 'pending', logs: []},
]

export const deploymentProgressCurrent = (stages: DeploymentStage[]) =>
  summarizeDeploymentPipeline(stages).activeIndex

export const deploymentStageDescription = (stage: DeploymentStage) => {
  const parts = [
    stepTypeText(stage.type),
    stage.message,
    stage.durationMs ? `耗时 ${formatDuration(stage.durationMs)}` : '',
    stage.retryCount ? `重试 ${stage.currentRetry ?? 0}/${stage.retryCount}` : '',
  ].filter(Boolean)
  return parts.join(' · ')
}

export const formatUploadBytes = (bytes: number) => {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

export const collectArtifacts = (currentArtifacts: BuildArtifact[], historyArtifacts: BuildArtifact[]) => {
  const all = [...currentArtifacts, ...historyArtifacts]
  const seen = new Set<string>()
  return all.filter((artifact) => {
    if (seen.has(artifact.path)) {
      return false
    }
    seen.add(artifact.path)
    return true
  })
}

export const normalizePath = (value: string) => value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
