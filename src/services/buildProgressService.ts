/**
 * 构建进度推导服务
 *
 * Maven 命令不提供进度百分比，这里通过「结构化工作量 + 时间插值」推导，比单纯按模块数均分更贴近真实耗时：
 * - 工作量按阶段加权（编译 4 / 测试 6 / 打包 3 …），而不是每个模块均分
 * - 检测到「打包」阶段时，可直接判定清理/资源/编译/测试已完成，即使它们的日志行没出现
 * - 当前阶段内按时间做指数插值，并用已完成模块的实测耗时校准预期时长，避免日志静默时进度条卡住
 * - 模块数变化（-am 引入上游模块）时总量自动扩展，百分比在 store 层保证单调不回退
 *
 * 推导逻辑是纯函数式的（时间由调用方传入），便于单测与批量节流。
 */

import {sanitizeLogLine} from '@/utils/logText'

export type BuildProgressStatus =
  | 'idle'
  | 'running'
  | 'cancelling'
  | 'success'
  | 'failed'
  | 'cancelled'

export type StepStatus = 'pending' | 'active' | 'done' | 'failed'

export type StageKey = 'prepare' | 'modules' | 'artifacts' | 'completed'

export interface BuildStage {
  key: StageKey
  label: string
  status: StepStatus
}

export interface BuildSubStep {
  key: string
  label: string
  status: StepStatus
}

export interface BuildProgressSnapshot {
  status: BuildProgressStatus
  /** 0 - 100 的整数 */
  percent: number
  /** 进度由日志推导，非 Maven 直接上报 */
  estimated: boolean
  stages: BuildStage[]
  subSteps: BuildSubStep[]
  totalModules: number
  completedModules: number
  currentModule?: string
  /** 当前模块序号（1 起），仅在识别到 Reactor 顺序时可用 */
  currentModuleNumber?: number
  currentPhase?: string
  message?: string
  startedAt?: number
  /** 是否已识别到 Reactor 构建顺序（决定模块进度是否精确） */
  reactorDetected: boolean
  /**
   * 进度无法确定：日志中长时间没有可识别的阶段/模块信号
   * （典型场景：手工改写的命令、-q 安静模式、非 Maven 输出）。
   * 此时百分比只是时间插值编造的数字，界面应降级展示而不是给出误导性数值。
   */
  indeterminate: boolean
}

/**
 * 超过这个时长仍未收到任何可识别信号就判定为「进度无法确定」。
 * Maven 启动 + 打印 Reactor 清单通常远快于 15 秒。
 */
const INDETERMINATE_AFTER_MS = 15_000

interface PhaseRule {
  key: string
  label: string
  /** 工作量权重，按真实耗时占比设置 */
  units: number
}

const PHASE_RULES: PhaseRule[] = [
  {key: 'clean', label: '清理', units: 1},
  {key: 'resources', label: '资源处理', units: 1},
  {key: 'compile', label: '编译', units: 4},
  {key: 'test', label: '测试', units: 6},
  {key: 'integration-test', label: '集成测试', units: 5},
  {key: 'package', label: '打包', units: 3},
  {key: 'install', label: '安装', units: 1},
  {key: 'deploy', label: '部署', units: 1},
]

/**
 * 插件执行行形如：[INFO] --- compiler:3.15.0:compile (default-compile) @ scs-common-core ---
 * Maven 对内置插件会省略 artifactId 的 maven 前缀与 plugin 后缀（clean、resources、compiler、jar），
 * 第三方插件则是 spring-boot:2.6.3:repackage 这种短名，因此统一按「第 3 段的 goal」判阶段。
 */
const PLUGIN_EXECUTION_LINE = /---\s+([^\s:]+):([^\s:]*):([^\s(]+)/

/** goal → 阶段，未列出的 goal（如 git-commit-id:revision）不影响进度 */
const GOAL_PHASE: Record<string, string> = {
  clean: 'clean',
  resources: 'resources',
  testResources: 'resources',
  compile: 'compile',
  testCompile: 'compile',
  test: 'test',
  'integration-test': 'integration-test',
  verify: 'integration-test',
  jar: 'package',
  war: 'package',
  ear: 'package',
  rar: 'package',
  ejb: 'package',
  shade: 'package',
  assembly: 'package',
  repackage: 'package',
  install: 'install',
  deploy: 'deploy',
}

/** 各阶段默认预期耗时（ms），首次构建无样本时使用 */
const PHASE_DEFAULT_MS: Record<string, number> = {
  clean: 1500,
  resources: 1200,
  compile: 12000,
  test: 20000,
  'integration-test': 15000,
  package: 6000,
  install: 1500,
  deploy: 2000,
}

const PREPARE_DEFAULT_MS = 2500
const MIN_SAMPLE_MS = 200
const MAX_SAMPLE_MS = 10 * 60 * 1000

/** 阶段权重：准备 5% / 模块构建 85% / 产物扫描 7% / 完成 3% */
const PREPARE_SPAN = 5
const MODULES_SPAN = 85
const ARTIFACTS_PERCENT = 96
const DONE_PERCENT = 100

/** 时间插值上限：未收到下一阶段日志前最多填充 90%，避免出现「假完成」 */
const TIME_FRACTION_CAP = 0.9

/**
 * 模块头形如：[INFO] Building scs-common 1.0-SNAPSHOT   [2/14]
 * 必须排除插件输出「[INFO] Building jar: D:\...\target\x.jar」——
 * 否则每个 jar 产物都会被当成一个新模块，模块总数会被放大（14 个模块 + 10 个 jar = 24）。
 */
const MODULE_LINE =
  /\[INFO\]\s+Building\s+(?!jar:|war:|ear:|rar:|zip:|tar:|apk:|jmod:)(.+?)(?:\s+\[(\d+)\/(\d+)\])?\s*$/i
const MODULE_COORD_LINE = /\[INFO\]\s*-+\s*<\s*(.+?)\s*>\s*-+/
const REACTOR_SUMMARY_LINE = /^\[INFO\]\s+(.+?)\s+\.{2,}\s+(SUCCESS|FAILURE|SKIPPED)\s+\[/
/** 构建开始前 Maven 会打印完整的 Reactor 构建顺序，据此可提前知道模块总数 */
const REACTOR_ORDER_HEADER = /\[INFO\]\s+Reactor Build Order:/i
const REACTOR_ORDER_ITEM = /^\[INFO\]\s+(\S.*?)\s*$/
const SECTION_LINE = /^(-+|BUILD |Building |Reactor |Total time|Finished at|Download|Scanning)/i
const BUILD_SUCCESS = /\[INFO\]\s+BUILD SUCCESS/
const BUILD_FAILURE = /\[INFO\]\s+BUILD FAILURE/
const SCANNING_PROJECTS = /\[INFO\]\s+Scanning for projects/
const ERROR_LINE = /^\[ERROR\]\s*(.+)$/

export interface BuildProgressTracker {
  goals: string[]
  skipTests: boolean
  totalModules: number
  modulesStarted: number
  reactorCompleted: number
  completedModules: number
  currentModule?: string
  /** Reactor 构建顺序（构建开始前即可确定模块总数） */
  reactorOrder: string[]
  collectingReactorOrder: boolean
  /** Building 行里 [n/N] 后缀给出的总数 */
  reactorIndexTotal: number
  /** Reactor Summary 汇总行数量（等于实际参与构建的模块数） */
  reactorSummaryTotal: number
  /** 当前模块在 reactorOrder 中的下标，-1 表示未知 */
  moduleIndex: number
  /** 计划执行的阶段（按顺序） */
  plannedPhases: string[]
  moduleUnits: number
  currentPhaseKey?: string
  currentPhaseIndex: number
  phaseStartedAt: number
  /** 各阶段实测耗时样本，用于校准预期时长 */
  phaseSamples: Record<string, number[]>
  moduleStartedAt?: number
  prepareSeen: boolean
  prepareDone: boolean
  prepareStartedAt: number
  scanning: boolean
  finished: boolean
  failed: boolean
  cancelled: boolean
  cancelling: boolean
  message?: string
  startedAt: number
}

const ruleOf = (key: string) => PHASE_RULES.find((rule) => rule.key === key)

const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)))

/** 由 goals 推导本次构建会依次经过哪些阶段 */
export const plannedPhasesFor = (goals: string[], skipTests: boolean): string[] => {
  const has = (goal: string) => goals.includes(goal)
  const packaged = has('package') || has('verify') || has('install') || has('deploy')
  const phases: string[] = []

  if (has('clean')) phases.push('clean')
  phases.push('resources', 'compile')
  if (!skipTests && (has('test') || packaged)) phases.push('test')
  if (packaged) phases.push('package')
  if (has('install')) phases.push('install')
  if (has('deploy')) phases.push('deploy')

  return phases.length > 0 ? phases : ['package']
}

const unitsOfPhases = (phases: string[]) =>
  phases.reduce((sum, key) => sum + (ruleOf(key)?.units ?? 1), 0)

const expectedDuration = (tracker: BuildProgressTracker, key: string) => {
  const fallback = PHASE_DEFAULT_MS[key] ?? 4000
  const samples = tracker.phaseSamples[key]
  if (!samples || samples.length === 0) return fallback
  const average = samples.reduce((sum, item) => sum + item, 0) / samples.length
  // 默认时长与实测时长加权，避免个别异常模块把整体带偏
  return Math.round(fallback * 0.4 + average * 0.6)
}

/** 指数插值：耗时越接近预期，填充越接近上限，但永远不会达到 1 */
const timeFraction = (elapsedMs: number, expectedMs: number) => {
  if (expectedMs <= 0 || elapsedMs <= 0) return 0
  return Math.min(TIME_FRACTION_CAP, 1 - Math.exp(-elapsedMs / expectedMs))
}

export const createTracker = (input: {
  totalModules?: number
  goals?: string[]
  skipTests?: boolean
  now?: number
} = {}): BuildProgressTracker => {
  const goals = input.goals ?? []
  const skipTests = input.skipTests ?? false
  const plannedPhases = plannedPhasesFor(goals, skipTests)
  const now = input.now ?? Date.now()

  return {
    goals,
    skipTests,
    totalModules: Math.max(1, input.totalModules ?? 1),
    modulesStarted: 0,
    reactorCompleted: 0,
    completedModules: 0,
    reactorOrder: [],
    collectingReactorOrder: false,
    reactorIndexTotal: 0,
    reactorSummaryTotal: 0,
    moduleIndex: -1,
    plannedPhases,
    moduleUnits: unitsOfPhases(plannedPhases),
    currentPhaseIndex: -1,
    phaseStartedAt: now,
    phaseSamples: {},
    prepareStartedAt: now,
    prepareSeen: false,
    prepareDone: false,
    scanning: false,
    finished: false,
    failed: false,
    cancelled: false,
    cancelling: false,
    startedAt: now,
  }
}

/**
 * 把一段实测耗时按工作量权重分摊到刚完成的若干阶段，用于校准后续模块的预期时长。
 * 某些阶段可能没有输出插件行（例如 pom 模块没有 compile），分摊比只记单个阶段更贴近真实。
 */
const recordSamples = (
  tracker: BuildProgressTracker,
  completedPhases: string[],
  observed: number,
) => {
  if (completedPhases.length === 0) return
  if (observed < MIN_SAMPLE_MS || observed > MAX_SAMPLE_MS) return

  const totalUnits = unitsOfPhases(completedPhases)
  if (totalUnits <= 0) return

  for (const key of completedPhases) {
    const units = ruleOf(key)?.units ?? 1
    const samples = tracker.phaseSamples[key] ?? []
    samples.push(Math.round((observed * units) / totalUnits))
    tracker.phaseSamples[key] = samples.slice(-3)
  }
}

const startPhase = (tracker: BuildProgressTracker, key: string, now: number) => {
  const index = tracker.plannedPhases.indexOf(key)
  if (index < 0) return false
  // 阶段只向前推进，避免 testResources 之类的回退行导致进度倒退
  if (index <= tracker.currentPhaseIndex) return false

  // 刚刚完成的阶段：从当前阶段（或起点）到新阶段之前
  recordSamples(
    tracker,
    tracker.plannedPhases.slice(Math.max(0, tracker.currentPhaseIndex), index),
    now - tracker.phaseStartedAt,
  )

  tracker.currentPhaseKey = key
  tracker.currentPhaseIndex = index
  tracker.phaseStartedAt = now
  return true
}

const startModule = (tracker: BuildProgressTracker, name: string, now: number) => {
  // 上一个模块结束时，把剩余阶段（当前阶段及之后）的耗时记录下来
  if (tracker.currentPhaseIndex >= 0) {
    recordSamples(
      tracker,
      tracker.plannedPhases.slice(tracker.currentPhaseIndex),
      now - tracker.phaseStartedAt,
    )
  }

  tracker.currentModule = name
  tracker.modulesStarted += 1
  tracker.currentPhaseKey = undefined
  tracker.currentPhaseIndex = -1
  tracker.phaseStartedAt = now
  tracker.moduleStartedAt = now
}

/**
 * 在 Reactor 构建顺序里定位模块下标。
 * 顺序表打印的是 artifactId（如 demo-common），而 Building 行带版本号（demo-common 1.0.0），
 * 因此用前缀匹配而不是全等比较。
 */
/**
 * Reactor Build Order 的条目右对齐带 packaging 列，例如：
 *   [INFO] scs-common-core                                                    [jar]
 * 需要先剥掉该列，否则无法与 Building 行的模块名匹配。
 */
const normalizeOrderItem = (raw: string) =>
  raw.replace(/\s+\[(pom|jar|war|ear|maven-plugin|bundle|rar|ejb)\]$/i, '').trim()

const findModuleIndex = (order: string[], name: string) => {
  const exact = order.indexOf(name)
  if (exact >= 0) return exact
  // 取「最长匹配」：scs 是 scs-common 的前缀，直接前缀匹配会定位到错误的模块
  let best = -1
  let bestLength = -1
  order.forEach((entry, index) => {
    if (name.startsWith(`${entry} `) || entry.startsWith(name)) {
      if (entry.length > bestLength) {
        best = index
        bestLength = entry.length
      }
    }
  })
  return best
}

const detectPhase = (line: string) => {
  // 只认 Maven 的插件执行分隔行，避免把普通 INFO 误判为阶段
  const match = PLUGIN_EXECUTION_LINE.exec(line)
  if (!match) return undefined
  const key = GOAL_PHASE[match[3]]
  return key ? ruleOf(key) : undefined
}

/**
 * 消费一批日志行。返回是否发生了变化，供调用方决定是否触发状态更新。
 */
export const ingestLines = (
  tracker: BuildProgressTracker,
  lines: readonly string[],
  now: number = Date.now(),
): boolean => {
  if (tracker.finished || tracker.failed || tracker.cancelled) return false

  let changed = false

  for (const rawLine of lines) {
    // Maven 彩色输出带 ANSI 转义，直接匹配 [INFO] 会失败，必须先清洗
    const line = sanitizeLogLine(rawLine)

    if (!tracker.prepareSeen && SCANNING_PROJECTS.test(line)) {
      tracker.prepareSeen = true
      changed = true
    }

    // 「Reactor Build Order:」之后连续若干行就是本次要构建的全部模块
    if (REACTOR_ORDER_HEADER.test(line)) {
      tracker.collectingReactorOrder = true
      tracker.reactorOrder = []
      tracker.prepareSeen = true
      changed = true
      continue
    }

    if (tracker.collectingReactorOrder) {
      // Maven 会在标题与列表之间插入空的 [INFO] 行，跳过而不是结束收集
      if (/^\[INFO\]\s*$/.test(line)) continue

      const itemMatch = REACTOR_ORDER_ITEM.exec(line)
      // 遇到模块头、插件行或段落分隔即结束收集，避免把 Building X 误当成模块名
      const isSectionBoundary =
        MODULE_LINE.test(line) || MODULE_COORD_LINE.test(line) || Boolean(detectPhase(line))

      if (!isSectionBoundary && itemMatch) {
        const name = normalizeOrderItem(itemMatch[1])
        if (name && !SECTION_LINE.test(name) && !REACTOR_SUMMARY_LINE.test(line)) {
          tracker.reactorOrder.push(name)
          changed = true
          continue
        }
      }
      tracker.collectingReactorOrder = false
    }

    // 「Building X」是模块开始的可靠信号，每个模块只计一次
    const buildingMatch = MODULE_LINE.exec(line)
    if (buildingMatch) {
      const name = buildingMatch[1].trim()
      const indexSuffix = buildingMatch[2] ? Number(buildingMatch[2]) : undefined
      const totalSuffix = buildingMatch[3] ? Number(buildingMatch[3]) : undefined

      if (totalSuffix && Number.isFinite(totalSuffix)) {
        tracker.reactorIndexTotal = Math.max(tracker.reactorIndexTotal, totalSuffix)
        changed = true
      }

      if (name && name !== tracker.currentModule) {
        const previousIndex = tracker.moduleIndex
        startModule(tracker, name, now)
        // 优先用 Maven 自己打印的 [n/N] 序号，其次在 Reactor 顺序里定位；
        // 都拿不到时按「上一个序号 + 1」推进，避免退化成 -1 让界面显示错位。
        const resolved = indexSuffix && Number.isFinite(indexSuffix)
          ? indexSuffix - 1
          : findModuleIndex(tracker.reactorOrder, name)
        tracker.moduleIndex =
          resolved >= 0 ? resolved : Math.max(previousIndex + 1, tracker.modulesStarted - 1)
        tracker.prepareDone = true
        changed = true
      }
    } else {
      // 「--------< g:a >--------」只作为模块名兜底，不参与计数，避免与 Building 行重复统计
      const coordMatch = MODULE_COORD_LINE.exec(line)
      if (coordMatch) {
        const name = coordMatch[1].trim()
        if (name && !tracker.currentModule) {
          tracker.currentModule = name
          tracker.prepareDone = true
          tracker.moduleStartedAt = now
          changed = true
        }
      }
    }

    const reactorMatch = REACTOR_SUMMARY_LINE.exec(line)
    if (reactorMatch) {
      tracker.reactorCompleted += 1
      tracker.reactorSummaryTotal += 1
      changed = true
    }

    const phase = detectPhase(line)
    if (phase) {
      if (startPhase(tracker, phase.key, now)) changed = true
      if (!tracker.prepareDone) {
        tracker.prepareDone = true
        changed = true
      }
      if (!tracker.currentModule) {
        tracker.modulesStarted = Math.max(tracker.modulesStarted, 1)
        tracker.moduleStartedAt = tracker.moduleStartedAt ?? now
      }
    }

    if (BUILD_FAILURE.test(line)) {
      tracker.failed = true
      changed = true
      continue
    }

    // Maven 的 [ERROR] 行通常在 BUILD FAILURE 之前出现，需要提前收集
    if (!tracker.message) {
      const errorMatch = ERROR_LINE.exec(line)
      if (errorMatch) {
        tracker.message = errorMatch[1].trim()
        changed = true
      }
    }

    if (!tracker.failed && BUILD_SUCCESS.test(line)) {
      tracker.finished = true
      changed = true
    }
  }

  if (changed) {
    // 模块进度以 Reactor 为准：先取当前模块下标，其次用「已开始数 - 1」，最后用汇总行计数
    tracker.completedModules = Math.max(
      tracker.reactorCompleted,
      tracker.moduleIndex,
      tracker.modulesStarted - 1,
      0,
    )
    // 模块总数：Reactor 顺序列表是本次构建的权威清单，有它就以它为准；
    // 否则退化为取各日志信号与既有值的较大者（保持单调，不回退）。
    if (tracker.reactorOrder.length > 0) {
      tracker.totalModules = Math.max(1, tracker.reactorOrder.length)
    } else {
      tracker.totalModules = Math.max(
        tracker.totalModules,
        tracker.reactorIndexTotal,
        tracker.reactorSummaryTotal,
        tracker.modulesStarted,
      )
    }
  }

  return changed
}

const stageStatus = (
  tracker: BuildProgressTracker,
  key: StageKey,
): StepStatus => {
  if (tracker.failed) {
    switch (key) {
      case 'prepare':
        return tracker.prepareDone ? 'done' : 'failed'
      case 'modules':
        return tracker.prepareDone ? 'failed' : 'pending'
      default:
        return 'pending'
    }
  }
  if (tracker.cancelled) {
    return key === 'prepare' ? 'done' : 'pending'
  }
  if (tracker.finished) {
    if (key === 'completed') return 'done'
    if (key === 'artifacts') return tracker.scanning ? 'active' : 'done'
    return 'done'
  }
  switch (key) {
    case 'prepare':
      return tracker.prepareDone ? 'done' : 'active'
    case 'modules':
      return tracker.prepareDone ? 'active' : 'pending'
    case 'artifacts':
      return tracker.scanning ? 'active' : 'pending'
    case 'completed':
      return 'pending'
  }
}

/** 阶段 / 子步骤共用的三态判定 */
const stepStatusAt = (
  index: number,
  activeIndex: number,
  failed: boolean,
  finished: boolean,
): StepStatus => {
  if (failed) {
    if (activeIndex < 0) return 'pending'
    if (index < activeIndex) return 'done'
    if (index === activeIndex) return 'failed'
    return 'pending'
  }
  if (finished) return 'done'
  if (activeIndex < 0) return 'pending'
  if (index < activeIndex) return 'done'
  if (index === activeIndex) return 'active'
  return 'pending'
}

export const buildSnapshot = (
  tracker: BuildProgressTracker,
  now: number = Date.now(),
): BuildProgressSnapshot => {
  const stages: BuildStage[] = [
    {key: 'prepare', label: '准备', status: stageStatus(tracker, 'prepare')},
    {key: 'modules', label: '构建模块', status: stageStatus(tracker, 'modules')},
    {key: 'artifacts', label: '扫描产物', status: stageStatus(tracker, 'artifacts')},
    {key: 'completed', label: '完成', status: stageStatus(tracker, 'completed')},
  ]

  // 子步骤只展示用户能感知的阶段，不做过细拆分
  const subStepKeys = tracker.plannedPhases.filter((key) => key !== 'resources')
  const subSteps: BuildSubStep[] = subStepKeys.map((key) => {
    const rule = ruleOf(key)
    return {key, label: rule?.label ?? key, status: 'pending'}
  })

  const activeSubIndex = tracker.prepareDone ? subStepKeys.indexOf(tracker.currentPhaseKey ?? '') : -1
  subSteps.forEach((step, index) => {
    step.status = stepStatusAt(index, activeSubIndex, tracker.failed, tracker.finished)
  })

  const status: BuildProgressStatus = tracker.failed
    ? 'failed'
    : tracker.cancelled
      ? 'cancelled'
      : tracker.cancelling
        ? 'cancelling'
        : tracker.finished
          ? tracker.scanning
            ? 'running'
            : 'success'
          : 'running'

  // —— 百分比：结构化工作量 + 当前阶段时间插值 ——
  const prepareElapsed = now - tracker.prepareStartedAt
  const prepareFraction = tracker.prepareDone
    ? 1
    : timeFraction(prepareElapsed, PREPARE_DEFAULT_MS) * (tracker.prepareSeen ? 0.9 : 0.6)

  const moduleTotal = Math.max(1, tracker.totalModules) * Math.max(1, tracker.moduleUnits)
  const completedUnits = tracker.completedModules * tracker.moduleUnits

  let currentUnits = 0
  let partialUnits = 0
  if (tracker.prepareDone && !tracker.finished) {
    const index = tracker.currentPhaseIndex >= 0 ? tracker.currentPhaseIndex : 0
    for (let i = 0; i < index; i += 1) {
      const key = tracker.plannedPhases[i]
      currentUnits += ruleOf(key)?.units ?? 1
    }
    const activeKey = tracker.plannedPhases[index]
    if (activeKey) {
      const activeUnits = ruleOf(activeKey)?.units ?? 1
      const elapsed = now - tracker.phaseStartedAt
      partialUnits = activeUnits * timeFraction(elapsed, expectedDuration(tracker, activeKey))
    }
  }

  const moduleFraction = Math.min(
    1,
    (completedUnits + currentUnits + partialUnits) / moduleTotal,
  )

  let percent: number
  if (tracker.failed || tracker.cancelled) {
    percent = clampPercent(prepareFraction * PREPARE_SPAN + moduleFraction * MODULES_SPAN)
  } else if (tracker.finished && !tracker.scanning) {
    percent = DONE_PERCENT
  } else if (tracker.scanning) {
    percent = ARTIFACTS_PERCENT
  } else {
    percent = clampPercent(prepareFraction * PREPARE_SPAN + moduleFraction * MODULES_SPAN)
  }

  // 日志里什么信号都没有时，百分比只是时间插值的产物 —— 明确标记为无法确定
  const hasProgressSignal =
    tracker.reactorOrder.length > 0
    || tracker.completedModules > 0
    || Boolean(tracker.currentPhaseKey)
    || tracker.prepareDone
    || tracker.reactorIndexTotal > 0
  const indeterminate =
    status === 'running'
    && !hasProgressSignal
    && now - tracker.startedAt > INDETERMINATE_AFTER_MS

  return {
    status,
    percent,
    estimated: true,
    indeterminate,
    stages,
    subSteps,
    totalModules: tracker.totalModules,
    completedModules: tracker.completedModules,
    currentModule: tracker.currentModule,
    // [n/N] 后缀或 Reactor 顺序任一可用即可给出精确序号
    currentModuleNumber: tracker.moduleIndex >= 0 ? tracker.moduleIndex + 1 : undefined,
    currentPhase: tracker.currentPhaseKey ? ruleOf(tracker.currentPhaseKey)?.label : undefined,
    message: tracker.message,
    startedAt: tracker.startedAt,
    reactorDetected: tracker.reactorOrder.length > 0,
  }
}

export const IDLE_SNAPSHOT: BuildProgressSnapshot = {
  status: 'idle',
  percent: 0,
  estimated: true,
  stages: [
    {key: 'prepare', label: '准备', status: 'pending'},
    {key: 'modules', label: '构建模块', status: 'pending'},
    {key: 'artifacts', label: '扫描产物', status: 'pending'},
    {key: 'completed', label: '完成', status: 'pending'},
  ],
  subSteps: [],
  totalModules: 0,
  completedModules: 0,
  reactorDetected: false,
  indeterminate: false,
}
