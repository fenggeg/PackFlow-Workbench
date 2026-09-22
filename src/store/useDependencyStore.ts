import {create} from 'zustand'
import {listen} from '@tauri-apps/api/event'
import {api, isTauriRuntime} from '@/services/tauri-api'
import type {ConflictScanProgress, DependencyConflictResult} from '@/types/domain'
import {getErrorMessage} from '@/utils/errors'
import {notifyError, notifyInfo} from './useFeedbackStore'

interface DependencyState {
  scanning: boolean
  elapsed: number
  progress?: ConflictScanProgress
  result?: DependencyConflictResult
  error?: string
  scannedRootPath?: string
  startScan: (rootPath: string) => Promise<void>
  cancelScan: () => void
  clear: () => void
}

/**
 * 扫描状态提升到 store：
 * 1) 切换侧边栏页签（Radix Tabs 会卸载非激活面板）不会丢失进度与结果
 * 2) 事件监听在 store 层注册一次，不随组件挂载/卸载反复解绑
 */
let progressUnlisten: (() => void) | null = null
let elapsedTimer: ReturnType<typeof setInterval> | null = null
/** 每次扫描的令牌，用于丢弃「已放弃等待」的过期结果 */
let activeToken = 0

const stopElapsedTimer = () => {
  if (elapsedTimer) {
    clearInterval(elapsedTimer)
    elapsedTimer = null
  }
}

const ensureProgressListener = async () => {
  if (progressUnlisten || !isTauriRuntime()) return
  try {
    progressUnlisten = await listen<ConflictScanProgress>(
      'dependency-conflict-progress',
      (event) => {
        useDependencyStore.setState({progress: event.payload})
      },
    )
  } catch {
    // 浏览器预览下监听失败可忽略
  }
}

export const useDependencyStore = create<DependencyState>((set, get) => ({
  scanning: false,
  elapsed: 0,

  startScan: async (rootPath: string) => {
    if (get().scanning) return

    const token = ++activeToken
    void ensureProgressListener()
    set({
      scanning: true,
      elapsed: 0,
      progress: undefined,
      result: undefined,
      error: undefined,
      scannedRootPath: rootPath,
    })

    stopElapsedTimer()
    elapsedTimer = setInterval(() => {
      // 仅当前扫描仍在等待时才累加，避免放弃等待后继续跳动
      if (token === activeToken) {
        set((state) => ({elapsed: state.elapsed + 1}))
      }
    }, 1000)

    try {
      const data = await api.detectDependencyConflicts(rootPath)
      if (token !== activeToken) return
      set({result: data, scanning: false})
      if (!data.hasConflicts) {
        notifyInfo('未发现依赖冲突')
      }
    } catch (error) {
      if (token !== activeToken) return
      const message = getErrorMessage(error)
      set({error: message, scanning: false})
      notifyError('依赖冲突扫描失败', message)
    } finally {
      if (token === activeToken) {
        stopElapsedTimer()
        set({scanning: false})
      }
    }
  },

  cancelScan: () => {
    if (!get().scanning) return
    // 后端现在有真正的中断命令：先终止 mvn 进程树，再放弃等待
    activeToken += 1
    stopElapsedTimer()
    set({scanning: false, progress: undefined, elapsed: 0})
    void api
      .cancelDependencyScan()
      .then((killed) => {
        notifyInfo(
          '已取消依赖冲突扫描',
          killed ? '已终止 dependency:tree 进程。' : '扫描进程已结束，结果不会写入面板。',
        )
      })
      .catch(() => {
        notifyInfo('已放弃等待本次扫描', '结果不会写入面板。')
      })
  },

  clear: () => {
    activeToken += 1
    stopElapsedTimer()
    set({scanning: false, elapsed: 0, progress: undefined, result: undefined, error: undefined})
  },
}))
