import {create} from 'zustand'
import type {BuildStatus} from '../types/domain'

/**
 * 构建会话状态机：构建生命周期的唯一权威状态。
 *
 * phase 只允许通过这里的迁移函数在同步段内原子变化 —— 之前「检查 buildStatus
 * 与提交 RUNNING 之间隔着两次 await」，双击就能两次通过守卫；现在所有守卫
 * （开始构建、切换项目、队列调度、停止请求）都读同一份会话状态，迁移即占位。
 *
 * status 是 UI 展示用的构建结果状态（IDLE/RUNNING/SUCCESS/FAILED/CANCELLED），
 * 与 phase 一同由迁移函数维护，二者不会漂移。
 */
export type BuildSessionPhase = 'idle' | 'starting' | 'running' | 'finalizing' | 'done'

interface BuildSessionState {
  phase: BuildSessionPhase
  status: BuildStatus
  buildId?: string
  runToken?: string
  cancelling: boolean
  startedAt?: number
  durationMs: number
  /** 原子抢占启动权：idle|done → starting。返回 false 表示已有会话在推进 */
  beginStart: () => boolean
  /** 启动参数全部就绪、即将发起后端 IPC：进入 RUNNING（UI 立即反映）并记录起始时间 */
  markLaunched: (startedAt: number) => void
  /** starting → running：后端已受理构建（拿到 buildId） */
  markRunning: (buildId: string, runToken: string) => void
  /** starting → idle：预检失败等场景整体回滚，仿佛从未开始 */
  abortStart: () => void
  /** starting → done：启动 IPC 失败，会话以 FAILED 终结 */
  failStart: () => void
  /** running（或启动竞态中的 starting）→ finalizing：后端 build-finished 已受理 */
  beginFinalize: () => boolean
  /** finalizing → done：会话终结，status 写入最终值并清空会话身份 */
  finish: (status: BuildStatus, durationMs: number) => void
  /** 请求停止：starting|running 时置 cancelling 并返回 true，其余阶段拒绝 */
  requestCancel: () => boolean
  /** 停止请求发送失败时撤销标记，允许再次尝试 */
  cancelFailed: () => void
  /** 强制回到 idle（切换项目 / 载入历史参数时清空会话） */
  reset: () => void
  /** 是否有会话在推进（切换项目、队列调度等的忙判定） */
  isBusy: () => boolean
}

const idleSession = {
  phase: 'idle' as BuildSessionPhase,
  status: 'IDLE' as BuildStatus,
  buildId: undefined,
  runToken: undefined,
  cancelling: false,
  startedAt: undefined,
  durationMs: 0,
}

export const useBuildSessionStore = create<BuildSessionState>((set, get) => ({
  ...idleSession,

  beginStart: () => {
    const {phase} = get()
    if (phase !== 'idle' && phase !== 'done') {
      return false
    }
    set({phase: 'starting', cancelling: false})
    return true
  },

  markLaunched: (startedAt) => {
    if (get().phase !== 'starting') return
    set({status: 'RUNNING', startedAt})
  },

  markRunning: (buildId, runToken) => {
    if (get().phase !== 'starting') return
    set({phase: 'running', buildId, runToken})
  },

  abortStart: () => {
    if (get().phase !== 'starting') return
    set({...idleSession})
  },

  failStart: () => {
    if (get().phase !== 'starting') return
    set({...idleSession, phase: 'done', status: 'FAILED'})
  },

  beginFinalize: () => {
    const {phase} = get()
    // starting：启动竞态 —— build-finished 比 startBuild 的 IPC 返回先到
    if (phase !== 'running' && phase !== 'starting') {
      return false
    }
    set({phase: 'finalizing'})
    return true
  },

  finish: (status, durationMs) => {
    if (get().phase !== 'finalizing') return
    set({...idleSession, phase: 'done', status, durationMs})
  },

  requestCancel: () => {
    const {phase} = get()
    if (phase !== 'starting' && phase !== 'running') {
      return false
    }
    set({cancelling: true})
    return true
  },

  cancelFailed: () => {
    if (!get().cancelling) return
    set({cancelling: false})
  },

  reset: () => {
    set({...idleSession})
  },

  isBusy: () => {
    const {phase} = get()
    return phase !== 'idle' && phase !== 'done'
  },
}))
