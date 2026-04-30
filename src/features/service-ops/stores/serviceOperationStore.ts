import {create} from 'zustand'
import {api} from '../../../services/tauri-api'
import type {
    DeploymentProfile,
    ServerProfile,
    ServiceOperationHistory,
    ServiceOperationLogEvent,
    ServiceOperationTask,
    ServiceRuntimeConfig,
} from '../../../types/domain'
import {deriveRuntimeConfig, getEnvironmentId, runtimeConfigKey} from '../services/serviceRuntimeConfigService'

interface ServiceOperationState {
  runtimeConfigs: ServiceRuntimeConfig[]
  histories: ServiceOperationHistory[]
  tasksById: Record<string, ServiceOperationTask>
  currentTaskId?: string
  logsByTaskId: Record<string, string[]>
  loading: boolean
  error?: string
  initialize: () => Promise<void>
  refreshHistories: () => Promise<void>
  saveRuntimeConfig: (config: ServiceRuntimeConfig) => Promise<ServiceRuntimeConfig>
  ensureRuntimeConfig: (profile: DeploymentProfile, server: ServerProfile) => Promise<ServiceRuntimeConfig>
  startRestart: (config: ServiceRuntimeConfig) => Promise<string>
  startHealthCheck: (config: ServiceRuntimeConfig) => Promise<string>
  appendOperationLog: (event: ServiceOperationLogEvent) => void
  updateOperationTask: (task: ServiceOperationTask) => void
  finishOperationTask: (task: ServiceOperationTask) => void
}

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

const sortHistories = (items: ServiceOperationHistory[]) =>
  [...items].sort((left, right) => right.startedAt.localeCompare(left.startedAt))

const sortRuntimeConfigs = (items: ServiceRuntimeConfig[]) =>
  [...items].sort((left, right) =>
    (right.updatedAt ?? '').localeCompare(left.updatedAt ?? '')
    || left.serviceName.localeCompare(right.serviceName, 'zh-CN'))

const findRuntimeConfig = (
  configs: ServiceRuntimeConfig[],
  profile: DeploymentProfile,
  server: ServerProfile,
) => {
  const environmentId = getEnvironmentId(server)
  const key = runtimeConfigKey(profile.id, server.id, environmentId)
  return configs.find((config) =>
    runtimeConfigKey(config.serviceMappingId, config.serverId, config.environmentId) === key)
}

export const useServiceOperationStore = create<ServiceOperationState>((set, get) => ({
  runtimeConfigs: [],
  histories: [],
  tasksById: {},
  logsByTaskId: {},
  loading: false,

  initialize: async () => {
    set({loading: true, error: undefined})
    try {
      const [runtimeConfigs, histories] = await Promise.all([
        api.listServiceRuntimeConfigs(),
        api.listServiceOperationHistories(),
      ])
      set({
        runtimeConfigs: sortRuntimeConfigs(runtimeConfigs),
        histories: sortHistories(histories),
      })
    } catch (error) {
      set({error: getErrorMessage(error)})
    } finally {
      set({loading: false})
    }
  },

  refreshHistories: async () => {
    try {
      const histories = await api.listServiceOperationHistories()
      set({histories: sortHistories(histories)})
    } catch (error) {
      set({error: getErrorMessage(error)})
    }
  },

  saveRuntimeConfig: async (config) => {
    const saved = await api.saveServiceRuntimeConfig(config)
    set((state) => ({
      runtimeConfigs: sortRuntimeConfigs([
        saved,
        ...state.runtimeConfigs.filter((item) => item.id !== saved.id),
      ]),
    }))
    return saved
  },

  ensureRuntimeConfig: async (profile, server) => {
    const existing = findRuntimeConfig(get().runtimeConfigs, profile, server)
    const derived = deriveRuntimeConfig(profile, server, existing)
    if (existing) {
      return derived
    }
    return get().saveRuntimeConfig(derived)
  },

  startRestart: async (config) => {
    const saved = await get().saveRuntimeConfig(config)
    const taskId = await api.startServiceRestart(saved.id)
    set((state) => ({
      currentTaskId: taskId,
      tasksById: {
        ...state.tasksById,
        [taskId]: {
          id: taskId,
          serviceRuntimeConfigId: saved.id,
          type: 'restart',
          status: 'running',
          startedAt: new Date().toISOString(),
          outputLines: ['已提交服务重启任务。'],
        },
      },
      logsByTaskId: {...state.logsByTaskId, [taskId]: ['已提交服务重启任务。']},
    }))
    return taskId
  },

  startHealthCheck: async (config) => {
    const saved = await get().saveRuntimeConfig(config)
    const taskId = await api.startServiceHealthCheck(saved.id)
    set((state) => ({
      currentTaskId: taskId,
      tasksById: {
        ...state.tasksById,
        [taskId]: {
          id: taskId,
          serviceRuntimeConfigId: saved.id,
          type: 'health_check',
          status: 'running',
          startedAt: new Date().toISOString(),
          outputLines: ['已提交健康检查任务。'],
        },
      },
      logsByTaskId: {...state.logsByTaskId, [taskId]: ['已提交健康检查任务。']},
    }))
    return taskId
  },

  appendOperationLog: (event) => {
    set((state) => ({
      logsByTaskId: {
        ...state.logsByTaskId,
        [event.taskId]: [...(state.logsByTaskId[event.taskId] ?? []), event.line],
      },
    }))
  },

  updateOperationTask: (task) => {
    set((state) => ({
      currentTaskId: task.id,
      tasksById: {...state.tasksById, [task.id]: task},
      logsByTaskId: {
        ...state.logsByTaskId,
        [task.id]: state.logsByTaskId[task.id] ?? task.outputLines,
      },
    }))
  },

  finishOperationTask: (task) => {
    set((state) => ({
      currentTaskId: task.id,
      tasksById: {...state.tasksById, [task.id]: task},
      logsByTaskId: {
        ...state.logsByTaskId,
        [task.id]: task.outputLines.length > 0 ? task.outputLines : (state.logsByTaskId[task.id] ?? []),
      },
    }))
    void get().refreshHistories()
  },
}))
