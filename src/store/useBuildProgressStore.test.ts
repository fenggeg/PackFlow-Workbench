import {beforeEach, describe, expect, it, vi} from 'vitest'
import {useBuildProgressStore} from './useBuildProgressStore'

describe('useBuildProgressStore', () => {
  beforeEach(() => {
    useBuildProgressStore.getState().reset()
  })

  it('完成后保留进度展示，不会自动消失', () => {
    vi.useFakeTimers()
    try {
      useBuildProgressStore.getState().startRun({totalModules: 1, goals: ['package'], skipTests: true})
      useBuildProgressStore.getState().complete()

      expect(useBuildProgressStore.getState().visible).toBe(true)
      vi.advanceTimersByTime(10_000)
      expect(useBuildProgressStore.getState().visible).toBe(true)
      expect(useBuildProgressStore.getState().snapshot.percent).toBe(100)
    } finally {
      vi.useRealTimers()
    }
  })

  it('模块数因 -am 扩展时百分比不回退', () => {
    const store = useBuildProgressStore.getState()
    store.startRun({totalModules: 1, goals: ['package'], skipTests: true})
    store.ingestLines([
      '[INFO] Building a',
      '[INFO] --- maven-jar-plugin:3.3.0:jar (default-jar) @ a ---',
    ])
    const before = useBuildProgressStore.getState().snapshot.percent

    // 上游模块 b 被 -am 带入，总量变大
    store.ingestLines(['[INFO] Building b'])
    expect(useBuildProgressStore.getState().snapshot.totalModules).toBe(2)
    expect(useBuildProgressStore.getState().snapshot.percent).toBeGreaterThanOrEqual(before)
  })

  it('新一轮构建会重置进度', () => {
    const store = useBuildProgressStore.getState()
    store.startRun({totalModules: 1, goals: ['package'], skipTests: true})
    store.ingestLines(['[INFO] Building a'])
    store.complete()
    store.startRun({totalModules: 3, goals: ['clean', 'package'], skipTests: true})

    const snapshot = useBuildProgressStore.getState().snapshot
    expect(snapshot.status).toBe('running')
    expect(snapshot.totalModules).toBe(3)
    expect(snapshot.percent).toBeLessThan(100)
  })
})
