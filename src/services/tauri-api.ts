import {invoke} from '@tauri-apps/api/core'
import {listen} from '@tauri-apps/api/event'
import {getVersion} from '@tauri-apps/api/app'
import {open, save} from '@tauri-apps/plugin-dialog'
import {openUrl} from '@tauri-apps/plugin-opener'
import {check, type Update, type DownloadEvent} from '@tauri-apps/plugin-updater'
import {relaunch} from '@tauri-apps/plugin-process'
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
  NetworkInfo,
  PreflightPayload,
  PreflightResult,
  StartBuildPayload,
} from '../types/domain'

type TauriWindow = Window & { __TAURI_INTERNALS__?: unknown }

export type {Update, DownloadEvent}

export const isTauriRuntime = () =>
  typeof window !== 'undefined' &&
  Boolean((window as TauriWindow).__TAURI_INTERNALS__)

const requireTauri = () => {
  if (!isTauriRuntime()) {
    throw new Error('请在 Tauri 桌面应用中使用本功能。')
  }
}

// 应用内更新统一走官方 tauri-plugin-updater：检查端点按序为自建代理（与官方
// latest.json 同格式）与 GitHub 兜底，见 tauri.conf.json。下载、签名校验、
// 安装与重启由插件完成，Windows 上安装前自动退出进程，由 NSIS 安装器
// （passive 模式）接管并在完成后自动重启。
export async function checkForAppUpdate(): Promise<Update | null> {
  requireTauri()
  return check()
}

export async function getCurrentAppVersion(): Promise<string> {
  requireTauri()
  return getVersion()
}

export async function downloadAndInstallAppUpdate(
  update: Update,
  onEvent?: (event: DownloadEvent) => void,
): Promise<void> {
  requireTauri()
  await update.downloadAndInstall(onEvent)
}

export async function relaunchApp(): Promise<void> {
  requireTauri()
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

  detectEnvironment: (rootPath: string, forceRefresh?: boolean) =>
    invoke<BuildEnvironment>('detect_environment', { rootPath, forceRefresh }),

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

  /** 构建前预检：只读文件系统，用于拦截明显会失败的配置 */
  preflightBuild: (payload: PreflightPayload) =>
    invoke<PreflightResult>('preflight_build', { payload }),

  startBuild: (payload: StartBuildPayload) =>
    invoke<string>('start_build', { payload }),

  cancelBuild: (buildId: string) => invoke<void>('cancel_build', { buildId }),

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

  /** sinceMillis 传入构建开始时间时，只返回本次构建写过的产物 */
  scanBuildArtifacts: (projectRoot: string, modulePath: string, sinceMillis?: number) =>
    invoke<BuildArtifact[]>('scan_build_artifacts', { projectRoot, modulePath, sinceMillis }),

  deleteBuildArtifact: (path: string, recordOnly?: boolean, projectRoot?: string) =>
    invoke<void>('delete_build_artifact', {
      path,
      recordOnly: recordOnly ?? false,
      projectRoot,
    }),

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

  cancelDependencyScan: () => invoke<boolean>('cancel_dependency_scan'),

  generateExclusionCode: (groupId: string, artifactId: string) =>
    invoke<string>('generate_exclusion_code', { groupId, artifactId }),

  generateBulkExclusionCode: (conflicts: DependencyConflict[]) =>
    invoke<string>('generate_bulk_exclusion_code', { conflicts }),

  openExternalUrl: async (url: string) => {
    if (!isTauriRuntime()) {
      window.open(url, '_blank', 'noopener,noreferrer')
      return
    }
    await openUrl(url)
  },

  getNetworkInfo: () => invoke<NetworkInfo>('get_network_info'),

  // 数据与诊断
  backupAppData: (targetPath: string) =>
    invoke<string>('backup_app_data', { targetPath }),

  restoreAppData: (sourcePath: string) =>
    invoke<void>('restore_app_data', { sourcePath }),

  exportDiagnostics: (targetPath: string, content: string) =>
    invoke<string>('export_diagnostics', { targetPath, content }),

  openAppDataDir: () => invoke<void>('open_app_data_dir'),

  readTextFile: (path: string, maxBytes?: number) =>
    invoke<string>('read_text_file', { path, maxBytes }),
}

export async function registerBuildEvents(
  onLog: (event: BuildLogEvent) => void,
  onFinished: (event: BuildFinishedEvent) => void,
) {
  if (!isTauriRuntime()) {
    return () => undefined
  }

  let unlistenLog: (() => void) | undefined
  try {
    unlistenLog = await listen<BuildLogEvent>('build-log', (event) => {
      onLog(event.payload)
    })
    const unlistenFinished = await listen<BuildFinishedEvent>(
      'build-finished',
      (event) => {
        onFinished(event.payload)
      },
    )
    return () => {
      unlistenFinished()
      unlistenLog?.()
    }
  } catch (error) {
    unlistenLog?.()
    throw error
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
