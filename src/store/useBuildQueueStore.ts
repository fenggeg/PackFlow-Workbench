import {create} from 'zustand'
import {useAppStore} from './useAppStore'
import {createDefaultBuildOptions} from '@/services/tauri-api'
import {notifyError, notifyInfo} from './useFeedbackStore'
import type {BuildOptions, BuildStatus} from '@/types/domain'

export type QueueItemStatus = 'waiting' | 'running' | 'success' | 'failed' | 'cancelled'

export interface QueueItem {
  id: string
  /** 展示用名称：模块名或「全部项目」 */
  label: string
  projectRoot: string
  moduleIds: string[]
  options: BuildOptions
  status: QueueItemStatus
  createdAt: number
  durationMs?: number
}

interface BuildQueueState {
  items: QueueItem[]
  /** 防止 runNext 重入：启动过程本身是异步的 */
  running: boolean
  enqueueCurrent: () => void
  enqueueProjects: (projectRoots: string[]) => void
  removeItem: (id: string) => void
  clearFinished: () => void
  clearAll: () => void
  markRunningFinished: (status: BuildStatus, durationMs: number) => void
  runNext: () => Promise<void>
}

const mapStatus = (status: BuildStatus): QueueItemStatus => {
  if (status === 'SUCCESS') return 'success'
  if (status === 'CANCELLED') return 'cancelled'
  return 'failed'
}

/**
 * 构建队列：把「依次构建多个模块 / 多个项目」变成一次排队，而不是手动反复点构建。
 *
 * 说明：日志、进度等仍跟随当前活动构建（单任务视图），队列只负责调度下一个。
 * 这样既补上了「连续构建」的能力，又不需要重构既有的单任务状态模型。
 */
export const useBuildQueueStore = create<BuildQueueState>((set, get) => ({
  items: [],
  running: false,

  enqueueCurrent: () => {
    const state = useAppStore.getState()
    const {buildOptions, selectedModules} = state
    if (!buildOptions.projectRoot) {
      notifyError('无法加入队列', '请先选择项目。')
      return
    }
    const label = selectedModules.length === 0
      ? '全部项目'
      : selectedModules.length === 1
        ? selectedModules[0].artifactId
        : `${selectedModules.length} 个模块`
    const item: QueueItem = {
      id: crypto.randomUUID(),
      label,
      projectRoot: buildOptions.projectRoot,
      moduleIds: selectedModules.map((moduleItem) => moduleItem.id),
      options: {...buildOptions},
      status: 'waiting',
      createdAt: Date.now(),
    }
    set((current) => ({items: [...current.items, item]}))
    notifyInfo('已加入构建队列', `${label} 将在当前构建结束后自动开始。`)
    void get().runNext()
  },

  enqueueProjects: (projectRoots) => {
    const created: QueueItem[] = projectRoots.map((rootPath) => ({
      id: crypto.randomUUID(),
      label: rootPath.split(/[\\/]/).filter(Boolean).slice(-1)[0] ?? rootPath,
      projectRoot: rootPath,
      moduleIds: [],
      options: createDefaultBuildOptions(rootPath, ''),
      status: 'waiting',
      createdAt: Date.now(),
    }))
    if (created.length === 0) return
    set((current) => ({items: [...current.items, ...created]}))
    notifyInfo('已加入构建队列', `${created.length} 个项目将依次构建。`)
    void get().runNext()
  },

  removeItem: (id) => {
    set((current) => ({items: current.items.filter((item) => item.id !== id)}))
  },

  clearFinished: () => {
    set((current) => ({items: current.items.filter((item) => item.status === 'waiting' || item.status === 'running')}))
  },

  clearAll: () => set({items: []}),

  markRunningFinished: (status, durationMs) => {
    set((current) => ({
      items: current.items.map((item) =>
        item.status === 'running' ? {...item, status: mapStatus(status), durationMs} : item,
      ),
    }))
  },

  runNext: async () => {
    if (get().running) return
    // 上一个构建仍在进行时不能启动新任务，等 build-finished 事件再次触发
    if (useAppStore.getState().buildStatus === 'RUNNING') return
    const next = get().items.find((item) => item.status === 'waiting')
    if (!next) return

    set({running: true})
    try {
      set((current) => ({
        items: current.items.map((item) =>
          item.id === next.id ? {...item, status: 'running'} : item,
        ),
      }))

      const app = useAppStore.getState()
      if (app.project?.rootPath !== next.projectRoot) {
        await app.parseProjectPath(next.projectRoot)
      }
      // 应用队列项的参数与模块选择后复用既有 startBuild 流程
      useAppStore.setState({buildOptions: next.options})
      useAppStore.getState().setSelectedModules(next.moduleIds)
      await useAppStore.getState().startBuild()

      if (useAppStore.getState().buildStatus !== 'RUNNING') {
        // 预检未通过或被拦截：标记失败并继续下一项，避免队列卡死
        set((current) => ({
          items: current.items.map((item) =>
            item.id === next.id ? {...item, status: 'failed'} : item,
          ),
          running: false,
        }))
        void get().runNext()
        return
      }
    } finally {
      set({running: false})
    }
  },
}))

// 构建结束时自动调度下一个队列项
useAppStore.subscribe((state, previous) => {
  if (previous.buildStatus === 'RUNNING' && state.buildStatus !== 'RUNNING') {
    const queue = useBuildQueueStore.getState()
    queue.markRunningFinished(state.buildStatus, state.durationMs)
    void queue.runNext()
  }
})
