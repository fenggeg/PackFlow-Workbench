import type {BuildOptions} from '@/types/domain'

/** Maven 生命周期顺序：goals 必须按此顺序拼接到命令中 */
const MAVEN_GOAL_ORDER = [
  'clean',
  'validate',
  'generate-sources',
  'compile',
  'test-compile',
  'test',
  'package',
  'verify',
  'install',
  'deploy',
  'site',
]

/** 「常用开关」预设参数，单独维护，避免与手写参数互相覆盖 */
export const COMMON_ARG_VALUES = ['-U', '-o', '-e', '-X', '-q', '-DskipITs'] as const

const COMMON_ARG_SET = new Set<string>(COMMON_ARG_VALUES)

const goalRank = (goal: string) => {
  const index = MAVEN_GOAL_ORDER.indexOf(goal)
  return index === -1 ? MAVEN_GOAL_ORDER.length : index
}

/** 按 Maven 生命周期排序，未知 goal 保持相对顺序排在末尾 */
export const sortGoals = (goals: string[]): string[] => {
  const unique = Array.from(new Set(goals.map((goal) => goal.trim()).filter(Boolean)))
  return unique
    .map((goal, index) => ({goal, index, rank: goalRank(goal)}))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((item) => item.goal)
}

export interface SplitCustomArgs {
  commonArgs: string[]
  extraArgs: string[]
  threadCount?: number
}

const THREAD_PATTERN = /^-T(\d+.*)$/

/** 把扁平的 customArgs 拆成结构化字段（用于读取历史/模板等旧数据） */
export const splitCustomArgs = (args: string[] = []): SplitCustomArgs => {
  const commonArgs: string[] = []
  const extraArgs: string[] = []
  let threadCount: number | undefined

  for (const arg of args) {
    if (COMMON_ARG_SET.has(arg)) {
      commonArgs.push(arg)
      continue
    }
    const threadMatch = THREAD_PATTERN.exec(arg)
    if (threadMatch) {
      const parsed = Number(threadMatch[1])
      if (Number.isFinite(parsed) && parsed > 0) {
        threadCount = parsed
        continue
      }
    }
    extraArgs.push(arg)
  }

  return {commonArgs, extraArgs, threadCount}
}

/** 由结构化字段合成最终传给后端的 customArgs（顺序稳定） */
export const composeCustomArgs = ({
  commonArgs,
  extraArgs,
  threadCount,
}: SplitCustomArgs): string[] => {
  const result: string[] = [...commonArgs]
  if (threadCount && threadCount > 0) {
    result.push(`-T${threadCount}`)
  }
  result.push(...extraArgs)
  return result
}

/**
 * 归一化构建参数：
 * - goals 始终按生命周期排序，避免「先勾 package 再勾 clean」生成 mvn package clean
 * - customArgs 始终由 commonArgs / threadCount / extraArgs 合成，避免多入口互相覆盖
 */
export const normalizeBuildOptions = (options: BuildOptions): BuildOptions => {
  const structured: SplitCustomArgs =
    options.commonArgs || options.extraArgs || options.threadCount !== undefined
      ? {
          commonArgs: options.commonArgs ?? [],
          extraArgs: options.extraArgs ?? [],
          threadCount: options.threadCount,
        }
      : splitCustomArgs(options.customArgs)

  return {
    ...options,
    goals: sortGoals(options.goals),
    commonArgs: structured.commonArgs,
    extraArgs: structured.extraArgs,
    threadCount: structured.threadCount,
    customArgs: composeCustomArgs(structured),
  }
}

export const toggleGoal = (goals: string[], goal: string, checked: boolean) =>
  sortGoals(checked ? [...goals, goal] : goals.filter((item) => item !== goal))
