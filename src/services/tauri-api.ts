import {invoke} from '@tauri-apps/api/core'
import {listen} from '@tauri-apps/api/event'
import {getVersion} from '@tauri-apps/api/app'
import {open, save} from '@tauri-apps/plugin-dialog'
import type {
  BuildArtifact,
  BuildCommandPayload,
  BuildEnvironment,
  BuildFinishedEvent,
  BuildHistoryRecord,
  BuildLogEvent,
  BuildOptions,
  BuildTemplate,
  DependencyConflict,
  DependencyConflictResult,
  EnvironmentSettings,
  GitCommit,
  GitPullResult,
  GitRepositoryStatus,
  GitSwitchBranchResult,
  JdkEntry,
  MavenProject,
  ModuleDependencyGraph,
  StartBuildPayload,
} from '../types/domain'

type TauriWindow = Window & { __TAURI_INTERNALS__?: unknown }

export interface AppUpdateInfo {
  currentVersion: string
  version: string
  date?: string
  body?: string
  downloadUrl: string
  apiDownloadUrl?: string
  fileSize?: number
  fileName: string
  downloaded: boolean
}

export type AppUpdateDownloadEvent =
  | { event: 'Started'; data: { contentLength?: number } }
  | { event: 'Progress'; data: { chunkLength: number } }
  | { event: 'Finished' }

export const isTauriRuntime = () =>
  typeof window !== 'undefined' &&
  Boolean((window as TauriWindow).__TAURI_INTERNALS__)

const requireTauri = () => {
  if (!isTauriRuntime()) {
    throw new Error('请在 Tauri 桌面应用中使用本功能。')
  }
}

export async function checkForAppUpdate(): Promise<AppUpdateInfo | null> {
  requireTauri()
  const currentVersion = await getVersion()
  return invoke<AppUpdateInfo | null>('check_for_app_update', { currentVersion })
}

export async function getCurrentAppVersion(): Promise<string> {
  requireTauri()
  return getVersion()
}

export async function downloadAppUpdate(
  update: AppUpdateInfo,
  onEvent: (event: AppUpdateDownloadEvent) => void,
  onDownloaded?: () => void,
): Promise<void> {
  requireTauri()

  const unlisten = await listen<AppUpdateDownloadEvent>(
    'app-update-download-event',
    (event) => {
      onEvent(event.payload)
      if (event.payload.event === 'Finished') {
        onDownloaded?.()
      }
    },
  )

  try {
    await invoke('download_app_update', {
      downloadUrl: update.downloadUrl,
      apiDownloadUrl: update.apiDownloadUrl,
      expectedSize: update.fileSize,
      fileName: update.fileName,
    })
  } finally {
    unlisten()
  }
}

export async function installCachedAppUpdate(update: AppUpdateInfo): Promise<void> {
  requireTauri()
  await invoke('install_cached_app_update', {
    fileName: update.fileName,
    expectedSize: update.fileSize,
  })
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

export async function selectSavePath(title: string, defaultFilename?: string): Promise<string | null> {
  requireTauri()
  const selected = await save({
    title,
    defaultPath: defaultFilename,
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

  bindProjectProfile: (projectPath: string, profileId: string) =>
    invoke<void>('bind_project_profile', { projectPath, profileId }),

  unbindProjectProfile: (projectPath: string) =>
    invoke<void>('unbind_project_profile', { projectPath }),

  buildCommandPreview: (payload: BuildCommandPayload) =>
    invoke<string>('build_command_preview', { payload }),

  startBuild: (payload: StartBuildPayload) =>
    invoke<string>('start_build', { payload }),

  cancelBuild: (buildId: string) => invoke<void>('cancel_build', { buildId }),

  setMaxConcurrentBuilds: (max: number | null) =>
    invoke<void>('set_max_concurrent_builds', { max }),

  getMaxConcurrentBuilds: () => invoke<number>('get_max_concurrent_builds'),

  getRunningBuildCount: () => invoke<number>('get_running_build_count'),

  listBuildHistory: () => invoke<BuildHistoryRecord[]>('list_build_history'),

  saveBuildHistory: (record: BuildHistoryRecord) =>
    invoke<void>('save_build_history', { record }),

  deleteBuildHistory: (historyId: string) =>
    invoke<void>('delete_build_history', { historyId }),

  listTemplates: () => invoke<BuildTemplate[]>('list_templates'),

  saveTemplate: (template: BuildTemplate) =>
    invoke<void>('save_template', { template }),

  deleteTemplate: (templateId: string) =>
    invoke<void>('delete_template', { templateId }),

  openPathInExplorer: (path: string) =>
    invoke<void>('open_path_in_explorer', { path }),

  scanBuildArtifacts: (projectRoot: string, modulePath: string) =>
    invoke<BuildArtifact[]>('scan_build_artifacts', { projectRoot, modulePath }),

  deleteBuildArtifact: (path: string, recordOnly?: boolean) =>
    invoke<void>('delete_build_artifact', { path, recordOnly: recordOnly ?? false }),

  checkFilesExist: (paths: string[]) =>
    invoke<string[]>('check_files_exist', { paths }),

  copyFileToClipboard: (path: string) =>
    invoke<void>('copy_file_to_clipboard', { path }),

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

  // JDK Registry
  scanSystemJdks: () =>
    invoke<JdkEntry[]>('scan_system_jdks'),

  addJdkToRegistry: (path: string, name?: string) =>
    invoke<JdkEntry>('add_jdk_to_registry', { path, name }),

  removeJdkFromRegistry: (jdkId: string) =>
    invoke<void>('remove_jdk_from_registry', { jdkId }),

  setDefaultJdk: (jdkId: string) =>
    invoke<void>('set_default_jdk', { jdkId }),

  // Dependency Conflict Detection
  detectDependencyConflicts: (rootPath: string) =>
    invoke<DependencyConflictResult>('detect_dependency_conflicts', { rootPath }),

  generateExclusionCode: (groupId: string, artifactId: string) =>
    invoke<string>('generate_exclusion_code', { groupId, artifactId }),

  generateBulkExclusionCode: (conflicts: DependencyConflict[]) =>
    invoke<string>('generate_bulk_exclusion_code', { conflicts }),
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
