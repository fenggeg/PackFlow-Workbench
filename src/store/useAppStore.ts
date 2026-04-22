import {create} from 'zustand'
import {api, createDefaultBuildOptions, selectProjectDirectory} from '../services/tauri-api'
import type {
  BuildEnvironment,
  BuildFinishedEvent,
  BuildHistoryRecord,
  BuildLogEvent,
  BuildOptions,
  BuildStatus,
  BuildTemplate,
  EnvironmentSettings,
  GitRepositoryStatus,
  MavenModule,
  MavenProject,
  PersistedBuildStatus,
} from '../types/domain'

interface AppState {
  project?: MavenProject
  environment?: BuildEnvironment
  selectedModule?: MavenModule
  selectedModules: MavenModule[]
  selectedModuleIds: string[]
  buildOptions: BuildOptions
  buildStatus: BuildStatus
  currentBuildId?: string
  startedAt?: number
  durationMs: number
  logs: BuildLogEvent[]
  history: BuildHistoryRecord[]
  templates: BuildTemplate[]
  gitStatus?: GitRepositoryStatus
  gitChecking: boolean
  gitPulling: boolean
  gitSwitching: boolean
  loading: boolean
  error?: string
  initialize: () => Promise<void>
  chooseProject: () => Promise<void>
  parseProjectPath: (rootPath: string) => Promise<void>
  checkGitStatus: (rootPath?: string) => Promise<void>
  fetchGitUpdates: () => Promise<void>
  pullGitUpdates: () => Promise<void>
  switchGitBranch: (branchName: string) => Promise<void>
  setSelectedModule: (moduleId: string) => void
  setSelectedModules: (moduleIds: string[]) => void
  selectAllProject: () => void
  setBuildOption: <K extends keyof BuildOptions>(
    key: K,
    value: BuildOptions[K],
  ) => void
  setEditableCommand: (command: string) => void
  refreshCommandPreview: () => Promise<void>
  updateEnvironment: (settings: EnvironmentSettings) => Promise<void>
  startBuild: () => Promise<void>
  cancelBuild: () => Promise<void>
  appendBuildLog: (event: BuildLogEvent) => void
  clearBuildLogs: () => void
  finishBuild: (event: BuildFinishedEvent) => void
  loadHistoryAndTemplates: () => Promise<void>
  rerunHistory: (record: BuildHistoryRecord) => void
  saveTemplate: (name: string) => Promise<void>
  applyTemplate: (template: BuildTemplate) => void
  deleteTemplate: (templateId: string) => Promise<void>
}

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

const flattenModules = (modules: MavenModule[]): MavenModule[] =>
  modules.flatMap((moduleItem) => [
    moduleItem,
    ...flattenModules(moduleItem.children ?? []),
  ])

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

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

export const useAppStore = create<AppState>((set, get) => ({
  buildOptions: createDefaultBuildOptions(),
  buildStatus: 'IDLE',
  durationMs: 0,
  logs: [],
  history: [],
  templates: [],
  selectedModules: [],
  selectedModuleIds: [],
  gitChecking: false,
  gitPulling: false,
  gitSwitching: false,
  loading: false,

  initialize: async () => {
    await get().loadHistoryAndTemplates()
    try {
      const settings = await api.loadEnvironmentSettings()
      if (settings.lastProjectPath) {
        await get().parseProjectPath(settings.lastProjectPath)
      } else {
        const environment = await api.detectEnvironment('')
        set({ environment })
      }
    } catch {
      // 浏览器预览或首次启动时没有本地设置，保持空工作台即可。
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
    set({ loading: true, error: undefined, logs: [], gitStatus: undefined })
    try {
      const [project, environment] = await Promise.all([
        api.parseMavenProject(rootPath),
        api.detectEnvironment(rootPath),
      ])
      const buildOptions = createDefaultBuildOptions(project.rootPath, '')
      set({
        project,
        environment,
        selectedModule: undefined,
        selectedModules: [],
        selectedModuleIds: [],
        buildOptions,
        buildStatus: 'IDLE',
        currentBuildId: undefined,
        durationMs: 0,
      })
      await api.saveLastProjectPath(project.rootPath)
      await get().refreshCommandPreview()
      void get().checkGitStatus(project.rootPath)
    } catch (error) {
      set({ error: getErrorMessage(error) })
    } finally {
      set({ loading: false })
    }
  },

  checkGitStatus: async (rootPath?: string) => {
    const targetPath = rootPath ?? get().project?.rootPath
    if (!targetPath) {
      return
    }

    set({ gitChecking: true })
    try {
      const gitStatus = await api.checkGitStatus(targetPath)
      set({ gitStatus })
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
      })
    } finally {
      set({ gitChecking: false })
    }
  },

  fetchGitUpdates: async () => {
    const targetPath = get().project?.rootPath
    if (!targetPath) {
      return
    }

    set({ gitChecking: true, error: undefined })
    try {
      const gitStatus = await api.fetchGitUpdates(targetPath)
      set({ gitStatus })
    } catch (error) {
      set({ error: getErrorMessage(error) })
    } finally {
      set({ gitChecking: false })
    }
  },

  pullGitUpdates: async () => {
    const targetPath = get().project?.rootPath
    if (!targetPath) {
      return
    }

    set({ gitPulling: true, error: undefined })
    try {
      const result = await api.pullGitUpdates(targetPath)
      set({ gitStatus: result.status })
      await get().parseProjectPath(targetPath)
    } catch (error) {
      set({ error: getErrorMessage(error) })
      await get().checkGitStatus(targetPath)
    } finally {
      set({ gitPulling: false })
    }
  },

  switchGitBranch: async (branchName: string) => {
    const targetPath = get().project?.rootPath
    if (!targetPath) {
      return
    }

    set({ gitSwitching: true, error: undefined })
    try {
      const result = await api.switchGitBranch(targetPath, branchName)
      set({ gitStatus: result.status })
      await get().parseProjectPath(targetPath)
    } catch (error) {
      set({ error: getErrorMessage(error) })
      await get().checkGitStatus(targetPath)
    } finally {
      set({ gitSwitching: false })
    }
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

    try {
      const editableCommand = await api.buildCommandPreview({
        options: buildOptions,
        environment,
      })
      set((state) => ({
        buildOptions: {
          ...state.buildOptions,
          editableCommand,
        },
      }))
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },

  updateEnvironment: async (settings: EnvironmentSettings) => {
    const { project } = get()
    try {
      await api.saveEnvironmentSettings(settings)
      const environment = await api.detectEnvironment(project?.rootPath ?? '')
      set({ environment })
      if (project) {
        await get().refreshCommandPreview()
      }
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },

  startBuild: async () => {
    const { buildOptions, environment, selectedModules } = get()
    if (!environment || !buildOptions.projectRoot || !buildOptions.editableCommand.trim()) {
      set({ error: '请先选择项目并确认构建命令。' })
      return
    }

    set({
      buildStatus: 'RUNNING',
      logs: [],
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
      set({ currentBuildId })
    } catch (error) {
      set({ buildStatus: 'FAILED', error: getErrorMessage(error) })
    }
  },

  cancelBuild: async () => {
    const currentBuildId = get().currentBuildId
    if (!currentBuildId) {
      return
    }
    try {
      await api.cancelBuild(currentBuildId)
      set({ buildStatus: 'CANCELLED' })
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },

  appendBuildLog: (event: BuildLogEvent) => {
    set((state) => ({
      logs: [...state.logs.slice(-4999), event],
    }))
  },

  clearBuildLogs: () => {
    set({ logs: [] })
  },

  finishBuild: (event: BuildFinishedEvent) => {
    const { buildOptions, environment, selectedModules, currentBuildId } = get()
    if (event.buildId !== currentBuildId) {
      return
    }
    const record: BuildHistoryRecord = {
      id: event.buildId,
      createdAt: new Date().toISOString(),
      projectRoot: buildOptions.projectRoot,
      modulePath: buildOptions.selectedModulePath,
      moduleArtifactId: moduleSelectionLabel(selectedModules, buildOptions.selectedModulePath),
      command: buildOptions.editableCommand,
      status: event.status,
      durationMs: event.durationMs,
      javaHome: environment?.javaHome,
      mavenHome: environment?.mavenHome,
      useMavenWrapper: environment?.useMavenWrapper ?? false,
    }
    void api.saveBuildHistory(record).then(() => get().loadHistoryAndTemplates())
    set({
      buildStatus: toHistoryStatus(event.status),
      durationMs: event.durationMs,
      currentBuildId: undefined,
    })
  },

  loadHistoryAndTemplates: async () => {
    try {
      const [history, templates] = await Promise.all([
        api.listBuildHistory(),
        api.listTemplates(),
      ])
      set({ history, templates })
    } catch {
      set({ history: [], templates: [] })
    }
  },

  rerunHistory: (record: BuildHistoryRecord) => {
    const project = get().project
    const selectedModules = project
      ? findModulesByPaths(project.modules, record.modulePath)
      : []
    const buildOptions = createDefaultBuildOptions(record.projectRoot, record.modulePath)
    set({
      selectedModule: selectedModules[0],
      selectedModules,
      selectedModuleIds: selectedModules.map((moduleItem) => moduleItem.id),
      buildOptions: {
        ...buildOptions,
        editableCommand: record.command,
      },
      buildStatus: 'IDLE',
      durationMs: record.durationMs,
    })
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
    }
    await api.saveTemplate(template)
    await get().loadHistoryAndTemplates()
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
    }))
    void get().refreshCommandPreview()
  },

  deleteTemplate: async (templateId: string) => {
    await api.deleteTemplate(templateId)
    await get().loadHistoryAndTemplates()
  },
}))
