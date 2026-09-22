import {describe, expect, it} from 'vitest'
import {
  buildDurationBaseline,
  diffArtifacts,
  formatBytes,
  formatDuration,
  summarizeHistory,
} from './buildStats'
import type {BuildArtifact, BuildHistoryRecord} from '@/types/domain'

const artifactOf = (path: string, sizeBytes: number): BuildArtifact => ({
  path,
  fileName: path.split('/').pop() ?? path,
  extension: 'jar',
  sizeBytes,
  modulePath: 'scs-common',
})

const recordOf = (
  overrides: Partial<BuildHistoryRecord> & {id: string},
): BuildHistoryRecord => ({
  createdAt: new Date().toISOString(),
  projectRoot: 'D:/repo/scs',
  modulePath: 'scs-common',
  command: 'mvn.cmd package',
  status: 'SUCCESS',
  durationMs: 60_000,
  useMavenWrapper: false,
  ...overrides,
})

describe('formatDuration', () => {
  it('秒级与分钟级分别格式化', () => {
    expect(formatDuration(45_000)).toBe('45 秒')
    expect(formatDuration(125_000)).toBe('2 分 5 秒')
    expect(formatDuration(3 * 3600_000 + 600_000)).toBe('3 小时 10 分')
  })
})

describe('formatBytes', () => {
  it('按量级选择单位', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.00 MB')
    expect(formatBytes(undefined)).toBe('-')
  })
})

describe('构建耗时基线', () => {
  it('只统计同项目同模块范围的成功记录', () => {
    const baseline = buildDurationBaseline(
      [
        recordOf({id: 'a', durationMs: 60_000}),
        recordOf({id: 'b', durationMs: 120_000}),
        recordOf({id: 'c', status: 'FAILED', durationMs: 5_000}),
        recordOf({id: 'd', modulePath: 'scs-gateway', durationMs: 900_000}),
      ],
      'D:/repo/scs',
      'scs-common',
    )

    expect(baseline?.sampleCount).toBe(2)
    expect(baseline?.averageMs).toBe(90_000)
  })

  it('没有可比样本时返回 undefined', () => {
    expect(buildDurationBaseline([], 'D:/repo/scs', 'scs-common')).toBeUndefined()
    expect(
      buildDurationBaseline([recordOf({id: 'a', status: 'FAILED'})], 'D:/repo/scs', 'scs-common'),
    ).toBeUndefined()
  })
})

describe('产物差异', () => {
  it('区分新增、体积变化与消失', () => {
    const previous = [artifactOf('D:/t/a.jar', 100), artifactOf('D:/t/b.jar', 200)]
    const current = [artifactOf('D:/t/a.jar', 150), artifactOf('D:/t/c.jar', 300)]

    const diff = diffArtifacts(current, previous)

    expect(diff.added.map((item) => item.fileName)).toEqual(['c.jar'])
    expect(diff.changed.map((item) => item.fileName)).toEqual(['a.jar'])
    expect(diff.removed.map((item) => item.fileName)).toEqual(['b.jar'])
    expect(diff.unchangedCount).toBe(0)
  })

  it('完全一致时只计入未变化数量', () => {
    const artifacts = [artifactOf('D:/t/a.jar', 100)]
    const diff = diffArtifacts(artifacts, artifacts)

    expect(diff.added).toHaveLength(0)
    expect(diff.changed).toHaveLength(0)
    expect(diff.removed).toHaveLength(0)
    expect(diff.unchangedCount).toBe(1)
  })
})

describe('历史统计', () => {
  it('计算成功率、平均耗时与最慢模块', () => {
    const now = Date.now()
    const summary = summarizeHistory([
      recordOf({id: 'a', durationMs: 60_000, createdAt: new Date(now).toISOString()}),
      recordOf({
        id: 'b',
        durationMs: 90_000,
        moduleArtifactId: 'scs-gateway',
        createdAt: new Date(now - 1000).toISOString(),
      }),
      recordOf({id: 'c', status: 'FAILED', durationMs: 10_000}),
      recordOf({id: 'd', status: 'CANCELLED', durationMs: 0}),
    ])

    expect(summary.total).toBe(4)
    expect(summary.success).toBe(2)
    expect(summary.successRate).toBe(50)
    expect(summary.averageDurationMs).toBe(75_000)
    expect(summary.slowestModule?.artifactId).toBe('scs-gateway')
    expect(summary.recentSevenDays).toBe(4)
  })

  it('空历史不产生除零结果', () => {
    const summary = summarizeHistory([])
    expect(summary.successRate).toBe(0)
    expect(summary.averageDurationMs).toBeUndefined()
    expect(summary.slowestModule).toBeUndefined()
  })
})
