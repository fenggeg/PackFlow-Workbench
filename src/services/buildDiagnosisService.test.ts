import {describe, expect, it} from 'vitest'
import {diagnoseBuildFailure} from './buildDiagnosisService'
import type {BuildLogEvent} from '@/types/domain'

const logsOf = (...lines: string[]): BuildLogEvent[] =>
  lines.map((line) => ({buildId: 'build-1', stream: 'stdout' as const, line}))

describe('构建失败诊断', () => {
  it('识别 JRE 冒充 JDK 的场景', () => {
    const result = diagnoseBuildFailure('t1', logsOf(
      '[ERROR] No compiler is provided in this environment. Perhaps you are running on a JRE rather than a JDK?',
    ))
    expect(result.category).toBe('jre_no_compiler')
  })

  it('识别编译错误', () => {
    const result = diagnoseBuildFailure('t1', logsOf(
      '[ERROR] COMPILATION ERROR : ',
      '[ERROR] /D:/repo/App.java:[12,25] cannot find symbol',
    ))
    expect(result.category).toBe('compilation_error')
  })

  it('识别内存不足', () => {
    const result = diagnoseBuildFailure('t1', logsOf('[ERROR] Java heap space java.lang.OutOfMemoryError'))
    expect(result.category).toBe('out_of_memory')
  })

  it('识别插件解析失败', () => {
    const result = diagnoseBuildFailure('t1', logsOf(
      "[ERROR] Plugin org.springframework.boot:spring-boot-maven-plugin:3.2.0 or one of its dependencies could not be resolved",
    ))
    expect(result.category).toBe('plugin_resolution')
  })

  it('多条规则命中时取权重最高的原因，而不是数组中最靠前的', () => {
    // settings_missing 排在 test_failed 之前，但编译错误权重更高
    const result = diagnoseBuildFailure('t1', logsOf(
      '[ERROR] Failed to execute goal ... settings.xml',
      '[ERROR] cannot find symbol: method foo()',
    ))
    expect(result.category).toBe('compilation_error')
  })

  it('仅凭插件名出现不再误判为测试失败', () => {
    const result = diagnoseBuildFailure('t1', logsOf(
      '[INFO] --- maven-surefire-plugin:3.2.5:test (default-test) @ demo ---',
      '[ERROR] Failed to execute goal on project demo: Could not resolve dependencies',
    ))
    expect(result.category).toBe('dependency_download_failed')
  })

  it('没有任何已知信号时归类为未知并给出兜底建议', () => {
    const result = diagnoseBuildFailure('t1', logsOf('[ERROR] something totally unexpected happened'))
    expect(result.category).toBe('unknown')
    expect(result.suggestedActions.length).toBeGreaterThan(0)
  })

  it('提取关键日志行用于展示', () => {
    const result = diagnoseBuildFailure('t1', logsOf(
      '[INFO] Building demo',
      '[ERROR] COMPILATION ERROR : cannot find symbol',
    ))
    expect(result.keywordLines.join('\n')).toContain('cannot find symbol')
  })
})
