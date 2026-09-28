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

// 请求序号：拦截切换项目后迟到的旧查询结果
let loadRequestId = 0

export const useWorkflowStore = create<WorkflowState>((set) => ({
  dependencyLoading: false,

  loadDependencyGraph: async (rootPath: string) => {
    if (!rootPath) {
      loadRequestId += 1
      set({dependencyGraph: undefined})
      return
    }
    const requestId = ++loadRequestId
    set({dependencyLoading: true})
    try {
      const dependencyGraph = await api.analyzeProjectDependencies(rootPath)
      // 仅应用最新一次请求的结果：快速切换项目时，旧项目的慢查询
      // 不能把新项目已加载的依赖图覆盖掉
      if (requestId !== loadRequestId) return
      set({dependencyGraph})
    } catch (error) {
      if (requestId !== loadRequestId) return
      set({error: getErrorMessage(error), dependencyGraph: undefined})
    } finally {
      if (requestId === loadRequestId) {
        set({dependencyLoading: false})
      }
    }
  },

  clearDependencyGraph: () => {
    loadRequestId += 1
    set({dependencyGraph: undefined, dependencyLoading: false})
  },
}))
