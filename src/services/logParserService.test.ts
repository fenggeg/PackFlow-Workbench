import {describe, expect, it} from 'vitest'
import {parseBuildLogs} from './logParserService'
import type {BuildLogEvent} from '../types/domain'

const line = (text: string): BuildLogEvent => ({buildId: 'b1', stream: 'stdout', line: text})
const lines = (...texts: string[]) => texts.map(line)

describe('parseBuildLogs', () => {
  it('空日志返回空结果', () => {
    expect(parseBuildLogs([])).toEqual({keywordLines: []})
  })

  it('提取命中的关键错误行', () => {
    const result = parseBuildLogs(
      lines('[INFO] Scanning for projects...', '[ERROR] COMPILATION ERROR', '[INFO] BUILD FAILURE'),
    )
    expect(result.keywordLines).toEqual(['[ERROR] COMPILATION ERROR', '[INFO] BUILD FAILURE'])
    expect(result.firstCriticalLine).toBe('[ERROR] COMPILATION ERROR')
  })

  it('关键字行最多保留 12 条', () => {
    const many = Array.from({length: 20}, (_, index) => line(`[ERROR] something ${index}`))
    expect(parseBuildLogs(many).keywordLines).toHaveLength(12)
  })

  it('firstCriticalLine 跳过纯 [ERROR] 空行，无其他候选时回退到第一条', () => {
    const onlyBare = parseBuildLogs(lines('[ERROR]', '[ERROR]'))
    expect(onlyBare.firstCriticalLine).toBe('[ERROR]')

    const mixed = parseBuildLogs(lines('[ERROR]', '[ERROR] Failed to execute goal com.example:app'))
    expect(mixed.firstCriticalLine).toBe('[ERROR] Failed to execute goal com.example:app')
  })

  it('moduleName 优先取 Failed to execute goal 中的项目名', () => {
    const result = parseBuildLogs(
      lines(
        '[INFO] Building app-core [1/3]',
        '[ERROR] Failed to execute goal org.apache.maven.plugins:maven-compiler-plugin on project app-web',
      ),
    )
    expect(result.moduleName).toBe('app-web')
  })

  it('没有失败目标时取最后一个 Building 的模块名', () => {
    const result = parseBuildLogs(
      lines('[INFO] Building app-core [1/2]', '[INFO] Building app-web [2/2]', '[ERROR] COMPILATION ERROR'),
    )
    expect(result.moduleName).toBe('app-web')
  })

  it('过滤空行后不产生关键字行', () => {
    const result = parseBuildLogs(lines('', '[INFO] Build Success', ''))
    expect(result.keywordLines).toEqual([])
    expect(result.moduleName).toBeUndefined()
  })
})
