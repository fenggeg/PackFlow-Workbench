import type {BuildDiagnosis, BuildLogEvent} from '../types/domain'

export const diagnosisCategoryText: Record<BuildDiagnosis['category'], string> = {
  jdk_mismatch: 'JDK 版本不匹配',
  maven_missing: 'Maven 不存在',
  wrapper_issue: 'Wrapper 失效',
  settings_missing: 'settings.xml 缺失',
  dependency_download_failed: '依赖下载失败',
  repo_unreachable: '私服不可达',
  profile_invalid: 'profile 不存在',
  module_invalid: '模块路径错误',
  test_failed: '单元测试失败',
  unknown: '未知错误',
}

export const splitArgs = (input: string): string[] =>
  input
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)

export type LogLineTone = '' | 'success' | 'error' | 'warn' | 'warning'

export const classifyLogLine = (line: string): LogLineTone => {
  const lower = line.toLowerCase()
  if (
    lower.includes('[error]')
    || lower.includes('error:')
    || lower.includes('failed')
    || lower.includes('exception')
  ) {
    return 'error'
  }
  if (lower.includes('[warning]') || lower.includes('warn:')) {
    return 'warn'
  }
  if (lower.includes('build success')) {
    return 'success'
  }
  return ''
}

export const classifyBuildLogEvent = (event: BuildLogEvent): LogLineTone => {
  if (event.stream === 'stderr') return 'error'
  return classifyLogLine(event.line)
}
