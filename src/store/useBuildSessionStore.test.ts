import {beforeEach, describe, expect, it} from 'vitest'
import {useBuildSessionStore} from './useBuildSessionStore'

describe('useBuildSessionStore', () => {
  beforeEach(() => {
    useBuildSessionStore.getState().reset()
  })

  it('beginStart 是原子抢占：二次调用返回 false', () => {
    const session = useBuildSessionStore.getState()
    expect(session.beginStart()).toBe(true)
    expect(session.beginStart()).toBe(false)
    expect(useBuildSessionStore.getState().phase).toBe('starting')
  })

  it('完整生命周期 idle → starting → running → finalizing → done', () => {
    const session = useBuildSessionStore.getState()
    expect(session.beginStart()).toBe(true)

    session.markLaunched(1000)
    expect(useBuildSessionStore.getState().status).toBe('RUNNING')
    expect(useBuildSessionStore.getState().startedAt).toBe(1000)

    session.markRunning('build-1', 'token-1')
    const running = useBuildSessionStore.getState()
    expect(running.phase).toBe('running')
    expect(running.buildId).toBe('build-1')

    expect(session.beginFinalize()).toBe(true)
    session.finish('SUCCESS', 2000)
    const done = useBuildSessionStore.getState()
    expect(done.phase).toBe('done')
    expect(done.status).toBe('SUCCESS')
    expect(done.durationMs).toBe(2000)
    expect(done.buildId).toBeUndefined()
    expect(done.runToken).toBeUndefined()
  })

  it('abortStart 从 starting 回滚到干净的 idle', () => {
    const session = useBuildSessionStore.getState()
    session.beginStart()
    session.markLaunched(1)
    session.abortStart()
    const idle = useBuildSessionStore.getState()
    expect(idle.phase).toBe('idle')
    expect(idle.status).toBe('IDLE')
    expect(idle.startedAt).toBeUndefined()
  })

  it('failStart 以 FAILED 终结会话，允许再次启动', () => {
    const session = useBuildSessionStore.getState()
    session.beginStart()
    session.markLaunched(1)
    session.failStart()
    const done = useBuildSessionStore.getState()
    expect(done.phase).toBe('done')
    expect(done.status).toBe('FAILED')
    expect(session.beginStart()).toBe(true)
  })

  it('双击场景：第一次 beginStart 后，第二次被静默拒绝', () => {
    const session = useBuildSessionStore.getState()
    session.beginStart()
    // 第二次点击走不到任何迁移，也不会产生第二个构建
    expect(session.beginStart()).toBe(false)
    expect(useBuildSessionStore.getState().buildId).toBeUndefined()
  })

  it('requestCancel 只在 starting|running 受理', () => {
    const session = useBuildSessionStore.getState()
    expect(session.requestCancel()).toBe(false)

    session.beginStart()
    expect(session.requestCancel()).toBe(true)
    expect(useBuildSessionStore.getState().cancelling).toBe(true)

    session.cancelFailed()
    expect(useBuildSessionStore.getState().cancelling).toBe(false)

    session.markLaunched(1)
    session.markRunning('b', 't')
    expect(session.requestCancel()).toBe(true)

    session.beginFinalize()
    session.finish('CANCELLED', 100)
    expect(useBuildSessionStore.getState().cancelling).toBe(false)
  })

  it('isBusy 覆盖 starting/running/finalizing，idle 与 done 空闲', () => {
    const session = useBuildSessionStore.getState()
    expect(session.isBusy()).toBe(false)

    session.beginStart()
    expect(session.isBusy()).toBe(true)

    session.markLaunched(1)
    session.markRunning('b', 't')
    expect(session.isBusy()).toBe(true)

    session.beginFinalize()
    expect(session.isBusy()).toBe(true)

    session.finish('SUCCESS', 1)
    expect(session.isBusy()).toBe(false)
  })

  it('启动竞态：build-finished 先于 IPC 返回时仍可进入 finalizing', () => {
    const session = useBuildSessionStore.getState()
    session.beginStart()
    session.markLaunched(1)
    // IPC 尚未返回（buildId 未写入），结束事件先到
    expect(session.beginFinalize()).toBe(true)
    session.finish('SUCCESS', 10)
  })

  it('finish 只在 finalizing 阶段生效，防止迟到事件改写状态', () => {
    const session = useBuildSessionStore.getState()
    session.beginStart()
    session.finish('SUCCESS', 10)
    expect(useBuildSessionStore.getState().status).toBe('IDLE')
    expect(useBuildSessionStore.getState().phase).toBe('starting')
  })
})
