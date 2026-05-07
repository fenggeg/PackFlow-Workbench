import {invoke} from '@tauri-apps/api/core'
import {listen} from '@tauri-apps/api/event'
import {BundleType, getBundleType, getVersion} from '@tauri-apps/api/app'
import {open} from '@tauri-apps/plugin-dialog'
import {relaunch} from '@tauri-apps/plugin-process'
import {check, type DownloadEvent, type Update} from '@tauri-apps/plugin-updater'
import type {
    BuildArtifact,
    BuildCommandPayload,
    BuildEnvironment,
    BuildFinishedEvent,
    BuildHistoryRecord,
    BuildLogEvent,
    BuildOptions,
    BuildTemplate,
    CommonCommand,
    DeploymentLogEvent,
    DeploymentProfile,
    DeploymentTask,
    EnvironmentSettings,
    FavoritePath,
    GitCommit,
    GitPullResult,
    GitRepositoryStatus,
    GitSwitchBranchResult,
    HighlightRule,
    LogSource,
    MavenProject,
    ModuleDependencyGraph,
    ProbeStatusEvent,
    ReleaseRecord,
    ReleaseTemplate,
    RemoteCommandResult,
    RemoteFileEntry,
    RemoteLogLineEvent,
    RemoteLogSession,
    SaveServerProfilePayload,
    ServerGroup,
    ServerProfile,
    ServiceOperationHistory,
    ServiceOperationLogEvent,
    ServiceOperationTask,
    ServiceRuntimeConfig,
    StartBuildPayload,
    StartDeploymentPayload,
    UploadProgressEvent,
} from '../types/domain'

type TauriWindow = Window & { __TAURI_INTERNALS__?: unknown }

export type AppUpdateDownloadEvent = DownloadEvent

export const isTauriRuntime = () =>
  typeof window !== 'undefined' &&
  Boolean((window as TauriWindow).__TAURI_INTERNALS__)

const requireTauri = () => {
  if (!isTauriRuntime()) {
    throw new Error('请在 Tauri 桌面应用中使用本功能。')
  }
}

const getWindowsUpdaterTarget = async () => {
  try {
    const bundleType = await getBundleType()

    if (bundleType === BundleType.Nsis) {
      return 'windows-x86_64-nsis'
    }

    if (bundleType === BundleType.Msi) {
      return 'windows-x86_64-msi'
    }
  } catch {
    return undefined
  }

  return undefined
}

export async function checkForAppUpdate(): Promise<Update | null> {
  requireTauri()
  const target = await getWindowsUpdaterTarget()

  return check({
    timeout: 30000,
    ...(target ? { target } : {}),
  })
}

export async function getCurrentAppVersion(): Promise<string> {
  requireTauri()
  return getVersion()
}

export async function installAppUpdate(
  update: Update,
  onEvent: (event: DownloadEvent) => void,
  onDownloaded?: () => void,
): Promise<void> {
  requireTauri()
  await update.download(onEvent, { timeout: 300000 })
  onDownloaded?.()
  await update.install()
  await relaunch()
}

export async function selectProjectDirectory(): Promise<string | null> {
  requireTauri()
  const selected = await open({
    directory: true,
    multiple: false,
    title: '选择 Maven 多模块项目根目录',
  })

  return typeof selected === 'string' ? selected : null
}

export async function selectLocalDirectory(title: string): Promise<string | null> {
  requireTauri()
  const selected = await open({
    directory: true,
    multiple: false,
    title,
  })

  return typeof selected === 'string' ? selected : null
}

export async function selectLocalFile(title: string): Promise<string | null> {
  requireTauri()
  const selected = await open({
    directory: false,
    multiple: false,
    title,
  })

  return typeof selected === 'string' ? selected : null
}

export const api = {
  parseMavenProject: (rootPath: string) =>
    invoke<MavenProject>('parse_maven_project', { rootPath }),

  analyzeProjectDependencies: (rootPath: string) =>
    invoke<ModuleDependencyGraph>('analyze_project_dependencies', { rootPath }),

  detectEnvironment: (rootPath: string) =>
    invoke<BuildEnvironment>('detect_environment', { rootPath }),

  loadEnvironmentSettings: () =>
    invoke<EnvironmentSettings>('load_environment_settings'),

  saveEnvironmentSettings: (settings: EnvironmentSettings) =>
    invoke<void>('save_environment_settings', { settings }),

  saveLastProjectPath: (rootPath: string) =>
    invoke<void>('save_last_project_path', { rootPath }),

  removeSavedProjectPath: (rootPath: string) =>
    invoke<EnvironmentSettings>('remove_saved_project_path', { rootPath }),

  buildCommandPreview: (payload: BuildCommandPayload) =>
    invoke<string>('build_command_preview', { payload }),

  startBuild: (payload: StartBuildPayload) =>
    invoke<string>('start_build', { payload }),

  cancelBuild: (buildId: string) => invoke<void>('cancel_build', { buildId }),

  listBuildHistory: () => invoke<BuildHistoryRecord[]>('list_build_history'),

  saveBuildHistory: (record: BuildHistoryRecord) =>
    invoke<void>('save_build_history', { record }),

  listTemplates: () => invoke<BuildTemplate[]>('list_templates'),

  saveTemplate: (template: BuildTemplate) =>
    invoke<void>('save_template', { template }),

  deleteTemplate: (templateId: string) =>
    invoke<void>('delete_template', { templateId }),

  listReleaseTemplates: () =>
    invoke<ReleaseTemplate[]>('list_release_templates'),

  saveReleaseTemplate: (template: ReleaseTemplate) =>
    invoke<ReleaseTemplate>('save_release_template', { template }),

  deleteReleaseTemplate: (templateId: string) =>
    invoke<void>('delete_release_template', { templateId }),

  listReleaseRecords: () =>
    invoke<ReleaseRecord[]>('list_release_records'),

  saveReleaseRecord: (record: ReleaseRecord) =>
    invoke<void>('save_release_record', { record }),

  deleteReleaseRecord: (recordId: string) =>
    invoke<void>('delete_release_record', { recordId }),

  listServerProfiles: () => invoke<ServerProfile[]>('list_server_profiles'),

  saveServerProfile: (payload: SaveServerProfilePayload) =>
    invoke<ServerProfile>('save_server_profile', { payload }),

  deleteServerProfile: (serverId: string) =>
    invoke<void>('delete_server_profile', { serverId }),

  testServerConnection: (serverId: string) =>
    invoke<string>('test_server_connection', { serverId }),

  listDeploymentProfiles: () =>
    invoke<DeploymentProfile[]>('list_deployment_profiles'),

  saveDeploymentProfile: (profile: DeploymentProfile) =>
    invoke<DeploymentProfile>('save_deployment_profile', { profile }),

  deleteDeploymentProfile: (profileId: string) =>
    invoke<void>('delete_deployment_profile', { profileId }),

  listDeploymentTasks: () =>
    invoke<DeploymentTask[]>('list_deployment_tasks'),

  startDeployment: (payload: StartDeploymentPayload) =>
    invoke<string>('start_deployment', { payload }),

  cancelDeployment: (taskId: string) =>
    invoke<void>('cancel_deployment', { taskId }),

  deleteDeploymentTask: (taskId: string) =>
    invoke<void>('delete_deployment_task', { taskId }),

  listServiceRuntimeConfigs: () =>
    invoke<ServiceRuntimeConfig[]>('list_service_runtime_configs'),

  saveServiceRuntimeConfig: (config: ServiceRuntimeConfig) =>
    invoke<ServiceRuntimeConfig>('save_service_runtime_config', { config }),

  deleteServiceRuntimeConfig: (configId: string) =>
    invoke<void>('delete_service_runtime_config', { configId }),

  listServiceOperationHistories: () =>
    invoke<ServiceOperationHistory[]>('list_service_operation_histories'),

  startServiceRestart: (serviceRuntimeConfigId: string) =>
    invoke<string>('start_service_restart', { payload: { serviceRuntimeConfigId } }),

  startServiceHealthCheck: (serviceRuntimeConfigId: string) =>
    invoke<string>('start_service_health_check', { payload: { serviceRuntimeConfigId } }),

  startRemoteLogSession: (serviceRuntimeConfigId: string, tailLines?: number, keyword?: string) =>
    invoke<RemoteLogSession>('start_remote_log_session', { payload: { serviceRuntimeConfigId, tailLines, keyword } }),

  stopRemoteLogSession: (sessionId: string) =>
    invoke<void>('stop_remote_log_session', { sessionId }),

  openPathInExplorer: (path: string) =>
    invoke<void>('open_path_in_explorer', { path }),

  scanBuildArtifacts: (projectRoot: string, modulePath: string) =>
    invoke<BuildArtifact[]>('scan_build_artifacts', { projectRoot, modulePath }),

  deleteBuildArtifact: (path: string) =>
    invoke<void>('delete_build_artifact', { path }),

  checkGitStatus: (rootPath: string) =>
    invoke<GitRepositoryStatus>('check_git_status', { rootPath }),

  listGitCommits: (rootPath: string, limit = 30) =>
    invoke<GitCommit[]>('list_git_commits', { rootPath, limit }),

  fetchGitUpdates: (rootPath: string) =>
    invoke<GitRepositoryStatus>('fetch_git_updates', { rootPath }),

  pullGitUpdates: (rootPath: string) =>
    invoke<GitPullResult>('pull_git_updates', { rootPath }),

  switchGitBranch: (rootPath: string, branchName: string) =>
    invoke<GitSwitchBranchResult>('switch_git_branch', { rootPath, branchName }),

  // Server Groups
  listServerGroups: () =>
    invoke<ServerGroup[]>('list_server_groups'),

  saveServerGroup: (group: ServerGroup) =>
    invoke<ServerGroup>('save_server_group', { group }),

  deleteServerGroup: (groupId: string) =>
    invoke<void>('delete_server_group', { groupId }),

  // Favorite Paths
  listFavoritePaths: (serverId: string) =>
    invoke<FavoritePath[]>('list_favorite_paths', { serverId }),

  saveFavoritePath: (path: FavoritePath) =>
    invoke<FavoritePath>('save_favorite_path', { path }),

  deleteFavoritePath: (pathId: string) =>
    invoke<void>('delete_favorite_path', { pathId }),

  // Common Commands
  listCommonCommands: (serverId?: string) =>
    invoke<CommonCommand[]>('list_common_commands', { serverId }),

  saveCommonCommand: (command: CommonCommand) =>
    invoke<CommonCommand>('save_common_command', { command }),

  deleteCommonCommand: (commandId: string) =>
    invoke<void>('delete_common_command', { commandId }),

  // Log Sources
  listLogSources: (serverId: string) =>
    invoke<LogSource[]>('list_log_sources', { serverId }),

  saveLogSource: (source: LogSource) =>
    invoke<LogSource>('save_log_source', { source }),

  deleteLogSource: (sourceId: string) =>
    invoke<void>('delete_log_source', { sourceId }),

  // Highlight Rules
  listHighlightRules: (serverId?: string) =>
    invoke<HighlightRule[]>('list_highlight_rules', { serverId }),

  saveHighlightRule: (rule: HighlightRule) =>
    invoke<HighlightRule>('save_highlight_rule', { rule }),

  deleteHighlightRule: (ruleId: string) =>
    invoke<void>('delete_highlight_rule', { ruleId }),

  // Remote Operations
  executeRemoteCommand: (serverId: string, command: string) =>
    invoke<RemoteCommandResult>('execute_remote_command', { serverId, command }),

  listRemoteFiles: (serverId: string, path: string) =>
    invoke<RemoteFileEntry[]>('list_remote_files', { serverId, path }),

  deleteRemoteFile: (serverId: string, path: string) =>
    invoke<void>('delete_remote_file', { serverId, path }),

  renameRemoteFile: (serverId: string, oldPath: string, newPath: string) =>
    invoke<void>('rename_remote_file', { serverId, oldPath, newPath }),

  createRemoteDirectory: (serverId: string, path: string) =>
    invoke<void>('create_remote_directory', { serverId, path }),

  readRemoteLogLines: (serverId: string, logPath: string, lines: number) =>
    invoke<string[]>('read_remote_log_lines', { serverId, logPath, lines }),

  // Terminal
  createTerminalSession: (serverId: string, cols: number, rows: number) =>
    invoke<string>('create_terminal_session', { serverId, cols, rows }),

  writeTerminalInput: (sessionId: string, data: number[]) =>
    invoke<void>('write_terminal_input', { sessionId, data }),

  readTerminalOutput: (sessionId: string) =>
    invoke<number[]>('read_terminal_output', { sessionId }),

  resizeTerminal: (sessionId: string, cols: number, rows: number) =>
    invoke<void>('resize_terminal', { sessionId, cols, rows }),

  closeTerminalSession: (sessionId: string) =>
    invoke<void>('close_terminal_session', { sessionId }),

  checkTerminalAlive: (sessionId: string) =>
    invoke<boolean>('check_terminal_alive', { sessionId }),
}

export async function registerBuildEvents(
  onLog: (event: BuildLogEvent) => void,
  onFinished: (event: BuildFinishedEvent) => void,
) {
  if (!isTauriRuntime()) {
    return () => undefined
  }

  const unlistenLog = await listen<BuildLogEvent>('build-log', (event) => {
    onLog(event.payload)
  })
  const unlistenFinished = await listen<BuildFinishedEvent>(
    'build-finished',
    (event) => {
      onFinished(event.payload)
    },
  )

  return () => {
    unlistenLog()
    unlistenFinished()
  }
}

export async function registerDeploymentEvents(
  onLog: (event: DeploymentLogEvent) => void,
  onUpdated: (event: DeploymentTask) => void,
  onFinished: (event: DeploymentTask) => void,
  onProbeStatus?: (event: ProbeStatusEvent) => void,
  onUploadProgress?: (event: UploadProgressEvent) => void,
) {
  if (!isTauriRuntime()) {
    return () => undefined
  }

  const unlistenLog = await listen<DeploymentLogEvent>('deployment-log', (event) => {
    onLog(event.payload)
  })
  const unlistenUpdated = await listen<DeploymentTask>('deployment-updated', (event) => {
    onUpdated(event.payload)
  })
  const unlistenFinished = await listen<DeploymentTask>('deployment-finished', (event) => {
    onFinished(event.payload)
  })
  const unlistenProbeStatus = onProbeStatus
    ? await listen<ProbeStatusEvent>('probe-status', (event) => {
        onProbeStatus(event.payload)
      })
    : undefined
  const unlistenUploadProgress = onUploadProgress
    ? await listen<UploadProgressEvent>('deployment_upload_progress', (event) => {
        onUploadProgress(event.payload)
      })
    : undefined

  return () => {
    unlistenLog()
    unlistenUpdated()
    unlistenFinished()
    unlistenProbeStatus?.()
    unlistenUploadProgress?.()
  }
}

export async function registerServiceOpsEvents(
  onOperationLog: (event: ServiceOperationLogEvent) => void,
  onOperationUpdated: (event: ServiceOperationTask) => void,
  onOperationFinished: (event: ServiceOperationTask) => void,
  onRemoteLogLine: (event: RemoteLogLineEvent) => void,
  onRemoteLogSessionUpdated: (event: RemoteLogSession) => void,
) {
  if (!isTauriRuntime()) {
    return () => undefined
  }

  const unlistenOperationLog = await listen<ServiceOperationLogEvent>('service-operation-log', (event) => {
    onOperationLog(event.payload)
  })
  const unlistenOperationUpdated = await listen<ServiceOperationTask>('service-operation-updated', (event) => {
    onOperationUpdated(event.payload)
  })
  const unlistenOperationFinished = await listen<ServiceOperationTask>('service-operation-finished', (event) => {
    onOperationFinished(event.payload)
  })
  const unlistenRemoteLogLine = await listen<RemoteLogLineEvent>('remote-log-line', (event) => {
    onRemoteLogLine(event.payload)
  })
  const unlistenRemoteLogSession = await listen<RemoteLogSession>('remote-log-session-updated', (event) => {
    onRemoteLogSessionUpdated(event.payload)
  })

  return () => {
    unlistenOperationLog()
    unlistenOperationUpdated()
    unlistenOperationFinished()
    unlistenRemoteLogLine()
    unlistenRemoteLogSession()
  }
}

export function createDefaultBuildOptions(
  projectRoot = '',
  selectedModulePath = '',
): BuildOptions {
  return {
    projectRoot,
    selectedModulePath,
    goals: ['clean', 'package'],
    profiles: [],
    properties: {},
    alsoMake: true,
    skipTests: true,
    customArgs: [],
    editableCommand: '',
  }
}
