import {create} from 'zustand'
import {api, createDefaultBuildOptions, isTauriRuntime, selectProjectDirectory} from '../services/tauri-api'
import {diagnoseBuildFailure} from '../services/buildDiagnosisService'
import {appendBoundedItems} from '../utils/boundedBuffer'
import {normalizeBuildOptions} from '../utils/buildOptions'
import {getErrorMessage} from '../utils/errors'
import {notifyError, notifySuccess} from './useFeedbackStore'
import {useBuildProgressStore} from './useBuildProgressStore'
import {useDependencyStore} from './useDependencyStore'
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
  setSelectedModules: (moduleIds: string[]) => void
  selectAllProject: () => void
  setBuildOption: <K extends keyof BuildOptions>(
    key: K,
    value: BuildOptions[K],
  ) => void
  /** 用户手工写入命令（会锁定命令，自动生成结果不再覆盖） */
  setEditableCommand: (command: string) => void
  /** 解除命令锁定并按当前参数重新生成 */
  resetEditableCommand: () => Promise<void>
  /** 高频改动（逐字输入）走防抖，避免每次按键都发一次 IPC */
  scheduleCommandPreview: () => void
  /** 立即冲刷待执行的预览请求，开始构建前必须调用 */
  flushCommandPreview: () => Promise<void>
  refreshCommandPreview: () => Promise<void>
  setGoals: (goals: string[]) => void
  setCommonArgs: (args: string[]) => void
  setExtraArgs: (args: string[]) => void
  setThreadCount: (threadCount?: number) => void
  clearError: () => void
  reloadProjectModules: (rootPath: string) => Promise<void>
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

/**
 * 错误统一出口：写入 store 的同时弹出通知。
 * 之前只有 ProjectSelector 消费 error，导致绝大多数失败对用户完全不可见。
 */
const fail = (message: string) => {
  useAppStore.setState({error: message})
  notifyError(message)
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
  // 进度与日志同源：整批一次性推导，避免每行都触发一次状态更新
  useBuildProgressStore.getState().ingestLines(batch.map((event) => event.line))
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
let previewTimer: ReturnType<typeof setTimeout> | null = null

const clearPreviewTimer = () => {
  if (previewTimer) {
    clearTimeout(previewTimer)
    previewTimer = null
  }
}

/** 初始化幂等标志：React StrictMode 下 effect 会执行两次 */
let initializeStarted = false

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
    // StrictMode / 多次挂载下只初始化一次，避免重复加载历史与解析项目
    if (initializeStarted) return
    initializeStarted = true
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
        fail(getErrorMessage(error))
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
      fail(getErrorMessage(error))
    }
  },

  parseProjectPath: async (rootPath: string) => {
    if (get().buildStatus === 'RUNNING') {
      fail('构建进行中，请先停止当前构建再切换项目。')
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
    clearPreviewTimer()
    useBuildProgressStore.getState().reset()
    // 冲突结果属于上一个项目，必须清空，否则会展示错误项目的扫描结果
    useDependencyStore.getState().clear()
    try {
      const [project] = await Promise.all([
        api.parseMavenProject(rootPath),
        envStore().detectForProject(rootPath),
      ])
      // 注意：不要把「项目绑定的方案」回写为全局 activeProfileId。
      // 后端 detect_environment 已经按「项目绑定优先、其次全局」解析，
      // 若在这里把绑定结果提升为全局值，下一个未绑定的项目会错误地继承上一个项目的方案。
      const buildOptions = normalizeBuildOptions(createDefaultBuildOptions(project.rootPath, ''))
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
      fail(getErrorMessage(error))
    } finally {
      set({loading: false})
    }
  },

  removeSavedProject: async (rootPath: string) => {
    try {
      await envStore().removeSavedProject(rootPath)
      set({savedProjectPaths: envStore().savedProjectPaths})
    } catch (error) {
      fail(getErrorMessage(error))
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
      // 只刷新模块结构，保留构建日志、产物与已选模块
      await get().reloadProjectModules(targetPath)
      notifySuccess('已拉取远端更新')
    } catch (error) {
      const gitError = getErrorMessage(error)
      await get().checkGitStatus(targetPath)
      set({ gitError })
      notifyError('拉取失败', gitError)
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
      // 只刷新模块结构，保留构建日志、产物与已选模块
      await get().reloadProjectModules(targetPath)
      notifySuccess(`已切换到分支 ${branchName}`)
    } catch (error) {
      const gitError = getErrorMessage(error)
      await get().checkGitStatus(targetPath)
      set({ gitError })
      notifyError('切换分支失败', gitError)
    } finally {
      set({ gitSwitching: false })
    }
  },

  clearGitError: () => {
    set({ gitError: undefined })
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
    // 根聚合模块的 relativePath 为空串，直接 join 会产出 "-pl ,sub" 这类非法参数
    const selectedModulePath = selectedModules
      .map((moduleItem) => moduleItem.relativePath.trim())
      .filter(Boolean)
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

  clearError: () => set({error: undefined}),

  /**
   * 仅刷新项目模块信息（Git 拉取 / 切分支后使用）。
   * 旧实现调用 parseProjectPath，会连带清空日志、产物、诊断与已选模块。
   */
  reloadProjectModules: async (rootPath: string) => {
    try {
      const project = await api.parseMavenProject(rootPath)
      const previousPaths = get().selectedModules.map((moduleItem) => moduleItem.relativePath)
      const allModules = flattenModules(project.modules)
      const selectedModules = previousPaths
        .map((path) => allModules.find((moduleItem) => moduleItem.relativePath === path))
        .filter((moduleItem): moduleItem is MavenModule => Boolean(moduleItem))

      set((state) => ({
        project,
        selectedModule: selectedModules[0],
        selectedModules,
        selectedModuleIds: selectedModules.map((moduleItem) => moduleItem.id),
        buildOptions: {
          ...state.buildOptions,
          selectedModulePath: selectedModules.map((moduleItem) => moduleItem.relativePath).join(','),
        },
      }))
      await get().refreshCommandPreview()
    } catch (error) {
      fail(getErrorMessage(error))
    }
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
      buildOptions: normalizeBuildOptions({
        ...state.buildOptions,
        [key]: value,
      }),
    }))
    get().scheduleCommandPreview()
  },

  setGoals: (goals) => {
    set((state) => ({
      buildOptions: normalizeBuildOptions({...state.buildOptions, goals}),
    }))
    get().scheduleCommandPreview()
  },

  setCommonArgs: (commonArgs) => {
    set((state) => ({
      buildOptions: normalizeBuildOptions({...state.buildOptions, commonArgs}),
    }))
    get().scheduleCommandPreview()
  },

  setExtraArgs: (extraArgs) => {
    set((state) => ({
      buildOptions: normalizeBuildOptions({...state.buildOptions, extraArgs}),
    }))
    get().scheduleCommandPreview()
  },

  setThreadCount: (threadCount) => {
    set((state) => ({
      buildOptions: normalizeBuildOptions({...state.buildOptions, threadCount}),
    }))
    get().scheduleCommandPreview()
  },

  setEditableCommand: (command: string) => {
    set((state) => ({
      buildOptions: {
        ...state.buildOptions,
        editableCommand: command,
        // 用户显式写入即锁定，后续自动生成不再覆盖
        commandLocked: true,
      },
    }))
  },

  resetEditableCommand: async () => {
    set((state) => ({
      buildOptions: {
        ...state.buildOptions,
        commandLocked: false,
      },
    }))
    await get().refreshCommandPreview()
  },

  scheduleCommandPreview: () => {
    clearPreviewTimer()
    previewTimer = setTimeout(() => {
      previewTimer = null
      void get().refreshCommandPreview()
    }, 200)
  },

  flushCommandPreview: async () => {
    clearPreviewTimer()
    await get().refreshCommandPreview()
  },

  refreshCommandPreview: async () => {
    const { environment } = get()
    // 发送前先归一化，保证 goals 顺序与 customArgs 合成结果一致
    const buildOptions = normalizeBuildOptions(get().buildOptions)
    set({buildOptions})
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
      // 用户已手工锁定命令时不再回写，否则「完整命令预览」里的改动会被自动生成覆盖
      set((state) => ({
        buildOptions: state.buildOptions.commandLocked
          ? state.buildOptions
          : {
              ...state.buildOptions,
              editableCommand,
            },
      }))
    } catch (error) {
      if (requestId !== previewRequestId) {
        return
      }
      fail(getErrorMessage(error))
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
      fail(getErrorMessage(error))
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
      fail(getErrorMessage(error))
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
      fail(getErrorMessage(error))
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
      fail(getErrorMessage(error))
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
      fail(getErrorMessage(error))
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
      fail(getErrorMessage(error))
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
      fail(getErrorMessage(error))
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
      fail(getErrorMessage(error))
    }
  },

  addJdkToRegistry: async (path: string, name?: string) => {
    try {
      await envStore().addJdkToRegistry(path, name)
      set({jdkRegistry: envStore().jdkRegistry})
    } catch (error) {
      fail(getErrorMessage(error))
    }
  },

  removeJdkFromRegistry: async (jdkId: string) => {
    try {
      await envStore().removeJdkFromRegistry(jdkId)
      set({jdkRegistry: envStore().jdkRegistry})
    } catch (error) {
      fail(getErrorMessage(error))
    }
  },

  setDefaultJdk: async (jdkId: string) => {
    try {
      await envStore().setDefaultJdk(jdkId)
      set({jdkRegistry: envStore().jdkRegistry})
    } catch (error) {
      fail(getErrorMessage(error))
    }
  },

  startBuild: async () => {
    const { buildOptions, environment, selectedModules, buildStatus } = get()
    // 与 parseProjectPath 一致：构建中不再允许再次启动，避免产生无人跟踪的孤儿进程
    if (buildStatus === 'RUNNING') {
      fail('已有构建正在运行，请先停止后再开始。')
      return
    }
    if (!environment || !buildOptions.projectRoot || !buildOptions.editableCommand.trim()) {
      fail('请先选择项目并确认构建命令。')
      return
    }

    // 先冲刷防抖中的预览请求，确保用的是最新参数生成的命令
    await get().flushCommandPreview()
    const command = get().buildOptions.editableCommand.trim()
    if (!command) {
      fail('请先选择项目并确认构建命令。')
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
    useBuildProgressStore.getState().startRun({
      totalModules: selectedModules.length > 0 ? selectedModules.length : 1,
      goals: buildOptions.goals,
      skipTests: buildOptions.skipTests,
    })

    try {
      const currentBuildId = await api.startBuild({
        projectRoot: buildOptions.projectRoot,
        command,
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
      notifyError('构建启动失败', message)
    }
  },

  cancelBuild: async () => {
    const currentBuildId = get().currentBuildId
    set({ buildCancelling: true })
    useBuildProgressStore.getState().markCancelling()
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
      notifyError('停止构建失败', message)
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
    useBuildProgressStore.getState().reset()
  },

  finishBuild: (event: BuildFinishedEvent) => {
    const { currentBuildId, buildStatus, buildRunToken } = get()
    // 允许两种情况：id 已知且匹配；或 RUNNING 且 id 尚未写入（启动竞态）
    const acceptById = currentBuildId !== undefined && event.buildId === currentBuildId
    const acceptPending = buildStatus === 'RUNNING' && currentBuildId === undefined
    if (!acceptById && !acceptPending) {
      return
    }
    // 先冲刷缓冲日志，再读取最新 logs，确保诊断拿到完整输出
    flushPendingLogs()
    const {
      buildOptions,
      environment,
      selectedModules,
      logs,
      startedAt,
    } = get()
    const diagnosis = event.status === 'FAILED'
      ? diagnoseBuildFailure(event.buildId, logs, environment)
      : undefined
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
    // 同步进度状态：失败/取消立即标记，成功则进入产物扫描阶段
    if (event.status === 'FAILED') {
      useBuildProgressStore.getState().fail(diagnosis?.summary)
    } else if (event.status === 'CANCELLED') {
      useBuildProgressStore.getState().cancelComplete()
    } else {
      useBuildProgressStore.getState().startArtifactScan()
    }

    void (async () => {
      try {
        const artifacts = event.status === 'SUCCESS'
          ? await api
              .scanBuildArtifacts(record.projectRoot, record.modulePath, startedAt)
              .catch(() => [])
          : []
        // 仅在仍是同一次构建时回填，避免覆盖新一轮构建状态
        const stillSameRun = get().buildRunToken === buildRunToken
          || (!get().buildRunToken && get().currentBuildId === undefined && get().buildStatus !== 'RUNNING')
        if (stillSameRun && get().buildStatus !== 'RUNNING') {
          set({ artifacts })
        }
        if (event.status === 'SUCCESS') {
          useBuildProgressStore.getState().complete()
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
    } catch (error) {
      set({ history: [], templates: [] })
      // 浏览器预览下没有后端，避免无意义的报错打扰
      if (isTauriRuntime()) {
        notifyError('加载历史与模板失败', getErrorMessage(error))
      }
    }
  },

  deleteHistory: async (historyId: string) => {
    try {
      await api.deleteBuildHistory(historyId)
      set((state) => ({
        history: state.history.filter((record) => record.id !== historyId),
      }))
      notifySuccess('已删除构建记录')
    } catch (error) {
      fail(getErrorMessage(error))
    }
  },

  rerunHistory: (record: BuildHistoryRecord) => {
    const project = get().project
    const selectedModules = project
      ? findModulesByPaths(project.modules, record.modulePath)
      : []
    const buildOptions = normalizeBuildOptions(
      record.buildOptions
        ? { ...record.buildOptions, editableCommand: record.command, commandLocked: true }
        : {
            ...createDefaultBuildOptions(record.projectRoot, record.modulePath),
            editableCommand: record.command,
            // 重跑必须执行历史上那条命令，锁定后避免被重新生成覆盖
            commandLocked: true,
          },
    )
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
      fail('请先选择项目。')
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
      commonArgs: buildOptions.commonArgs,
      threadCount: buildOptions.threadCount,
      extraArgs: buildOptions.extraArgs,
      useMavenWrapper: environment?.useMavenWrapper ?? false,
      javaHome: environment?.javaHome,
      mavenHome: environment?.mavenHome,
      pinned: false,
    }
    try {
      await api.saveTemplate(template)
      await get().loadHistoryAndTemplates()
      notifySuccess('已保存构建模板', name)
    } catch (error) {
      fail(getErrorMessage(error))
    }
  },

  updateTemplate: async (template: BuildTemplate) => {
    try {
      await api.saveTemplate(template)
      await get().loadHistoryAndTemplates()
    } catch (error) {
      fail(getErrorMessage(error))
    }
  },

  applyTemplate: (template: BuildTemplate) => {
    const project = get().project
    // 模板带有自己的项目根目录，直接应用会把构建目标切到别的项目，
    // 且模块选择为空 —— 这里显式拒绝，要求先切换项目。
    if (project && template.projectRoot && template.projectRoot !== project.rootPath) {
      notifyError(
        '模板与当前项目不匹配',
        `该模板属于「${template.projectRoot}」，请先切换到该项目后再应用。`,
      )
      return
    }
    const selectedModules = project
      ? findModulesByPaths(project.modules, template.modulePath)
      : []
    set((state) => ({
      selectedModule: selectedModules[0],
      selectedModules,
      selectedModuleIds: selectedModules.map((moduleItem) => moduleItem.id),
      buildOptions: normalizeBuildOptions({
        ...state.buildOptions,
        projectRoot: template.projectRoot,
        selectedModulePath: template.modulePath,
        goals: template.goals,
        profiles: template.profiles,
        properties: template.properties,
        alsoMake: template.alsoMake,
        skipTests: template.skipTests,
        customArgs: template.customArgs,
        commonArgs: template.commonArgs,
        threadCount: template.threadCount,
        extraArgs: template.extraArgs,
        // 应用模板代表回到「按参数生成命令」，解除手工锁定
        commandLocked: false,
      }),
      artifacts: [],
    }))
    void get().refreshCommandPreview()
    notifySuccess('已应用构建模板', template.name)
  },

  deleteTemplate: async (templateId: string) => {
    try {
      await api.deleteTemplate(templateId)
      await get().loadHistoryAndTemplates()
      notifySuccess('已删除构建模板')
    } catch (error) {
      fail(getErrorMessage(error))
    }
  },

  removeArtifact: async (path: string, recordOnly?: boolean) => {
    const projectRoot = get().project?.rootPath
    // 物理删除必须有项目根目录做路径约束，缺失时后端会拒绝，这里提前给出明确提示
    if (!recordOnly && !projectRoot) {
      fail('缺少项目根目录，已拒绝删除文件。')
      return
    }
    try {
      await api.deleteBuildArtifact(path, recordOnly, projectRoot)
    } catch (error) {
      fail(getErrorMessage(error))
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
      fail(getErrorMessage(error))
    }
  },
}))
