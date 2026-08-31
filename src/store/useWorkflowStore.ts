import {create} from 'zustand'
import {api} from '../services/tauri-api'
import type {ModuleDependencyGraph} from '../types/domain'
import {getErrorMessage} from '../utils/errors'

interface WorkflowState {
  dependencyGraph?: ModuleDependencyGraph
  dependencyLoading: boolean
  error?: string
  loadDependencyGraph: (rootPath: string) => Promise<void>
  clearDependencyGraph: () => void
}

export const useWorkflowStore = create<WorkflowState>((set) => ({
  dependencyLoading: false,

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
}))
