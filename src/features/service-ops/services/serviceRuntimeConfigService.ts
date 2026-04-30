import type {
    DeploymentCustomCommand,
    DeploymentProfile,
    DeployStep,
    ServerProfile,
    ServiceLogConfig,
    ServiceRuntimeConfig,
} from '../../../types/domain'

const commandFromStep = (step: DeployStep): string | undefined => {
  if (step.type !== 'ssh_command') {
    return undefined
  }
  const config = step.config as {command?: string}
  return config.command?.trim() || undefined
}

interface RuntimeCommandCandidate {
  name: string
  stage?: string
  command?: string
  order: number
}

type RuntimeCommandKind = 'restart' | 'stop' | 'start'

const nameMatches = (name: string, stage: string | undefined, kind: RuntimeCommandKind) => {
  const lowerName = name.toLowerCase()
  const lowerStage = stage?.toLowerCase() ?? ''
  switch (kind) {
    case 'restart':
      return lowerStage.includes('restart') || lowerName.includes('restart') || name.includes('重启')
    case 'stop':
      return lowerStage === 'stop' || lowerName.includes('stop') || name.includes('停止')
    case 'start':
      return lowerStage === 'start' || lowerName.includes('start') || name.includes('启动')
  }
}

const commandMatches = (command: string, kind: RuntimeCommandKind) => {
  const lowerCommand = command.toLowerCase()
  switch (kind) {
    case 'restart':
      return /\b(systemctl|service|supervisorctl|pm2)\b[\s\S]*\brestart\b/.test(lowerCommand)
        || /(^|[\\/.\s_-])restart(\.sh)?($|[\s])/.test(lowerCommand)
    case 'stop':
      return /\b(systemctl|service|supervisorctl|pm2)\b[\s\S]*\bstop\b/.test(lowerCommand)
        || /(^|[\\/.\s_-])stop(\.sh)?($|[\s])/.test(lowerCommand)
    case 'start':
      return /\b(systemctl|service|supervisorctl|pm2)\b[\s\S]*\bstart\b/.test(lowerCommand)
        || /(^|[\\/.\s_-])start(\.sh)?($|[\s])/.test(lowerCommand)
  }
}

const commandLooksLikeStop = (command?: string) => {
  const text = command?.toLowerCase() ?? ''
  return Boolean(text.match(/\bkill\b|\bpkill\b|\bfuser\b|\bstop\b|停止服务|停止进程|端口 java 进程清理/))
}

const commandLooksLikeStart = (command?: string) => {
  const text = command?.toLowerCase() ?? ''
  return Boolean(text.match(/\bnohup\b|\bjava\b[\s\S]*\b-jar\b|\bsystemctl\b[\s\S]*\bstart\b|\bservice\b[\s\S]*\bstart\b|\bstart\.sh\b|启动服务/))
}

const deploymentStepCandidates = (steps: DeployStep[]): RuntimeCommandCandidate[] =>
  steps
    .filter((step) => step.enabled !== false)
    .sort((left, right) => left.order - right.order)
    .map((step) => ({
      name: step.name,
      command: commandFromStep(step),
      order: step.order,
    }))

const customCommandCandidates = (commands: DeploymentCustomCommand[]): RuntimeCommandCandidate[] =>
  commands
    .filter((command) => command.enabled !== false)
    .map((command, index) => ({
      name: command.name,
      stage: command.stage,
      command: command.command?.trim() || undefined,
      order: index,
    }))

const findCommand = (profile: DeploymentProfile, kind: RuntimeCommandKind) => {
  const candidates = [
    ...deploymentStepCandidates(profile.deploymentSteps ?? []),
    ...customCommandCandidates(profile.customCommands ?? []),
  ]
  const namedMatch = candidates.find((candidate) =>
    nameMatches(candidate.name, candidate.stage, kind)
    && candidate.command
    && !(kind === 'start' && commandLooksLikeStop(candidate.command) && !commandLooksLikeStart(candidate.command))
    && !(kind === 'stop' && commandLooksLikeStart(candidate.command) && !commandLooksLikeStop(candidate.command)))
  if (namedMatch) {
    return namedMatch.command
  }
  const commandMatch = candidates.find((candidate) =>
    candidate.command ? commandMatches(candidate.command, kind) : false)
  return commandMatch?.command
}

const combineRestartCommand = (stopCommand?: string, startCommand?: string) => {
  const stop = stopCommand?.trim()
  const start = startCommand?.trim()
  if (!stop || !start || stop === start) {
    return undefined
  }
  return [stop, 'sleep 2', start].join('\n')
}

const concreteLogPath = (value?: string) => {
  const trimmed = value?.trim()
  if (!trimmed || trimmed.includes('${')) {
    return undefined
  }
  return trimmed
}

const deriveLogSource = (profile: DeploymentProfile): ServiceLogConfig | undefined => {
  const configuredPath = concreteLogPath(profile.logPath)
    ?? concreteLogPath(profile.startupProbe?.logProbe?.logPath)
  if (configuredPath) {
    return {type: 'file', logPath: configuredPath, tailLines: 300}
  }
  if (profile.remoteDeployPath?.trim()) {
    return {type: 'file', logPath: `${profile.remoteDeployPath.replace(/[\\/]+$/, '')}/logs/*.log`, tailLines: 300}
  }
  return undefined
}

export const getEnvironmentId = (server: ServerProfile) =>
  server.group?.trim() || '默认环境'

export const isHighRiskEnvironment = (environmentName: string) => {
  const text = environmentName.toLowerCase()
  return ['prod', 'production', '生产'].some((keyword) => text.includes(keyword))
}

export const isPreRiskEnvironment = (environmentName: string) => {
  const text = environmentName.toLowerCase()
  return ['pre', 'staging', 'stage', '预发', '灰度'].some((keyword) => text.includes(keyword))
}

export const deriveRuntimeConfig = (
  profile: DeploymentProfile,
  server: ServerProfile,
  existing?: ServiceRuntimeConfig,
): ServiceRuntimeConfig => {
  const serviceName = profile.serviceAlias?.trim() || profile.name || profile.moduleArtifactId || profile.moduleId
  const environmentId = getEnvironmentId(server)
  const derivedStopCommand = findCommand(profile, 'stop')
  const derivedStartCommand = findCommand(profile, 'start')
  const stopCommand = existing?.stopCommand ?? derivedStopCommand
  const existingStartInvalid = Boolean(
    existing?.startCommand?.trim()
    && (
      existing.startCommand.trim() === stopCommand?.trim()
      || (commandLooksLikeStop(existing.startCommand) && !commandLooksLikeStart(existing.startCommand))
    ),
  )
  const startCommand = existingStartInvalid ? derivedStartCommand : (existing?.startCommand ?? derivedStartCommand)
  const existingRestartInvalid = Boolean(
    existing?.restartCommand?.trim()
    && commandLooksLikeStop(existing.restartCommand)
    && !commandLooksLikeStart(existing.restartCommand)
    && !existing.restartCommand.includes('\n'),
  )
  const restartCommand = existingRestartInvalid ? undefined : existing?.restartCommand
    ?? findCommand(profile, 'restart')
    ?? combineRestartCommand(stopCommand, startCommand)
  return {
    id: existing?.id ?? crypto.randomUUID(),
    serviceMappingId: profile.id,
    deploymentProfileId: profile.id,
    environmentId,
    serverId: server.id,
    serviceName,
    restartCommand,
    stopCommand,
    startCommand,
    logSource: existing?.logSource ?? deriveLogSource(profile),
    statusCommand: existing?.statusCommand,
    healthCheckUrl: existing?.healthCheckUrl
      ?? (profile.startupProbe?.httpProbe?.enabled ? profile.startupProbe.httpProbe.url : undefined),
    workDir: existing?.workDir ?? profile.workingDir ?? profile.remoteDeployPath,
    createdAt: existing?.createdAt,
    updatedAt: existing?.updatedAt,
  }
}

export const runtimeConfigKey = (profileId: string, serverId: string, environmentId: string) =>
  `${profileId}:${environmentId}:${serverId}`

export const hasRestartCommand = (config?: ServiceRuntimeConfig) =>
  Boolean(config?.restartCommand?.trim() || (config?.stopCommand?.trim() && config?.startCommand?.trim()))

export const hasLogSource = (config?: ServiceRuntimeConfig) => {
  const source = config?.logSource
  if (!source) {
    return Boolean(config?.workDir?.trim())
  }
  if (source.type === 'custom') return Boolean(source.customCommand?.trim())
  if (source.type === 'file') return Boolean(source.logPath?.trim())
  if (source.type === 'systemd') return Boolean(source.systemdUnit?.trim())
  if (source.type === 'docker') return Boolean(source.dockerContainerName?.trim())
  return false
}
