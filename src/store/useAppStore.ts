import {create} from 'zustand'
import {api, createDefaultBuildOptions, isTauriRuntime, selectProjectDirectory} from '../services/tauri-api'
import {diagnoseBuildFailure} from '../services/buildDiagnosisService'
import {appendBoundedItems} from '../utils/boundedBuffer'
import {getErrorMessage} from '../utils/errors'
import {useEnvironmentStore} from './useEnvironmentStore'
import type {
    BuildArtifact,
    BuildDiagnosis,
    BuildEnvironment,
    BuildFinishedEvent,
    BuildHistoryRecord,
    BuildLogEvent,
    BuildOptions,
    BuildStatus,
    BuildTemplate,
    EnvironmentSettings,
    GitCommit,
    GitRepositoryStatus,
    JdkEntry,
    MavenModule,
    MavenProject,
    PersistedBuildStatus,
} from '../types/domain'

const flattenModules = (modules: MavenModule[]): MavenModule[] =>
  modules.flatMap((moduleItem) => [moduleItem, ...flattenModules(moduleItem.children ?? [])])

interface AppState {
  project?: MavenProject
  environment?: BuildEnvironment
  environmentSettings?: EnvironmentSettings
  selectedModule?: MavenModule
  selectedModules: MavenModule[]
  selectedModuleIds: string[]
  savedProjectPaths: string[]
  buildOptions: BuildOptions
  buildStatus: BuildStatus
  currentBuildId?: string
  buildRunToken?: string
  buildCancelling: boolean
  startedAt?: number
  durationMs: number
  logs: BuildLogEvent[]
  diagnosis?: BuildDiagnosis
  artifacts: BuildArtifact[]
  history: BuildHistoryRecord[]
  templates: BuildTemplate[]
  gitStatus?: GitRepositoryStatus
  gitCommits: GitCommit[]
  gitChecking: boolean
  gitCommitsLoading: boolean
  gitPulling: boolean
  gitSwitching: boolean
  gitError?: string
  loading: boolean
  error?: string
  initialized: boolean
  initialize: () => Promise<void>
  chooseProject: () => Promise<void>
  parseProjectPath: (rootPath: string) => Promise<void>
  removeSavedProject: (rootPath: string) => Promise<void>
  checkGitStatus: (rootPath?: string) => Promise<void>
  loadGitCommits: (rootPath?: string) => Promise<void>
  fetchGitUpdates: () => Promise<void>
  pullGitUpdates: () => Promise<void>
  switchGitBranch: (branchName: string) => Promise<void>
  clearGitError: () => void
  setSelectedModule: (moduleId: string) => void
  setSelectedModules: (moduleIds: string[]) => void
  selectAllProject: () => void
  setBuildOption: <K extends keyof BuildOptions>(
    key: K,
    value: BuildOptions[K],
  ) => void
  setEditableCommand: (command: string) => void
  refreshCommandPreview: () => Promise<void>
  refreshEnvironment: () => Promise<void>
  updateEnvironment: (settings: EnvironmentSettings) => Promise<void>
  applyEnvironmentProfile: (profileId: string) => Promise<void>
  saveEnvironmentProfile: (name: string) => Promise<void>
  deleteEnvironmentProfile: (profileId: string) => Promise<void>
  bindProjectProfile: (projectPath: string, profileId: string) => Promise<void>
  unbindProjectProfile: (projectPath: string) => Promise<void>
  getBoundProfileId: (projectPath: string) => string | undefined
  jdkRegistry: JdkEntry[]
  scanSystemJdks: () => Promise<void>
  addJdkToRegistry: (path: string, name?: string) => Promise<void>
  removeJdkFromRegistry: (jdkId: string) => Promise<void>
  setDefaultJdk: (jdkId: string) => Promise<void>
  startBuild: () => Promise<void>
  cancelBuild: () => Promise<void>
  appendBuildLog: (event: BuildLogEvent) => void
  clearBuildLogs: () => void
  finishBuild: (event: BuildFinishedEvent) => void
  loadHistoryAndTemplates: () => Promise<void>
  deleteHistory: (historyId: string) => Promise<void>
  rerunHistory: (record: BuildHistoryRecord) => void
  rerunHistoryNow: (record: BuildHistoryRecord) => Promise<void>
  saveTemplate: (name: string) => Promise<void>
  updateTemplate: (template: BuildTemplate) => Promise<void>
  applyTemplate: (template: BuildTemplate) => void
  deleteTemplate: (templateId: string) => Promise<void>
  removeArtifact: (path: string, recordOnly?: boolean) => Promise<void>
}

const envStore = () => useEnvironmentStore.getState()

const findModule = (
  modules: MavenModule[],
  moduleId: string,
): MavenModule | undefined => {
  for (const moduleItem of modules) {
    if (moduleItem.id === moduleId) {
      return moduleItem
    }
    const child = findModule(moduleItem.children ?? [], moduleId)
    if (child) {
      return child
    }
  }
  return undefined
}

const moduleSelectionLabel = (modules: MavenModule[], modulePath: string) => {
  if (!modulePath) {
    return '全部项目'
  }
  if (modules.length === 1) {
    return modules[0].artifactId
  }
  return `${modules.length} 个模块`
}

const findModulesByPaths = (modules: MavenModule[], modulePath: string) => {
  const paths = modulePath
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  const allModules = flattenModules(modules)
  return paths
    .map((path) => allModules.find((moduleItem) => moduleItem.relativePath === path))
    .filter((moduleItem): moduleItem is MavenModule => Boolean(moduleItem))
}

const toHistoryStatus = (status: PersistedBuildStatus): BuildStatus => status

// 日志批量缓冲：高频 Maven 输出按 ~50ms 合并写入，降低 re-render 压力
const pendingLogBuffer: BuildLogEvent[] = []
let logFlushTimer: ReturnType<typeof setTimeout> | null = null

const flushPendingLogs = () => {
  logFlushTimer = null
  if (pendingLogBuffer.length === 0) return
  const batch = pendingLogBuffer.splice(0, pendingLogBuffer.length)
  useAppStore.setState((state) => ({
    logs: appendBoundedItems(state.logs, batch, 5000),
  }))
}

const scheduleLogFlush = (event: BuildLogEvent) => {
  const last = pendingLogBuffer.at(-1)
  if (isSameBuildLogLine(last, event)) {
    return
  }
  pendingLogBuffer.push(event)
  if (!logFlushTimer) {
    logFlushTimer = setTimeout(flushPendingLogs, 50)
  }
}

const appendSystemLog = (
  logs: BuildLogEvent[],
  buildId: string | undefined,
  line: string,
): BuildLogEvent[] => appendBoundedItems(logs, [{
  buildId: buildId ?? 'pending',
  stream: 'system',
  line,
}], 5000)

const isSameBuildLogLine = (
  previous: BuildLogEvent | undefined,
  next: BuildLogEvent,
) =>
  Boolean(previous)
  && previous?.buildId === next.buildId
  && previous.stream === next.stream
  && previous.line === next.line

const sortTemplates = (templates: BuildTemplate[]) =>
  [...templates].sort((left, right) => {
    if (Boolean(left.pinned) !== Boolean(right.pinned)) {
      return left.pinned ? -1 : 1
    }
    return (right.updatedAt ?? '').localeCompare(left.updatedAt ?? '')
      || left.name.localeCompare(right.name, 'zh-CN')
  })

const notifyBuildFinished = (status: PersistedBuildStatus, durationMs: number, artifactCount: number) => {
  const success = status === 'SUCCESS'
  const title = success ? 'Maven 打包完成' : status === 'CANCELLED' ? 'Maven 打包已停止' : 'Maven 打包失败'
  const seconds = Math.max(1, Math.round(durationMs / 1000))
  const body = success
    ? `耗时 ${seconds}s，发现 ${artifactCount} 个产物。`
    : `耗时 ${seconds}s，请查看构建日志。`

  try {
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(title, { body })
      } else if (Notification.permission === 'default') {
        void Notification.requestPermission().then((permission) => {
          if (permission === 'granted') {
            new Notification(title, { body })
          }
        })
      }
    }
  } catch {
    // Desktop notification unavailable.
  }

  try {
    const AudioContextClass = window.AudioContext
      ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) {
      return
    }
    const context = new AudioContextClass()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = success ? 'sine' : 'triangle'
    oscillator.frequency.value = success ? 880 : 220
    gain.gain.setValueAtTime(0.0001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.24)
    oscillator.onended = () => void context.close()
  } catch {
    // User system blocks audio.
  }
}

// 命令预览请求序号，防止慢响应覆盖新命令
let previewRequestId = 0

export const useAppStore = create<AppState>((set, get) => ({
  buildOptions: createDefaultBuildOptions(),
  buildStatus: 'IDLE',
  buildCancelling: false,
  durationMs: 0,
  logs: [],
  diagnosis: undefined,
  artifacts: [],
  history: [],
  templates: [],
  selectedModules: [],
  selectedModuleIds: [],
  savedProjectPaths: [],
  gitChecking: false,
  gitCommits: [],
  gitCommitsLoading: false,
  gitPulling: false,
  gitSwitching: false,
  gitError: undefined,
  loading: false,
  initialized: false,

  initialize: async () => {
    try {
      await get().loadHistoryAndTemplates()
      await envStore().loadSettings()
      const settings = envStore().environmentSettings
      const savedProjectPaths = envStore().savedProjectPaths
      set({savedProjectPaths, environmentSettings: settings, jdkRegistry: envStore().jdkRegistry})
      if (settings?.lastProjectPath) {
        await get().parseProjectPath(settings.lastProjectPath)
      } else {
        await envStore().detectForProject('')
        set({environment: envStore().environment})
      }
    } catch (error) {
      // 非首次启动时，记录错误让用户感知；首次启动或浏览器预览则保持空白工作台
      if (isTauriRuntime()) {
        set({error: getErrorMessage(error)})
      }
    } finally {
      set({initialized: true})
    }
  },

  chooseProject: async () => {
    try {
      const rootPath = await selectProjectDirectory()
      if (rootPath) {
        await get().parseProjectPath(rootPath)
      }
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },

  parseProjectPath: async (rootPath: string) => {
    if (get().buildStatus === 'RUNNING') {
      set({ error: '构建进行中，请先停止当前构建再切换项目。' })
      return
    }
    set({
      loading: true,
      error: undefined,
      project: undefined,
      selectedModule: undefined,
      selectedModules: [],
      selectedModuleIds: [],
      logs: [],
      diagnosis: undefined,
      artifacts: [],
      gitStatus: undefined,
      gitCommits: [],
      gitError: undefined,
    })
    pendingLogBuffer.length = 0
    if (logFlushTimer) {
      clearTimeout(logFlushTimer)
      logFlushTimer = null
    }
    try {
      const [project] = await Promise.all([
        api.parseMavenProject(rootPath),
        envStore().detectForProject(rootPath),
      ])
      // 加载项目后，根据项目绑定解析 activeProfileId
      const settings = envStore().environmentSettings
      const boundProfileId = settings?.projectProfileBindings?.[project.rootPath]
      const resolvedActiveProfileId = boundProfileId ?? settings?.activeProfileId
      if (resolvedActiveProfileId !== settings?.activeProfileId) {
        const updatedSettings: EnvironmentSettings = {
          profiles: [],
          ...settings,
          activeProfileId: resolvedActiveProfileId,
        }
        set({ environmentSettings: updatedSettings })
        // 同步到 envStore 以便后续操作使用
        await envStore().syncActiveProfileId(resolvedActiveProfileId)
      }
      const buildOptions = createDefaultBuildOptions(project.rootPath, '')
      set({
        project,
        environment: envStore().environment,
        selectedModule: undefined,
        selectedModules: [],
        selectedModuleIds: [],
        buildOptions,
        buildStatus: 'IDLE',
        currentBuildId: undefined,
        buildCancelling: false,
        durationMs: 0,
      })
      await envStore().saveLastProjectPath(project.rootPath)
      set({savedProjectPaths: envStore().savedProjectPaths})
      await get().refreshCommandPreview()
      void get().checkGitStatus(project.rootPath)
    } catch (error) {
      set({error: getErrorMessage(error)})
    } finally {
      set({loading: false})
    }
  },

  removeSavedProject: async (rootPath: string) => {
    try {
      await envStore().removeSavedProject(rootPath)
      set({savedProjectPaths: envStore().savedProjectPaths})
    } catch (error) {
      set({error: getErrorMessage(error)})
    }
  },

  checkGitStatus: async (rootPath?: string) => {
    const targetPath = rootPath ?? get().project?.rootPath
    if (!targetPath) {
      return
    }

    set({ gitChecking: true, gitError: undefined })
    try {
      const gitStatus = await api.checkGitStatus(targetPath)
      set({ gitStatus, gitError: undefined })
      void get().loadGitCommits(targetPath)
    } catch (error) {
      set({
        gitStatus: {
          isGitRepo: true,
          branches: [],
          aheadCount: 0,
          behindCount: 0,
          hasRemoteUpdates: false,
          hasLocalChanges: false,
          message: getErrorMessage(error),
        },
        gitCommits: [],
        gitError: getErrorMessage(error),
      })
    } finally {
      set({ gitChecking: false })
    }
  },

  loadGitCommits: async (rootPath?: string) => {
    const targetPath = rootPath ?? get().project?.rootPath
    if (!targetPath) {
      set({ gitCommits: [] })
      return
    }

    set({ gitCommitsLoading: true })
    try {
      const gitCommits = await api.listGitCommits(targetPath, 30)
      set({ gitCommits })
    } catch {
      set({ gitCommits: [] })
    } finally {
      set({ gitCommitsLoading: false })
    }
  },

  fetchGitUpdates: async () => {
    const targetPath = get().project?.rootPath
    if (!targetPath) {
      return
    }

    set({ gitChecking: true, gitError: undefined })
    try {
      const gitStatus = await api.fetchGitUpdates(targetPath)
      set({ gitStatus, gitError: undefined })
      await get().loadGitCommits(targetPath)
    } catch (error) {
      set({ gitError: getErrorMessage(error) })
    } finally {
      set({ gitChecking: false })
    }
  },

  pullGitUpdates: async () => {
    const targetPath = get().project?.rootPath
    if (!targetPath) {
      return
    }

    set({ gitPulling: true, gitError: undefined })
    try {
      const result = await api.pullGitUpdates(targetPath)
      set({ gitStatus: result.status, gitError: undefined })
      await get().loadGitCommits(targetPath)
      await get().parseProjectPath(targetPath)
    } catch (error) {
      const gitError = getErrorMessage(error)
      await get().checkGitStatus(targetPath)
      set({ gitError })
    } finally {
      set({ gitPulling: false })
    }
  },

  switchGitBranch: async (branchName: string) => {
    const targetPath = get().project?.rootPath
    if (!targetPath) {
      return
    }

    set({ gitSwitching: true, gitError: undefined })
    try {
      const result = await api.switchGitBranch(targetPath, branchName)
      set({ gitStatus: result.status, gitError: undefined })
      await get().loadGitCommits(targetPath)
      await get().parseProjectPath(targetPath)
    } catch (error) {
      const gitError = getErrorMessage(error)
      await get().checkGitStatus(targetPath)
      set({ gitError })
    } finally {
      set({ gitSwitching: false })
    }
  },

  clearGitError: () => {
    set({ gitError: undefined })
  },

  setSelectedModule: (moduleId: string) => {
    const project = get().project
    const selectedModule = project ? findModule(project.modules, moduleId) : undefined
    if (!selectedModule) {
      return
    }
    set((state) => ({
      selectedModule,
      selectedModules: [selectedModule],
      selectedModuleIds: [selectedModule.id],
      buildOptions: {
        ...state.buildOptions,
        selectedModulePath: selectedModule.relativePath,
      },
    }))
    void get().refreshCommandPreview()
  },

  setSelectedModules: (moduleIds: string[]) => {
    const project = get().project
    if (!project) {
      return
    }
    const allModules = flattenModules(project.modules)
    const selectedModules = moduleIds
      .map((moduleId) => allModules.find((moduleItem) => moduleItem.id === moduleId))
      .filter((moduleItem): moduleItem is MavenModule => Boolean(moduleItem))
    const selectedModulePath = selectedModules
      .map((moduleItem) => moduleItem.relativePath)
      .join(',')

    set((state) => ({
      selectedModule: selectedModules[0],
      selectedModules,
      selectedModuleIds: selectedModules.map((moduleItem) => moduleItem.id),
      buildOptions: {
        ...state.buildOptions,
        selectedModulePath,
      },
    }))
    void get().refreshCommandPreview()
  },

  selectAllProject: () => {
    set((state) => ({
      selectedModule: undefined,
      selectedModules: [],
      selectedModuleIds: [],
      buildOptions: {
        ...state.buildOptions,
        selectedModulePath: '',
      },
    }))
    void get().refreshCommandPreview()
  },

  setBuildOption: (key, value) => {
    set((state) => ({
      buildOptions: {
        ...state.buildOptions,
        [key]: value,
      },
    }))
    void get().refreshCommandPreview()
  },

  setEditableCommand: (command: string) => {
    set((state) => ({
      buildOptions: {
        ...state.buildOptions,
        editableCommand: command,
      },
    }))
  },

  refreshCommandPreview: async () => {
    const { buildOptions, environment } = get()
    if (!environment || !buildOptions.projectRoot) {
      return
    }

    const requestId = ++previewRequestId
    try {
      const editableCommand = await api.buildCommandPreview({
        options: buildOptions,
        environment,
      })
      // 仅应用最新一次请求的结果
      if (requestId !== previewRequestId) {
        return
      }
      set((state) => ({
        buildOptions: {
          ...state.buildOptions,
          editableCommand,
        },
      }))
    } catch (error) {
      if (requestId !== previewRequestId) {
        return
      }
      set({ error: getErrorMessage(error) })
    }
  },

  updateEnvironment: async (settings: EnvironmentSettings) => {
    const project = get().project
    try {
      await envStore().updateEnvironment(settings, project?.rootPath)
      set({environment: envStore().environment, environmentSettings: envStore().environmentSettings})
      if (project) {
        await get().refreshCommandPreview()
      }
    } catch (error) {
      set({error: getErrorMessage(error)})
    }
  },

  refreshEnvironment: async () => {
    const project = get().project
    try {
      await envStore().refreshEnvironment(project?.rootPath)
      set({environment: envStore().environment, environmentSettings: envStore().environmentSettings})
      if (project) {
        await get().refreshCommandPreview()
      }
    } catch (error) {
      set({error: getErrorMessage(error)})
    }
  },

  applyEnvironmentProfile: async (profileId: string) => {
    const project = get().project
    try {
      await envStore().applyEnvironmentProfile(profileId, project?.rootPath)
      set({environment: envStore().environment, environmentSettings: envStore().environmentSettings})
      if (project) {
        await get().refreshCommandPreview()
      }
    } catch (error) {
      set({error: getErrorMessage(error)})
    }
  },

  saveEnvironmentProfile: async (name: string) => {
    const project = get().project
    try {
      await envStore().saveEnvironmentProfile(name, project?.rootPath)
      set({environment: envStore().environment, environmentSettings: envStore().environmentSettings})
      if (project) {
        await get().refreshCommandPreview()
      }
    } catch (error) {
      set({error: getErrorMessage(error)})
    }
  },

  deleteEnvironmentProfile: async (profileId: string) => {
    const project = get().project
    try {
      await envStore().deleteEnvironmentProfile(profileId, project?.rootPath)
      set({environment: envStore().environment, environmentSettings: envStore().environmentSettings})
      if (project) {
        await get().refreshCommandPreview()
      }
    } catch (error) {
      set({error: getErrorMessage(error)})
    }
  },

  bindProjectProfile: async (projectPath: string, profileId: string) => {
    try {
      await envStore().bindProjectProfile(projectPath, profileId)
      set({environment: envStore().environment, environmentSettings: envStore().environmentSettings})
      const project = get().project
      if (project) {
        await get().refreshCommandPreview()
      }
    } catch (error) {
      set({error: getErrorMessage(error)})
    }
  },

  unbindProjectProfile: async (projectPath: string) => {
    try {
      await envStore().unbindProjectProfile(projectPath)
      set({environment: envStore().environment, environmentSettings: envStore().environmentSettings})
      const project = get().project
      if (project) {
        await get().refreshCommandPreview()
      }
    } catch (error) {
      set({error: getErrorMessage(error)})
    }
  },

  getBoundProfileId: (projectPath: string) => {
    return envStore().getBoundProfileId(projectPath)
  },

  jdkRegistry: [],

  scanSystemJdks: async () => {
    try {
      await envStore().scanSystemJdks()
      set({jdkRegistry: envStore().jdkRegistry})
    } catch (error) {
      set({error: getErrorMessage(error)})
    }
  },

  addJdkToRegistry: async (path: string, name?: string) => {
    try {
      await envStore().addJdkToRegistry(path, name)
      set({jdkRegistry: envStore().jdkRegistry})
    } catch (error) {
      set({error: getErrorMessage(error)})
    }
  },

  removeJdkFromRegistry: async (jdkId: string) => {
    try {
      await envStore().removeJdkFromRegistry(jdkId)
      set({jdkRegistry: envStore().jdkRegistry})
    } catch (error) {
      set({error: getErrorMessage(error)})
    }
  },

  setDefaultJdk: async (jdkId: string) => {
    try {
      await envStore().setDefaultJdk(jdkId)
      set({jdkRegistry: envStore().jdkRegistry})
    } catch (error) {
      set({error: getErrorMessage(error)})
    }
  },

  startBuild: async () => {
    const { buildOptions, environment, selectedModules } = get()
    if (!environment || !buildOptions.projectRoot || !buildOptions.editableCommand.trim()) {
      set({ error: '请先选择项目并确认构建命令。' })
      return
    }

    const runToken = crypto.randomUUID()
    set({
      buildStatus: 'RUNNING',
      logs: [],
      diagnosis: undefined,
      artifacts: [],
      startedAt: Date.now(),
      durationMs: 0,
      error: undefined,
    })

    try {
      const currentBuildId = await api.startBuild({
        projectRoot: buildOptions.projectRoot,
        command: buildOptions.editableCommand,
        modulePath: buildOptions.selectedModulePath,
        moduleArtifactId: moduleSelectionLabel(selectedModules, buildOptions.selectedModulePath),
        javaHome: environment.javaHome,
        mavenHome: environment.mavenHome,
        useMavenWrapper: environment.useMavenWrapper,
      })
      set({ currentBuildId, buildRunToken: runToken })
      if (get().buildCancelling) {
        set((state) => ({
          logs: appendSystemLog(state.logs, currentBuildId, '构建进程已启动，继续发送停止请求。'),
        }))
        try {
          await api.cancelBuild(currentBuildId)
        } catch (cancelError) {
          const message = getErrorMessage(cancelError)
          set((state) => ({
            logs: appendSystemLog(state.logs, currentBuildId, `停止请求发送失败：${message}`),
          }))
          throw cancelError
        }
      }
    } catch (error) {
      const message = getErrorMessage(error)
      set((state) => ({
        buildStatus: 'FAILED',
        buildCancelling: false,
        error: message,
        logs: appendSystemLog(state.logs, get().currentBuildId, `构建启动或停止请求失败：${message}`),
      }))
    }
  },

  cancelBuild: async () => {
    const currentBuildId = get().currentBuildId
    set({ buildCancelling: true })
    if (!currentBuildId) {
      set((state) => ({
        logs: appendSystemLog(state.logs, undefined, '已请求停止，等待构建进程初始化完成。'),
      }))
      return
    }
    set((state) => ({
      logs: appendSystemLog(state.logs, currentBuildId, '已请求停止构建。'),
    }))
    try {
      set((state) => ({
        logs: appendSystemLog(state.logs, currentBuildId, `正在调用后端停止命令：cancel_build(${currentBuildId})`),
      }))
      await api.cancelBuild(currentBuildId)
      set((state) => ({
        logs: appendSystemLog(state.logs, currentBuildId, '后端停止命令已返回，等待构建进程退出。'),
      }))
    } catch (error) {
      const message = getErrorMessage(error)
      set((state) => ({
        buildCancelling: false,
        error: message,
        logs: appendSystemLog(state.logs, currentBuildId, `停止请求发送失败：${message}`),
      }))
    }
  },

  appendBuildLog: (event: BuildLogEvent) => {
    const { currentBuildId, buildStatus } = get()
    if (buildStatus === 'RUNNING') {
      // 启动瞬间 currentBuildId 可能尚未写入，此时接受全部日志
      if (currentBuildId && event.buildId !== currentBuildId) {
        return
      }
    } else if (!currentBuildId || event.buildId !== currentBuildId) {
      // 构建已结束或未开始时，丢弃迟到的进程输出
      return
    }
    scheduleLogFlush(event)
  },

  clearBuildLogs: () => {
    pendingLogBuffer.length = 0
    if (logFlushTimer) {
      clearTimeout(logFlushTimer)
      logFlushTimer = null
    }
    set({ logs: [], diagnosis: undefined })
  },

  finishBuild: (event: BuildFinishedEvent) => {
    const {
      buildOptions,
      environment,
      selectedModules,
      currentBuildId,
      logs,
      buildStatus,
      buildRunToken,
    } = get()
    // 允许两种情况：id 已知且匹配；或 RUNNING 且 id 尚未写入（启动竞态）
    const acceptById = currentBuildId !== undefined && event.buildId === currentBuildId
    const acceptPending = buildStatus === 'RUNNING' && currentBuildId === undefined
    if (!acceptById && !acceptPending) {
      return
    }
    // 立即冲刷缓冲日志，保证诊断拿到完整输出
    flushPendingLogs()
    const diagnosis = event.status === 'FAILED'
      ? diagnoseBuildFailure(event.buildId, logs, environment)
      : undefined
    const startedAt = get().startedAt
    const record: BuildHistoryRecord = {
      id: event.buildId,
      createdAt: new Date(startedAt ?? Date.now()).toISOString(),
      projectRoot: buildOptions.projectRoot,
      modulePath: buildOptions.selectedModulePath,
      moduleArtifactId: moduleSelectionLabel(selectedModules, buildOptions.selectedModulePath),
      command: buildOptions.editableCommand,
      status: event.status,
      durationMs: event.durationMs,
      javaHome: environment?.javaHome,
      mavenHome: environment?.mavenHome,
      useMavenWrapper: environment?.useMavenWrapper ?? false,
      buildOptions: { ...buildOptions },
      artifacts: [],
    }
    void (async () => {
      try {
        const artifacts = event.status === 'SUCCESS'
          ? await api.scanBuildArtifacts(record.projectRoot, record.modulePath).catch(() => [])
          : []
        // 仅在仍是同一次构建时回填，避免覆盖新一轮构建状态
        const stillSameRun = get().buildRunToken === buildRunToken
          || (!get().buildRunToken && get().currentBuildId === undefined && get().buildStatus !== 'RUNNING')
        if (stillSameRun && get().buildStatus !== 'RUNNING') {
          set({ artifacts })
        }
        notifyBuildFinished(event.status, event.durationMs, artifacts.length)
        await api.saveBuildHistory({ ...record, artifacts: stillSameRun ? artifacts : [] })
        await get().loadHistoryAndTemplates()
      } catch (error) {
        console.error('Failed to save build history:', error)
      }
    })()
    set({
      buildStatus: toHistoryStatus(event.status),
      durationMs: event.durationMs,
      currentBuildId: undefined,
      buildRunToken: undefined,
      buildCancelling: false,
      diagnosis,
    })
  },

  loadHistoryAndTemplates: async () => {
    try {
      const [history, templates] = await Promise.all([
        api.listBuildHistory(),
        api.listTemplates(),
      ])
      set({ history, templates: sortTemplates(templates) })
    } catch {
      set({ history: [], templates: [] })
    }
  },

  deleteHistory: async (historyId: string) => {
    try {
      await api.deleteBuildHistory(historyId)
      set((state) => ({
        history: state.history.filter((record) => record.id !== historyId),
      }))
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },

  rerunHistory: (record: BuildHistoryRecord) => {
    const project = get().project
    const selectedModules = project
      ? findModulesByPaths(project.modules, record.modulePath)
      : []
    const buildOptions = record.buildOptions
      ? { ...record.buildOptions, editableCommand: record.command }
      : {
          ...createDefaultBuildOptions(record.projectRoot, record.modulePath),
          editableCommand: record.command,
        }
    set({
      selectedModule: selectedModules[0],
      selectedModules,
      selectedModuleIds: selectedModules.map((moduleItem) => moduleItem.id),
      buildOptions,
      buildStatus: 'IDLE',
      durationMs: record.durationMs,
      artifacts: record.artifacts ?? [],
    })
  },

  rerunHistoryNow: async (record: BuildHistoryRecord) => {
    if (get().project?.rootPath !== record.projectRoot) {
      await get().parseProjectPath(record.projectRoot)
    }
    get().rerunHistory(record)
    await get().startBuild()
  },

  saveTemplate: async (name: string) => {
    const { buildOptions, environment } = get()
    if (!buildOptions.projectRoot) {
      set({ error: '请先选择项目。' })
      return
    }
    const template: BuildTemplate = {
      id: crypto.randomUUID(),
      name,
      projectRoot: buildOptions.projectRoot,
      modulePath: buildOptions.selectedModulePath,
      goals: buildOptions.goals,
      profiles: buildOptions.profiles,
      properties: buildOptions.properties,
      alsoMake: buildOptions.alsoMake,
      skipTests: buildOptions.skipTests,
      customArgs: buildOptions.customArgs,
      useMavenWrapper: environment?.useMavenWrapper ?? false,
      javaHome: environment?.javaHome,
      mavenHome: environment?.mavenHome,
      pinned: false,
    }
    try {
      await api.saveTemplate(template)
      await get().loadHistoryAndTemplates()
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },

  updateTemplate: async (template: BuildTemplate) => {
    try {
      await api.saveTemplate(template)
      await get().loadHistoryAndTemplates()
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },

  applyTemplate: (template: BuildTemplate) => {
    const project = get().project
    const selectedModules = project
      ? findModulesByPaths(project.modules, template.modulePath)
      : []
    set((state) => ({
      selectedModule: selectedModules[0],
      selectedModules,
      selectedModuleIds: selectedModules.map((moduleItem) => moduleItem.id),
      buildOptions: {
        ...state.buildOptions,
        projectRoot: template.projectRoot,
        selectedModulePath: template.modulePath,
        goals: template.goals,
        profiles: template.profiles,
        properties: template.properties,
        alsoMake: template.alsoMake,
        skipTests: template.skipTests,
        customArgs: template.customArgs,
      },
      artifacts: [],
    }))
    void get().refreshCommandPreview()
  },

  deleteTemplate: async (templateId: string) => {
    try {
      await api.deleteTemplate(templateId)
      await get().loadHistoryAndTemplates()
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },

  removeArtifact: async (path: string, recordOnly?: boolean) => {
    try {
      const projectRoot = get().project?.rootPath
      await api.deleteBuildArtifact(path, recordOnly, projectRoot)
    } catch (error) {
      set({ error: getErrorMessage(error) })
      return
    }
    const currentState = get()
    const changedHistoryRecords: BuildHistoryRecord[] = []
    const nextHistory = currentState.history.map((record) => {
      const nextArtifacts = record.artifacts?.filter((artifact) => artifact.path !== path)
      if ((nextArtifacts?.length ?? 0) === (record.artifacts?.length ?? 0)) {
        return record
      }
      const nextRecord = {
        ...record,
        artifacts: nextArtifacts ?? [],
      }
      changedHistoryRecords.push(nextRecord)
      return nextRecord
    })
    set((state) => ({
      artifacts: state.artifacts.filter((artifact) => artifact.path !== path),
      history: nextHistory,
    }))
    try {
      await Promise.all(changedHistoryRecords.map((record) => api.saveBuildHistory(record)))
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
}))
