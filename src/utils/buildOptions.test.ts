import {describe, expect, it} from 'vitest'
import {
  composeCustomArgs,
  normalizeBuildOptions,
  sortGoals,
  splitCustomArgs,
  toggleGoal,
} from './buildOptions'
import type {BuildOptions} from '@/types/domain'

const baseOptions: BuildOptions = {
  projectRoot: 'D:/repo',
  selectedModulePath: '',
  goals: [],
  profiles: [],
  properties: {},
  alsoMake: true,
  skipTests: true,
  customArgs: [],
  editableCommand: '',
}

describe('sortGoals', () => {
  it('按 Maven 生命周期排序，避免 package clean 这类错误顺序', () => {
    expect(sortGoals(['package', 'clean'])).toEqual(['clean', 'package'])
  })

  it('保留未知 goal 并排在末尾', () => {
    expect(sortGoals(['foo', 'clean', 'install'])).toEqual(['clean', 'install', 'foo'])
  })

  it('去重', () => {
    expect(sortGoals(['clean', 'clean', 'package'])).toEqual(['clean', 'package'])
  })
})

describe('toggleGoal', () => {
  it('勾选后仍保持生命周期顺序', () => {
    expect(toggleGoal(['package'], 'clean', true)).toEqual(['clean', 'package'])
  })

  it('取消勾选移除目标', () => {
    expect(toggleGoal(['clean', 'package'], 'clean', false)).toEqual(['package'])
  })
})

describe('splitCustomArgs / composeCustomArgs', () => {
  it('把扁平数组拆成预设开关、线程数与手写参数', () => {
    expect(splitCustomArgs(['-U', '-T4', '-DskipDocker', '-q'])).toEqual({
      commonArgs: ['-U', '-q'],
      extraArgs: ['-DskipDocker'],
      threadCount: 4,
    })
  })

  it('合成顺序稳定且线程数放在预设开关之后', () => {
    expect(composeCustomArgs({commonArgs: ['-U'], extraArgs: ['-Denv=dev'], threadCount: 2})).toEqual([
      '-U',
      '-T2',
      '-Denv=dev',
    ])
  })

  it('拆分与合成可往返', () => {
    const source = ['-U', '-T8', '-DskipDocker', '-o']
    expect(composeCustomArgs(splitCustomArgs(source))).toEqual(['-U', '-o', '-T8', '-DskipDocker'])
  })
})

describe('normalizeBuildOptions', () => {
  it('从旧数据（仅 customArgs）补全结构化字段', () => {
    const normalized = normalizeBuildOptions({...baseOptions, customArgs: ['-U', '-T2', '-Dx=1']})
    expect(normalized.commonArgs).toEqual(['-U'])
    expect(normalized.threadCount).toBe(2)
    expect(normalized.extraArgs).toEqual(['-Dx=1'])
    expect(normalized.customArgs).toEqual(['-U', '-T2', '-Dx=1'])
  })

  it('结构化字段优先，customArgs 始终由它们派生', () => {
    const normalized = normalizeBuildOptions({
      ...baseOptions,
      customArgs: ['-U'],
      commonArgs: ['-o'],
      extraArgs: ['-Dy=2'],
      threadCount: 4,
    })
    expect(normalized.customArgs).toEqual(['-o', '-T4', '-Dy=2'])
  })

  it('同时归一化 goals 顺序', () => {
    const normalized = normalizeBuildOptions({...baseOptions, goals: ['install', 'clean']})
    expect(normalized.goals).toEqual(['clean', 'install'])
  })
})
