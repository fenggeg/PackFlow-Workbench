import {beforeEach, describe, expect, it, vi} from 'vitest'
import {useAppStore} from './useAppStore'
import {useBuildSessionStore} from './useBuildSessionStore'
import {useBuildQueueStore, type QueueItem} from './useBuildQueueStore'
import type {BuildOptions, MavenProject} from '../types/domain'

const projectOf = (rootPath: string): MavenProject =>
  ({rootPath} as unknown as MavenProject)

const optionsOf = (rootPath: string): BuildOptions =>
  ({projectRoot: rootPath} as unknown as BuildOptions)

const makeItem = (rootPath: string, overrides: Partial<QueueItem> = {}): QueueItem => ({
  id: `${rootPath}-${Math.random().toString(36).slice(2)}`,
  label: rootPath,
  projectRoot: rootPath,
  moduleIds: [],
  options: optionsOf(rootPath),
  status: 'waiting',
  createdAt: Date.now(),
  ...overrides,
})

const injectItems = (items: QueueItem[]) => {
  useBuildQueueStore.setState({items, running: false})
}

const waitFor = async (predicate: () => boolean) => {
  for (let attempt = 0; attempt < 100 && !predicate(); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

const resetStores = () => {
  // 先清队列再重置会话：status 离开 RUNNING 会触发自动调度订阅
  useBuildQueueStore.setState({items: [], running: false})
  useBuildSessionStore.getState().reset()
}

/** 模拟真实 startBuild 的状态机轨迹：成功进入 running */
const makeStartBuildRunning = () =>
  vi.fn(async () => {
    const session = useBuildSessionStore.getState()
    session.beginStart()
    session.markLaunched(Date.now())
    session.markRunning(`build-${Math.random().toString(36).slice(2)}`, 'token')
  })

describe('useBuildQueueStore', () => {
  beforeEach(() => {
    resetStores()
    useAppStore.setState({
      project: projectOf('D:\\proj\\a'),
      parseProjectPath: vi.fn(async () => {}),
      setSelectedModules: vi.fn(),
      startBuild: makeStartBuildRunning() as unknown as () => Promise<void>,
    })
  })

  it('runNext 从队列取出第一个等待项并复用 startBuild', async () => {
    injectItems([makeItem('D:\\proj\\a'), makeItem('D:\\proj\\a')])
    const startBuild = useAppStore.getState().startBuild as ReturnType<typeof vi.fn>

    await useBuildQueueStore.getState().runNext()

    expect(startBuild).toHaveBeenCalledTimes(1)
    const statuses = useBuildQueueStore.getState().items.map((item) => item.status)
    expect(statuses).toEqual(['running', 'waiting'])
  })

  it('runNext 重入时不会启动第二个任务', async () => {
    injectItems([makeItem('D:\\proj\\a'), makeItem('D:\\proj\\a')])
    const startBuild = useAppStore.getState().startBuild as ReturnType<typeof vi.fn>

    // runNext 的重入守卫必须在第一个 await 前同步生效
    void useBuildQueueStore.getState().runNext()
    void useBuildQueueStore.getState().runNext()
    await waitFor(() => !useBuildQueueStore.getState().running)

    expect(startBuild).toHaveBeenCalledTimes(1)
    expect(
      useBuildQueueStore.getState().items.filter((item) => item.status === 'running'),
    ).toHaveLength(1)
  })

  it('会话忙（running）时 runNext 直接返回', async () => {
    // 用状态机轨迹把会话推到 running，模拟「上一构建仍在进行」
    const session = useBuildSessionStore.getState()
    session.beginStart()
    session.markLaunched(Date.now())
    session.markRunning('build-0', 'token-0')
    injectItems([makeItem('D:\\proj\\a')])
    const startBuild = useAppStore.getState().startBuild as ReturnType<typeof vi.fn>

    await useBuildQueueStore.getState().runNext()

    expect(startBuild).not.toHaveBeenCalled()
    expect(useBuildQueueStore.getState().items.every((item) => item.status === 'waiting')).toBe(true)
  })

  it('队列项目与当前项目不同时先解析项目路径', async () => {
    injectItems([makeItem('D:\\proj\\b')])
    const parseProjectPath = useAppStore.getState().parseProjectPath as ReturnType<typeof vi.fn>

    await useBuildQueueStore.getState().runNext()

    expect(parseProjectPath).toHaveBeenCalledWith('D:\\proj\\b')
  })

  it('启动失败（未进入 running）标记 failed 并自动调度下一项', async () => {
    injectItems([makeItem('D:\\proj\\a'), makeItem('D:\\proj\\a')])
    // 第一次启动失败（如预检未通过），第二次成功进入 running
    let calls = 0
    const startBuild = vi.fn(async () => {
      calls += 1
      const session = useBuildSessionStore.getState()
      session.beginStart()
      session.markLaunched(Date.now())
      if (calls === 1) {
        session.failStart()
      } else {
        session.markRunning('build-2', 'token-2')
      }
    })
    useAppStore.setState({startBuild: startBuild as unknown as () => Promise<void>})

    await useBuildQueueStore.getState().runNext()
    await waitFor(() => {
      const statuses = useBuildQueueStore.getState().items.map((item) => item.status)
      return statuses.every((status) => status !== 'waiting')
    })

    expect(calls).toBe(2)
    const statuses = useBuildQueueStore.getState().items.map((item) => item.status)
    expect(statuses).toEqual(['failed', 'running'])
  })

  it('markRunningFinished 把 running 项映射为最终状态', () => {
    injectItems([makeItem('D:\\proj\\a', {status: 'running'})])
    const store = useBuildQueueStore.getState()

    store.markRunningFinished('SUCCESS', 1200)
    expect(useBuildQueueStore.getState().items[0].status).toBe('success')
    expect(useBuildQueueStore.getState().items[0].durationMs).toBe(1200)

    useBuildQueueStore.setState({items: [makeItem('D:\\proj\\a', {status: 'running'})]})
    useBuildQueueStore.getState().markRunningFinished('CANCELLED', 100)
    expect(useBuildQueueStore.getState().items[0].status).toBe('cancelled')

    useBuildQueueStore.setState({items: [makeItem('D:\\proj\\a', {status: 'running'})]})
    useBuildQueueStore.getState().markRunningFinished('FAILED', 200)
    expect(useBuildQueueStore.getState().items[0].status).toBe('failed')
  })

  it('构建会话终结时自动标记完成并调度下一项', async () => {
    injectItems([makeItem('D:\\proj\\a'), makeItem('D:\\proj\\a')])
    const startBuild = useAppStore.getState().startBuild as ReturnType<typeof vi.fn>

    await useBuildQueueStore.getState().runNext()
    expect(startBuild).toHaveBeenCalledTimes(1)

    // 模拟后端 build-finished：finishBuild 会把会话从 running 收尾到 done
    const session = useBuildSessionStore.getState()
    expect(session.beginFinalize()).toBe(true)
    session.finish('SUCCESS', 2000)
    await waitFor(() => {
      const statuses = useBuildQueueStore.getState().items.map((item) => item.status)
      return statuses.filter((status) => status === 'success').length === 1
    })

    expect(startBuild).toHaveBeenCalledTimes(2)
    const statuses = useBuildQueueStore.getState().items.map((item) => item.status)
    expect(statuses).toEqual(['success', 'running'])
  })

  it('clearFinished 保留等待与运行中的项', () => {
    injectItems([
      makeItem('D:\\proj\\a', {status: 'success'}),
      makeItem('D:\\proj\\a', {status: 'running'}),
      makeItem('D:\\proj\\a', {status: 'waiting'}),
    ])

    useBuildQueueStore.getState().clearFinished()

    const statuses = useBuildQueueStore.getState().items.map((item) => item.status)
    expect(statuses).toEqual(['running', 'waiting'])
  })

  it('enqueueProjects 入队后自动调度第一项', async () => {
    useBuildQueueStore.getState().enqueueProjects(['D:\\dev\\my-app', 'D:\\dev\\other'])
    const startBuild = useAppStore.getState().startBuild as ReturnType<typeof vi.fn>

    await waitFor(() => !useBuildQueueStore.getState().running)

    const items = useBuildQueueStore.getState().items
    expect(items).toHaveLength(2)
    expect(items[0].label).toBe('my-app')
    expect(items[0].projectRoot).toBe('D:\\dev\\my-app')
    expect(items[0].options.projectRoot).toBe('D:\\dev\\my-app')
    expect(items[0].status).toBe('running')
    expect(items[1].status).toBe('waiting')
    expect(startBuild).toHaveBeenCalledTimes(1)
  })
})
