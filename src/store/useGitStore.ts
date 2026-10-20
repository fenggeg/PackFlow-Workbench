import {create} from 'zustand'
import {api} from '../services/tauri-api'
import {getErrorMessage} from '../utils/errors'
import {notifyError, notifySuccess, notifyWarning} from './useFeedbackStore'
import {useAppStore} from './useAppStore'
import type {GitCommit, GitRepositoryStatus} from '../types/domain'

/**
 * Git 域状态：状态与动作原先内嵌在 useAppStore，与构建/项目逻辑互相纠缠。
 * 拆出后 Git 的生命周期完全自治 —— 切换项目时由 useAppStore.parseProjectPath
 * 调 resetForProject + checkGitStatus，其余场景不需要 appStore 参与。
 *
 * 注意：本模块与 useAppStore 存在模块级循环引用（本项目页需要读当前项目路径），
 * 双方都只在动作函数体内使用对方（运行期才解析），不能在模块顶层解引用。
 */
interface GitState {
  gitStatus?: GitRepositoryStatus
  gitCommits: GitCommit[]
  gitChecking: boolean
  gitCommitsLoading: boolean
  gitPulling: boolean
  gitSwitching: boolean
  gitError?: string
  /** 操作已成功、但需要用户额外处理的提示（如拉取后恢复本地改动冲突） */
  gitWarning?: string
  checkGitStatus: (rootPath?: string) => Promise<void>
  loadGitCommits: (rootPath?: string) => Promise<void>
  fetchGitUpdates: () => Promise<void>
  pullGitUpdates: () => Promise<void>
  switchGitBranch: (branchName: string) => Promise<void>
  clearGitError: () => void
  /** 切换项目时清空上一项目的 Git 状态（不发起请求） */
  resetForProject: () => void
}

const projectRootOf = (rootPath?: string) =>
  rootPath ?? useAppStore.getState().project?.rootPath

export const useGitStore = create<GitState>((set, get) => ({
  gitCommits: [],
  gitChecking: false,
  gitCommitsLoading: false,
  gitPulling: false,
  gitSwitching: false,

  checkGitStatus: async (rootPath?: string) => {
    const targetPath = projectRootOf(rootPath)
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
    const targetPath = projectRootOf(rootPath)
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
    const targetPath = projectRootOf()
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
    // 并发守卫：两次拉取交错执行会让自动贮藏互相抢栈（一次弹掉另一次的条目），
    // 按钮 disabled 只能挡住点击，挡不住自动刷新/快捷键等其它触发路径。
    if (get().gitPulling) {
      return
    }

    const targetPath = projectRootOf()
    if (!targetPath) {
      return
    }

    set({ gitPulling: true, gitError: undefined, gitWarning: undefined })
    try {
      const result = await api.pullGitUpdates(targetPath)
      set({ gitStatus: result.status, gitError: undefined, gitWarning: result.warning ?? undefined })
      await get().loadGitCommits(targetPath)
      // 只刷新模块结构，保留构建日志、产物与已选模块
      await useAppStore.getState().reloadProjectModules(targetPath)
      // 远端更新可能已经生效，只是本地改动的恢复需要用户介入：用警告而不是失败提示
      if (result.warning) {
        notifyWarning('已拉取远端更新，但需要手工处理', result.warning)
      } else {
        notifySuccess('已拉取远端更新')
      }
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
    const targetPath = projectRootOf()
    if (!targetPath) {
      return
    }

    set({ gitSwitching: true, gitError: undefined })
    try {
      const result = await api.switchGitBranch(targetPath, branchName)
      set({ gitStatus: result.status, gitError: undefined })
      await get().loadGitCommits(targetPath)
      // 只刷新模块结构，保留构建日志、产物与已选模块
      await useAppStore.getState().reloadProjectModules(targetPath)
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
    set({ gitError: undefined, gitWarning: undefined })
  },

  resetForProject: () => {
    set({
      gitStatus: undefined,
      gitCommits: [],
      gitError: undefined,
      gitWarning: undefined,
    })
  },
}))
