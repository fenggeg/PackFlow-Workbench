import {create} from 'zustand'
import {api} from '../services/tauri-api'
import type {
    ModuleDependencyGraph,
    SaveServerProfilePayload,
    ServerProfile,
} from '../types/domain'
import {getErrorMessage} from '../utils/errors'

interface WorkflowState {
  dependencyGraph?: ModuleDependencyGraph
  dependencyLoading: boolean
  serverProfiles: ServerProfile[]
  loading: boolean
  error?: string
  initialize: () => Promise<void>
  loadDependencyGraph: (rootPath: string) => Promise<void>
  clearDependencyGraph: () => void
  saveServerProfile: (payload: SaveServerProfilePayload) => Promise<void>
  deleteServerProfile: (serverId: string) => Promise<void>
  testServerConnection: (serverId: string) => Promise<string>
  refreshServerProfiles: () => Promise<void>
}

const sortProfiles = <T extends {updatedAt?: string; name?: string}>(items: T[]) =>
  [...items].sort((left, right) =>
    (right.updatedAt ?? '').localeCompare(left.updatedAt ?? '')
      || (left.name ?? '').localeCompare(right.name ?? '', 'zh-CN'))

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  dependencyLoading: false,
  serverProfiles: [],
  loading: false,

  initialize: async () => {
    set({loading: true, error: undefined})
    try {
      const serverProfiles = await api.listServerProfiles()
      set({
        serverProfiles: sortProfiles(serverProfiles),
      })
    } catch (error) {
      set({error: getErrorMessage(error)})
    } finally {
      set({loading: false})
    }
  },

  loadDependencyGraph: async (rootPath: string) => {
    if (!rootPath) {
      set({dependencyGraph: undefined})
      return
    }
    set({dependencyLoading: true})
    try {
      const dependencyGraph = await api.analyzeProjectDependencies(rootPath)
      set({dependencyGraph})
    } catch (error) {
      set({error: getErrorMessage(error), dependencyGraph: undefined})
    } finally {
      set({dependencyLoading: false})
    }
  },

  clearDependencyGraph: () => {
    set({dependencyGraph: undefined, dependencyLoading: false})
  },

  saveServerProfile: async (payload) => {
    try {
      await api.saveServerProfile(payload)
      await get().refreshServerProfiles()
    } catch (error) {
      set({error: getErrorMessage(error)})
    }
  },

  deleteServerProfile: async (serverId) => {
    try {
      await api.deleteServerProfile(serverId)
      await get().refreshServerProfiles()
    } catch (error) {
      set({error: getErrorMessage(error)})
    }
  },

  testServerConnection: async (serverId) => {
    try {
      const result = await api.testServerConnection(serverId)
      await get().refreshServerProfiles()
      return result
    } catch (error) {
      throw new Error(getErrorMessage(error))
    }
  },

  refreshServerProfiles: async () => {
    try {
      const serverProfiles = await api.listServerProfiles()
      set({
        serverProfiles: sortProfiles(serverProfiles),
      })
    } catch (error) {
      set({error: getErrorMessage(error)})
    }
  },
}))