import type {BuildArtifact, BuildHistoryRecord} from '@/types/domain'

export const formatDuration = (ms: number) => {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes <= 0) return `${seconds} 秒`
  if (minutes < 60) return `${minutes} 分 ${seconds} 秒`
  const hours = Math.floor(minutes / 60)
  return `${hours} 小时 ${minutes % 60} 分`
}

export const formatBytes = (bytes?: number) => {
  if (bytes === undefined) return '-'
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

export interface DurationBaseline {
  sampleCount: number
  averageMs: number
  lastMs?: number
}

/** 构建耗时基线：同项目 + 相同模块范围的成功记录才有可比性 */
export const buildDurationBaseline = (
  history: BuildHistoryRecord[],
  projectRoot: string,
  modulePath: string,
): DurationBaseline | undefined => {
  if (!projectRoot) return undefined
  const samples = history.filter(
    (record) =>
      record.projectRoot === projectRoot
      && record.modulePath === modulePath
      && record.status === 'SUCCESS'
      // 过滤掉明显异常（秒级或几小时级）的样本，避免拉偏基线
      && record.durationMs > 1000
      && record.durationMs < 6 * 60 * 60 * 1000,
  )
  if (samples.length === 0) return undefined
  const total = samples.reduce((sum, record) => sum + record.durationMs, 0)
  return {
    sampleCount: samples.length,
    averageMs: Math.round(total / samples.length),
    lastMs: samples[0].durationMs,
  }
}

export interface ArtifactDiffEntry {
  fileName: string
  path: string
  previousBytes?: number
  currentBytes?: number
}

export interface ArtifactDiff {
  added: ArtifactDiffEntry[]
  removed: ArtifactDiffEntry[]
  changed: ArtifactDiffEntry[]
  unchangedCount: number
}

/** 本次产物与上一次成功构建的产物做差异，用于快速发现异常（体积暴涨、产物缺失） */
export const diffArtifacts = (
  current: BuildArtifact[],
  previous: BuildArtifact[],
): ArtifactDiff => {
  const previousByPath = new Map(previous.map((item) => [item.path, item]))
  const currentByPath = new Map(current.map((item) => [item.path, item]))
  const added: ArtifactDiffEntry[] = []
  const changed: ArtifactDiffEntry[] = []
  let unchangedCount = 0

  for (const item of current) {
    const before = previousByPath.get(item.path)
    if (!before) {
      added.push({fileName: item.fileName, path: item.path, currentBytes: item.sizeBytes})
      continue
    }
    if (before.sizeBytes !== item.sizeBytes) {
      changed.push({
        fileName: item.fileName,
        path: item.path,
        previousBytes: before.sizeBytes,
        currentBytes: item.sizeBytes,
      })
    } else {
      unchangedCount += 1
    }
  }

  const removed = previous
    .filter((item) => !currentByPath.has(item.path))
    .map((item) => ({fileName: item.fileName, path: item.path, previousBytes: item.sizeBytes}))

  return {added, removed, changed, unchangedCount}
}

export interface HistorySummary {
  total: number
  success: number
  failed: number
  cancelled: number
  successRate: number
  averageDurationMs?: number
  slowestModule?: {artifactId: string; averageMs: number; sampleCount: number}
  recentSevenDays: number
}

/** 历史统计：成功率、平均耗时与最慢模块，用于首页/历史页的趋势展示 */
export const summarizeHistory = (history: BuildHistoryRecord[]): HistorySummary => {
  const total = history.length
  const success = history.filter((record) => record.status === 'SUCCESS').length
  const failed = history.filter((record) => record.status === 'FAILED').length
  const cancelled = history.filter((record) => record.status === 'CANCELLED').length

  const successful = history.filter(
    (record) => record.status === 'SUCCESS' && record.durationMs > 0,
  )
  const averageDurationMs = successful.length > 0
    ? Math.round(successful.reduce((sum, record) => sum + record.durationMs, 0) / successful.length)
    : undefined

  const byModule = new Map<string, number[]>()
  for (const record of successful) {
    const key = record.moduleArtifactId || record.modulePath || '全部项目'
    const list = byModule.get(key) ?? []
    list.push(record.durationMs)
    byModule.set(key, list)
  }
  let slowestModule: HistorySummary['slowestModule']
  for (const [artifactId, durations] of byModule) {
    const average = durations.reduce((sum, value) => sum + value, 0) / durations.length
    if (!slowestModule || average > slowestModule.averageMs) {
      slowestModule = {artifactId, averageMs: Math.round(average), sampleCount: durations.length}
    }
  }

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const recentSevenDays = history.filter((record) => {
    const time = new Date(record.createdAt).getTime()
    return Number.isFinite(time) && time >= sevenDaysAgo
  }).length

  return {
    total,
    success,
    failed,
    cancelled,
    successRate: total > 0 ? Math.round((success / total) * 100) : 0,
    averageDurationMs,
    slowestModule,
    recentSevenDays,
  }
}
