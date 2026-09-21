import type {BuildEnvironment, EnvironmentSource, EnvironmentStatus} from '../types/domain'

export interface EnvironmentCenterItem {
  key: string
  title: string
  value: string
  detail: string
  source: EnvironmentSource
  status: EnvironmentStatus
}

const missing = '未识别'

export function compactVersion(value?: string) {
  return value?.split(/\r?\n/)[0].trim() || missing
}

export function sourceText(source: EnvironmentSource) {
  return {
    auto: '自动识别',
    manual: '手动覆盖',
    wrapper: 'Wrapper',
    missing: '未识别',
  }[source]
}

export function statusToneOf(status: EnvironmentStatus): 'success' | 'warning' | 'error' {
  switch (status) {
    case 'ok':
      return 'success'
    case 'warning':
      return 'warning'
    case 'error':
      return 'error'
  }
}

export function sourceStatus(source: EnvironmentSource, exists: boolean): EnvironmentStatus {
  if (source === 'missing' || !exists) {
    return 'warning'
  }
  return 'ok'
}

export function buildEnvironmentCenterItems(environment?: BuildEnvironment): EnvironmentCenterItem[] {
  return [
    {
      key: 'jdk',
      title: 'JDK',
      value: compactVersion(environment?.javaVersion),
      detail: environment?.javaPath ?? '未找到 java.exe',
      source: environment?.javaSource ?? 'missing',
      status: sourceStatus(environment?.javaSource ?? 'missing', Boolean(environment?.javaVersion)),
    },
    {
      key: 'maven',
      title: 'Maven',
      value: compactVersion(environment?.mavenVersion),
      detail: environment?.mavenPath ?? environment?.mavenHome ?? '未找到 Maven',
      source: environment?.mavenSource ?? 'missing',
      status: sourceStatus(environment?.mavenSource ?? 'missing', Boolean(environment?.mavenVersion)),
    },
    {
      key: 'settings',
      title: 'settings.xml',
      value: environment?.settingsXmlPath ? '已找到' : '未找到',
      detail: environment?.settingsXmlPath ?? '使用 Maven 默认配置',
      source: environment?.settingsXmlSource ?? 'missing',
      status: sourceStatus(environment?.settingsXmlSource ?? 'missing', Boolean(environment?.settingsXmlPath)),
    },
    {
      key: 'localRepo',
      title: '本地仓库',
      value: environment?.localRepoPath ? '已定位' : '未识别',
      detail: environment?.localRepoPath ?? '默认 ~/.m2/repository',
      source: environment?.localRepoSource ?? 'missing',
      status: environment?.localRepoPath ? 'ok' : 'warning',
    },
    {
      key: 'wrapper',
      title: 'Maven Wrapper',
      value: environment?.hasMavenWrapper ? '可用' : '未发现',
      detail: environment?.mavenWrapperPath ?? '项目根目录未发现 mvnw.cmd',
      source: environment?.wrapperSource ?? 'missing',
      status: environment?.hasMavenWrapper ? 'ok' : 'warning',
    },
    {
      key: 'git',
      title: 'Git',
      value: compactVersion(environment?.gitVersion),
      detail: environment?.gitPath ?? '未找到 git.exe',
      source: environment?.gitSource ?? 'missing',
      status: sourceStatus(environment?.gitSource ?? 'missing', Boolean(environment?.gitPath)),
    },
  ]
}
