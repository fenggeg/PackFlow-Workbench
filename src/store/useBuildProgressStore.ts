import {create} from 'zustand'
import {
  buildSnapshot,
  createTracker,
  IDLE_SNAPSHOT,
  ingestLines,
  type BuildProgressSnapshot,
  type BuildProgressTracker,
} from '@/services/buildProgressService'

/** 时间插值刷新间隔：与日志无关地推进进度，避免日志静默时进度条卡住 */
const TICK_INTERVAL = 500

interface BuildProgressState {
  snapshot: BuildProgressSnapshot
  /** 是否显示进度区（完成/失败后都保留，直到手动收起或开始新一轮构建） */
  visible: boolean
  startRun: (input: {totalModules?: number; goals?: string[]; skipTests?: boolean}) => void
  ingestLines: (lines: readonly string[]) => void
  markCancelling: () => void
  startArtifactScan: () => void
  complete: () => void
  fail: (message?: string) => void
  cancelComplete: () => void
  dismiss: () => void
  reset: () => void
}

/**
 * tracker 放在模块作用域而不是 state 里：
 * 高频日志只修改 tracker，仅在快照真正变化时才写入 store，避免日志刷屏引发渲染风暴。
 */
let tracker: BuildProgressTracker | null = null
let tickTimer: ReturnType<typeof setInterval> | null = null

const stopTick = () => {
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
}

const signature = (snapshot: BuildProgressSnapshot) =>
  [
    snapshot.status,
    snapshot.percent,
    snapshot.currentModule ?? '',
    snapshot.currentPhase ?? '',
    snapshot.completedModules,
    snapshot.totalModules,
    snapshot.message ?? '',
    snapshot.indeterminate ? '1' : '0',
    snapshot.stages.map((stage) => stage.status).join(''),
    snapshot.subSteps.map((step) => step.status).join(''),
  ].join('|')

export const useBuildProgressStore = create<BuildProgressState>((set, get) => {
  /**
   * 重新计算并发布快照。
   * 百分比保持单调不递减：模块数扩展（-am 引入上游模块）时不让进度条回退。
   */
  const publish = () => {
    if (!tracker) return
    const previous = get().snapshot
    const next = buildSnapshot(tracker)
    if (previous.status !== 'idle' && previous.startedAt === next.startedAt) {
      next.percent = Math.max(previous.percent, next.percent)
    }
    if (signature(next) === signature(previous)) return
    set({snapshot: next})
  }

  const startTick = () => {
    stopTick()
    tickTimer = setInterval(publish, TICK_INTERVAL)
  }

  return {
    snapshot: IDLE_SNAPSHOT,
    visible: false,

    startRun: ({totalModules, goals, skipTests}) => {
      tracker = createTracker({totalModules, goals, skipTests})
      set({snapshot: buildSnapshot(tracker), visible: true})
      startTick()
    },

    ingestLines: (lines) => {
      if (!tracker || lines.length === 0) return
      if (ingestLines(tracker, lines)) publish()
    },

    markCancelling: () => {
      if (!tracker) return
      tracker.cancelling = true
      publish()
    },

    startArtifactScan: () => {
      if (!tracker) return
      tracker.scanning = true
      publish()
    },

    complete: () => {
      if (!tracker) return
      stopTick()
      tracker.scanning = false
      tracker.finished = true
      // 完成状态保留展示，不再自动收起
      publish()
      set({visible: true})
    },

    fail: (message) => {
      if (!tracker) return
      stopTick()
      tracker.failed = true
      tracker.scanning = false
      if (message) tracker.message = message
      publish()
      set({visible: true})
    },

    cancelComplete: () => {
      if (!tracker) return
      stopTick()
      tracker.cancelled = true
      tracker.cancelling = false
      tracker.scanning = false
      publish()
      set({visible: true})
    },

    dismiss: () => set({visible: false}),

    reset: () => {
      stopTick()
      tracker = null
      set({snapshot: IDLE_SNAPSHOT, visible: false})
    },
  }
})
