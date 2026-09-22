import {beforeEach, describe, expect, it, vi} from 'vitest'
import {useAppStore} from './useAppStore'
import {createDefaultBuildOptions} from '@/services/tauri-api'
import type {BuildEnvironment} from '@/types/domain'

const {previewMock} = vi.hoisted(() => ({previewMock: vi.fn()}))

vi.mock('@/services/tauri-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/tauri-api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      buildCommandPreview: (payload: unknown) => previewMock(payload),
    },
  }
})

const environment = {
  javaSource: 'auto',
  mavenSource: 'auto',
  settingsXmlSource: 'auto',
  localRepoSource: 'auto',
  wrapperSource: 'auto',
  gitSource: 'auto',
  status: 'ok',
  errors: [],
  hasMavenWrapper: false,
  useMavenWrapper: false,
} as BuildEnvironment

const GENERATED = 'mvn.cmd clean package -Dmaven.test.skip=true'
const MANUAL = 'mvn.cmd -pl scs-common -am install -DskipDocker'

describe('useAppStore 命令锁定', () => {
  beforeEach(() => {
    previewMock.mockReset()
    previewMock.mockResolvedValue(GENERATED)
    useAppStore.setState({
      environment,
      buildOptions: createDefaultBuildOptions('D:/repo/scs', ''),
    })
  })

  it('自动生成会写入 editableCommand，且不会锁定命令', async () => {
    await useAppStore.getState().refreshCommandPreview()

    const state = useAppStore.getState()
    expect(state.buildOptions.editableCommand).toBe(GENERATED)
    expect(state.buildOptions.commandLocked).toBeFalsy()
  })

  it('手工保存命令后锁定，后续自动生成的预览不再覆盖用户输入', async () => {
    await useAppStore.getState().refreshCommandPreview()
    useAppStore.getState().setEditableCommand(MANUAL)
    await useAppStore.getState().refreshCommandPreview()

    const state = useAppStore.getState()
    expect(state.buildOptions.commandLocked).toBe(true)
    expect(state.buildOptions.editableCommand).toBe(MANUAL)
  })

  it('恢复自动生成会解除锁定并写回最新生成结果', async () => {
    await useAppStore.getState().refreshCommandPreview()
    useAppStore.getState().setEditableCommand(MANUAL)
    await useAppStore.getState().resetEditableCommand()

    const state = useAppStore.getState()
    expect(state.buildOptions.commandLocked).toBe(false)
    expect(state.buildOptions.editableCommand).toBe(GENERATED)
  })

  it('重跑历史会锁定历史命令，避免被重新生成覆盖', () => {
    useAppStore.getState().rerunHistory({
      id: 'history-1',
      createdAt: new Date().toISOString(),
      projectRoot: 'D:/repo/scs',
      modulePath: 'scs-common',
      command: MANUAL,
      status: 'SUCCESS',
      durationMs: 1200,
      useMavenWrapper: false,
    })

    expect(useAppStore.getState().buildOptions.commandLocked).toBe(true)
    expect(useAppStore.getState().buildOptions.editableCommand).toBe(MANUAL)
  })
})
