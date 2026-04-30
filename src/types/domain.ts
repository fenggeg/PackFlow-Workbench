export type BuildStatus = 'IDLE' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED'

export type PersistedBuildStatus = 'SUCCESS' | 'FAILED' | 'CANCELLED'

export interface MavenProject {
  rootPath: string
  rootPomPath: string
  groupId?: string
  artifactId: string
  version?: string
  packaging?: string
  modules: MavenModule[]
}

export interface MavenModule {
  id: string
  name?: string
  artifactId: string
  groupId?: string
  version?: string
  packaging?: string
  relativePath: string
  pomPath: string
  children?: MavenModule[]
  errorMessage?: string
}

export interface ModuleDependencyEdge {
  fromModuleId: string
  toModuleId: string
  type: 'compile' | 'test' | 'runtime' | 'provided' | 'parent' | 'aggregation' | string
}

export interface ModuleDependencySummary {
  moduleId: string
  packaging?: string
  dependencies: string[]
  dependents: string[]
  aggregationChildren: string[]
  aggregationParent?: string
  releaseCandidateModuleIds: string[]
  requiredBuildModuleIds: string[]
  suggestedValidationModuleIds: string[]
  relatedAggregationModuleIds: string[]
  recommendedModuleIds: string[]
  hasCycle: boolean
  cyclePaths: string[][]
}

export interface ModuleDependencyGraph {
  rootPath: string
  edges: ModuleDependencyEdge[]
  summaries: ModuleDependencySummary[]
  cycles: string[][]
}

export interface GitBranch {
  name: string
  isCurrent: boolean
}

export interface GitRepositoryStatus {
  isGitRepo: boolean
  branch?: string
  branches: GitBranch[]
  upstream?: string
  aheadCount: number
  behindCount: number
  hasRemoteUpdates: boolean
  hasLocalChanges: boolean
  message?: string
}

export interface GitCommit {
  hash: string
  shortHash: string
  author: string
  date: string
  subject: string
}

export interface GitPullResult {
  success: boolean
  output: string
  status: GitRepositoryStatus
}

export interface GitSwitchBranchResult {
  success: boolean
  output: string
  status: GitRepositoryStatus
}

export interface BuildEnvironment {
  javaHome?: string
  javaVersion?: string
  javaPath?: string
  javaSource: EnvironmentSource
  mavenHome?: string
  mavenVersion?: string
  mavenPath?: string
  mavenSource: EnvironmentSource
  settingsXmlPath?: string
  settingsXmlSource: EnvironmentSource
  localRepoPath?: string
  localRepoSource: EnvironmentSource
  hasMavenWrapper: boolean
  mavenWrapperPath?: string
  useMavenWrapper: boolean
  wrapperSource: EnvironmentSource
  gitPath?: string
  gitVersion?: string
  gitSource: EnvironmentSource
  status: EnvironmentStatus
  errors: string[]
}

export type EnvironmentStatus = 'ok' | 'warning' | 'error'

export type EnvironmentSource = 'auto' | 'manual' | 'wrapper' | 'missing'

export type BuildDiagnosisCategory =
  | 'jdk_mismatch'
  | 'maven_missing'
  | 'wrapper_issue'
  | 'settings_missing'
  | 'dependency_download_failed'
  | 'repo_unreachable'
  | 'profile_invalid'
  | 'module_invalid'
  | 'test_failed'
  | 'unknown'

export interface BuildDiagnosis {
  id: string
  taskId: string
  summary: string
  category: BuildDiagnosisCategory
  possibleCauses: string[]
  suggestedActions: string[]
  keywordLines: string[]
}

export interface BuildOptions {
  projectRoot: string
  selectedModulePath: string
  goals: string[]
  profiles: string[]
  properties: Record<string, string | boolean>
  alsoMake: boolean
  skipTests: boolean
  customArgs: string[]
  editableCommand: string
}

export interface BuildArtifact {
  path: string
  fileName: string
  extension: string
  sizeBytes: number
  modifiedAt?: string
  modulePath: string
}

export type DeploymentEnvironmentKind = 'test' | 'staging' | 'production' | 'custom'

export interface ServiceMapping {
  id: string
  moduleId: string
  serviceName: string
  artifactPattern: string
  deploymentProfileId?: string
  createdAt?: string
  updatedAt?: string
}

export interface DeploymentEnvironment {
  id: string
  name: string
  kind: DeploymentEnvironmentKind
  serverId: string
  status: 'unknown' | 'idle' | 'deploying' | 'healthy' | 'failed'
  updatedAt?: string
}

export interface DeploymentConfiguration {
  id: string
  serviceMappingId: string
  environmentId: string
  deploymentProfileId: string
  serverId: string
  remoteDeployPath: string
  artifactPattern: string
  healthCheckEnabled: boolean
  updatedAt?: string
}

export type LogSourceType = 'file' | 'systemd' | 'docker' | 'custom'

export interface ServiceLogConfig {
  type: LogSourceType
  logPath?: string
  systemdUnit?: string
  dockerContainerName?: string
  customCommand?: string
  tailLines: number
}

export interface ServiceRuntimeConfig {
  id: string
  serviceMappingId: string
  deploymentProfileId?: string
  environmentId: string
  serverId: string
  serviceName: string
  restartCommand?: string
  stopCommand?: string
  startCommand?: string
  logSource?: ServiceLogConfig
  statusCommand?: string
  healthCheckUrl?: string
  workDir?: string
  createdAt?: string
  updatedAt?: string
}

export type ServiceOperationType =
  | 'restart'
  | 'stop'
  | 'start'
  | 'view_log'
  | 'health_check'
  | 'status_check'

export type ServiceOperationStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'cancelled'

export interface ServiceOperationTask {
  id: string
  serviceRuntimeConfigId: string
  type: ServiceOperationType
  status: ServiceOperationStatus
  startedAt?: string
  finishedAt?: string
  command?: string
  outputLines: string[]
  errorMessage?: string
}

export type RemoteLogSessionStatus = 'connecting' | 'streaming' | 'stopped' | 'failed'

export interface RemoteLogSession {
  id: string
  serviceRuntimeConfigId: string
  serverId: string
  command: string
  status: RemoteLogSessionStatus
  startedAt: string
  stoppedAt?: string
  keyword?: string
  autoScroll: boolean
}

export interface ServiceOperationHistory {
  id: string
  operationType: ServiceOperationType
  serviceName: string
  environmentName: string
  serverHost: string
  command?: string
  result: 'success' | 'failed' | 'cancelled'
  startedAt: string
  finishedAt?: string
  operator?: string
  errorMessage?: string
}

export interface ServiceOperationLogEvent {
  taskId: string
  line: string
}

export interface RemoteLogLineEvent {
  sessionId: string
  line: string
}

export interface ModuleArtifactServiceLink {
  moduleId: string
  artifactPath?: string
  artifactName?: string
  serviceMappingId?: string
  environmentId?: string
  deploymentConfigurationId?: string
}

export interface BuildCommandPayload {
  options: BuildOptions
  environment: BuildEnvironment
}

export interface StartBuildPayload {
  projectRoot: string
  command: string
  modulePath: string
  moduleArtifactId?: string
  javaHome?: string
  mavenHome?: string
  useMavenWrapper: boolean
}

export interface BuildLogEvent {
  buildId: string
  stream: 'stdout' | 'stderr' | 'system'
  line: string
}

export interface BuildFinishedEvent {
  buildId: string
  status: PersistedBuildStatus
  durationMs: number
}

export interface BuildHistoryRecord {
  id: string
  createdAt: string
  projectRoot: string
  modulePath: string
  moduleArtifactId?: string
  command: string
  status: PersistedBuildStatus
  durationMs: number
  javaHome?: string
  mavenHome?: string
  useMavenWrapper: boolean
  buildOptions?: BuildOptions
  artifacts?: BuildArtifact[]
}

export interface BuildTemplate {
  id: string
  name: string
  projectRoot: string
  modulePath: string
  goals: string[]
  profiles: string[]
  properties: Record<string, string | boolean>
  alsoMake: boolean
  skipTests: boolean
  customArgs: string[]
  useMavenWrapper: boolean
  javaHome?: string
  mavenHome?: string
  createdAt?: string
  updatedAt?: string
  pinned?: boolean
}

export interface EnvironmentSettings {
  activeProfileId?: string
  profiles: EnvironmentProfile[]
  lastProjectPath?: string
  projectPaths?: string[]
}

export interface EnvironmentProfile {
  id: string
  name: string
  javaHome?: string
  mavenHome?: string
  settingsXmlPath?: string
  localRepoPath?: string
  useMavenWrapper: boolean
  updatedAt?: string
}

export interface ServerProfile {
  id: string
  name: string
  host: string
  port: number
  username: string
  authType: 'password' | 'private_key'
  privateKeyPath?: string
  group?: string
  passwordConfigured: boolean
  privilege: ServerPrivilegeConfig
  privilegePasswordConfigured: boolean
  createdAt?: string
  updatedAt?: string
}

export type ServerPrivilegeMode = 'none' | 'sudo' | 'sudo_i' | 'su' | 'custom'
export type ServerPrivilegePasswordMode = 'none' | 'login_password' | 'separate'

export interface ServerPrivilegeConfig {
  mode: ServerPrivilegeMode
  runAsUser: string
  passwordMode: ServerPrivilegePasswordMode
  uploadTempDir: string
  shell: string
  customWrapper?: string
  cleanupOnSuccess: boolean
  keepTempOnFailure: boolean
}

export interface SaveServerProfilePayload {
  id?: string
  name: string
  host: string
  port: number
  username: string
  authType: 'password' | 'private_key'
  password?: string
  privateKeyPath?: string
  group?: string
  privilege: ServerPrivilegeConfig
  privilegePassword?: string
}

export type DeploymentCustomCommandStage =
  | 'before_stop'
  | 'stop'
  | 'after_stop'
  | 'replace'
  | 'after_replace'
  | 'start'
  | 'after_start'
  | 'health_check'
  | 'after_health'

export interface DeploymentCustomCommand {
  id: string
  name: string
  command: string
  enabled: boolean
  stage: DeploymentCustomCommandStage
}

export type DeployStepType =
  | 'ssh_command'
  | 'wait'
  | 'port_check'
  | 'http_check'
  | 'log_check'
  | 'upload_file'
  | 'startup_probe'

export type DeployFailureStrategy = 'stop' | 'continue' | 'rollback'

export type DeployStepConfig =
  | {
      command: string
      successExitCodes?: number[]
    }
  | {
      waitSeconds: number
    }
  | {
      host: string
      port: number
      checkIntervalSeconds: number
    }
  | {
      url: string
      method: 'GET' | 'POST'
      headers?: Record<string, string>
      body?: string
      expectedStatusCodes?: number[]
      expectedBodyContains?: string
      checkIntervalSeconds: number
    }
  | {
      logPath: string
      successKeywords: string[]
      failureKeywords?: string[]
      checkIntervalSeconds: number
    }
  | {
      localPath: string
      remotePath: string
      overwrite: boolean
    }

export interface DeployStep {
  id: string
  enabled: boolean
  name: string
  type: DeployStepType
  order: number
  timeoutSeconds?: number
  retryCount?: number
  retryIntervalSeconds?: number
  failureStrategy?: DeployFailureStrategy
  config: DeployStepConfig
}

export interface ProcessProbeConfig {
  enabled: boolean
  pidFile?: string
}

export interface PortProbeConfig {
  enabled: boolean
  host: string
  port: number
  consecutiveSuccesses: number
}

export interface HttpProbeConfig {
  enabled: boolean
  url?: string
  method: string
  expectedStatusCodes?: number[]
  expectedBodyContains?: string
  consecutiveSuccesses: number
}

export interface LogProbeConfig {
  enabled: boolean
  logPath?: string
  successPatterns: string[]
  failurePatterns: string[]
  warningPatterns: string[]
  useRegex: boolean
  onlyCurrentDeployLog: boolean
}

export interface StartupProbeConfig {
  enabled: boolean
  timeoutSeconds: number
  intervalSeconds: number
  processProbe?: ProcessProbeConfig
  portProbe?: PortProbeConfig
  httpProbe?: HttpProbeConfig
  logProbe?: LogProbeConfig
  successPolicy: string
}

export interface ProbeStatus {
  probeType: string
  status: string
  message?: string
  checkCount?: number
  lastCheckAt?: string
}

export interface ProbeStatusEvent {
  taskId: string
  stageKey: string
  probeStatuses: ProbeStatus[]
}

export type LogNamingMode = 'date' | 'fixed'

export interface BackupConfig {
  enabled: boolean
  backupDir?: string
  retentionCount: number
  autoRollback: boolean
  restartAfterRollback: boolean
}

export interface DeploymentProfile {
  id: string
  name: string
  projectRoot: string
  moduleId: string
  modulePath: string
  moduleArtifactId: string
  localArtifactPattern: string
  remoteArtifactName?: string
  remoteDeployPath: string
  serviceDescription?: string
  serviceAlias?: string
  javaBinPath?: string
  jvmOptions?: string
  springProfile?: string
  extraArgs?: string
  workingDir?: string
  logPath?: string
  logNamingMode: LogNamingMode
  logName?: string
  logEncoding?: string
  enableDeployLog: boolean
  backupConfig: BackupConfig
  deploymentSteps: DeployStep[]
  customCommands: DeploymentCustomCommand[]
  startupProbe?: StartupProbeConfig
  createdAt?: string
  updatedAt?: string
}

export interface DeploymentStage {
  key: string
  label: string
  type?: DeployStepType | string
  status: 'pending' | 'waiting' | 'running' | 'checking' | 'success' | 'failed' | 'skipped' | 'timeout' | 'cancelled'
  startedAt?: string
  finishedAt?: string
  message?: string
  retryCount?: number
  currentRetry?: number
  durationMs?: number
  logs?: string[]
  probeStatuses?: ProbeStatus[]
}

export interface RollbackResult {
  executed: boolean
  success?: boolean
  message?: string
  restoredBackupPath?: string
  restartedOldVersion?: boolean
}

export interface DeploymentTask {
  id: string
  buildTaskId?: string
  projectRoot: string
  deploymentProfileId: string
  deploymentProfileName?: string
  serverId: string
  serverName?: string
  moduleId: string
  artifactPath: string
  artifactName: string
  status: 'pending' | 'uploading' | 'stopping' | 'starting' | 'checking' | 'waiting' | 'success' | 'failed' | 'timeout' | 'cancelled'
  log: string[]
  stages: DeploymentStage[]
  createdAt: string
  finishedAt?: string
  startupPid?: string
  startupLogPath?: string
  probeResult?: string
  backupPath?: string
  logOffsetBeforeStart?: number
  rollbackResult?: RollbackResult
}

export interface StartDeploymentPayload {
  deploymentProfileId: string
  serverId: string
  localArtifactPath: string
  buildTaskId?: string
}

export interface DeploymentLogEvent {
  taskId: string
  stageKey?: string
  line: string
}

export interface UploadProgressEvent {
  taskId: string
  stageKey: string
  percent: number
  uploadedBytes: number
  totalBytes: number
  speedBytesPerSecond?: number
  message: string
}
