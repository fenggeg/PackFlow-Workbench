import {beforeEach, describe, expect, it} from 'vitest'
import {useAppStore} from './useAppStore'
import {createDefaultBuildOptions} from '@/services/tauri-api'
import type {MavenModule, MavenProject} from '@/types/domain'

const moduleOf = (id: string, artifactId: string, relativePath: string, children?: MavenModule[]): MavenModule => ({
  id,
  artifactId,
  relativePath,
  pomPath: `${relativePath || '.'}/pom.xml`,
  packaging: children ? 'pom' : 'jar',
  children,
})

/** 父聚合模块 + 两个子模块 */
const child1 = moduleOf('child-1', 'scs-common', 'scs-common')
const child2 = moduleOf('child-2', 'scs-gateway', 'scs-gateway')
const parent = moduleOf('parent', 'scs', 'scs-parent', [child1, child2])

const project: MavenProject = {
  rootPath: 'D:/repo/scs',
  rootPomPath: 'D:/repo/scs/pom.xml',
  artifactId: 'scs',
  modules: [parent],
}

describe('useAppStore 模块选择', () => {
  beforeEach(() => {
    useAppStore.setState({
      project,
      environment: undefined,
      buildOptions: createDefaultBuildOptions(project.rootPath, ''),
      selectedModules: [],
      selectedModuleIds: [],
    })
  })

  it('只选一个子模块时不会连带父模块，-pl 只包含该子模块', () => {
    useAppStore.getState().setSelectedModules(['child-1'])

    const state = useAppStore.getState()
    expect(state.selectedModuleIds).toEqual(['child-1'])
    expect(state.selectedModules.map((item) => item.artifactId)).toEqual(['scs-common'])
    expect(state.buildOptions.selectedModulePath).toBe('scs-common')
  })

  it('多选子模块时 -pl 按选择顺序拼接', () => {
    useAppStore.getState().setSelectedModules(['child-1', 'child-2'])
    expect(useAppStore.getState().buildOptions.selectedModulePath).toBe('scs-common,scs-gateway')
  })

  it('选中根聚合模块（relativePath 为空）等价于全部项目，不产生非法 -pl', () => {
    useAppStore.setState({project: {...project, modules: [moduleOf('root', 'scs', '', [child1])]}})
    useAppStore.getState().setSelectedModules(['root'])

    expect(useAppStore.getState().buildOptions.selectedModulePath).toBe('')
  })

  it('清空选择回到全部项目', () => {
    useAppStore.getState().setSelectedModules(['child-1'])
    useAppStore.getState().selectAllProject()

    const state = useAppStore.getState()
    expect(state.selectedModules).toEqual([])
    expect(state.buildOptions.selectedModulePath).toBe('')
  })
})
