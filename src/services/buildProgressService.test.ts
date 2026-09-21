import {describe, expect, it} from 'vitest'
import {buildSnapshot, createTracker, ingestLines} from './buildProgressService'

const mavenLog = [
  '[INFO] Scanning for projects...',
  '[INFO] -----------------< com.demo:parent >-----------------',
  '[INFO] Building demo-parent 1.0.0',
  '[INFO] --- maven-clean-plugin:3.2.0:clean (default-clean) @ demo-parent ---',
  '[INFO] --- maven-resources-plugin:3.3.1:resources (default-resources) @ demo-parent ---',
  '[INFO] --- maven-compiler-plugin:3.11.0:compile (default-compile) @ demo-parent ---',
  '[INFO] --- maven-jar-plugin:3.3.0:jar (default-jar) @ demo-parent ---',
  '[INFO] Building demo-common 1.0.0',
  '[INFO] --- maven-clean-plugin:3.2.0:clean (default-clean) @ demo-common ---',
  '[INFO] --- maven-compiler-plugin:3.11.0:compile (default-compile) @ demo-common ---',
  '[INFO] --- maven-jar-plugin:3.3.0:jar (default-jar) @ demo-common ---',
]

const start = (overrides: Partial<Parameters<typeof createTracker>[0]> = {}) =>
  createTracker({totalModules: 2, goals: ['clean', 'package'], skipTests: true, ...overrides})

describe('buildProgressService', () => {
  it('初始状态为 0%，准备阶段进行中', () => {
    const snapshot = buildSnapshot(start())
    expect(snapshot.percent).toBe(0)
    expect(snapshot.stages[0].status).toBe('active')
    expect(snapshot.stages[1].status).toBe('pending')
  })

  it('解析 Building 行推进准备阶段并记录当前模块', () => {
    const tracker = start()
    ingestLines(tracker, ['[INFO] Scanning for projects...', '[INFO] Building demo-parent 1.0.0'])
    const snapshot = buildSnapshot(tracker)
    expect(snapshot.stages[0].status).toBe('done')
    expect(snapshot.currentModule).toBe('demo-parent 1.0.0')
    expect(snapshot.percent).toBeGreaterThan(0)
  })

  it('按插件目标识别子步骤，进度单调递增', () => {
    const tracker = start()
    const percents: number[] = []
    for (const line of mavenLog) {
      ingestLines(tracker, [line])
      percents.push(buildSnapshot(tracker).percent)
    }
    for (let i = 1; i < percents.length; i += 1) {
      expect(percents[i]).toBeGreaterThanOrEqual(percents[i - 1])
    }
    expect(percents.at(-1)).toBeGreaterThan(percents[0])
    const snapshot = buildSnapshot(tracker)
    expect(snapshot.currentPhase).toBe('打包')
    expect(snapshot.subSteps.find((step) => step.key === 'clean')?.status).toBe('done')
    expect(snapshot.subSteps.find((step) => step.key === 'package')?.status).toBe('active')
  })

  it('根据 goals 与 skipTests 生成子步骤', () => {
    expect(buildSnapshot(start({skipTests: false})).subSteps.map((step) => step.key)).toEqual([
      'clean',
      'compile',
      'test',
      'package',
    ])
    expect(
      buildSnapshot(start({goals: ['clean', 'install'], skipTests: true})).subSteps.map((step) => step.key),
    ).toEqual(['clean', 'compile', 'package', 'install'])
  })

  it('Reactor Summary 统计已完成模块数', () => {
    const tracker = start()
    ingestLines(tracker, [
      '[INFO] Building demo-parent 1.0.0',
      '[INFO] demo-parent ...................................... SUCCESS [  1.234 s]',
      '[INFO] Building demo-common 1.0.0',
    ])
    const snapshot = buildSnapshot(tracker)
    expect(snapshot.completedModules).toBe(1)
    expect(snapshot.totalModules).toBe(2)
  })

  it('-am 导致实际构建模块变多时自动扩展总数', () => {
    const tracker = start({totalModules: 1})
    ingestLines(tracker, [
      '[INFO] Building a',
      '[INFO] Building b',
      '[INFO] Building c',
      '[INFO] Building d',
    ])
    expect(buildSnapshot(tracker).totalModules).toBe(4)
  })

  it('解析 Reactor Build Order 提前确定模块总数', () => {
    const tracker = start({totalModules: 1})
    ingestLines(tracker, [
      '[INFO] Scanning for projects...',
      '[INFO] Reactor Build Order:',
      '[INFO]',
      '[INFO] scs',
      '[INFO] scs-common',
      '[INFO] scs-gateway',
      '[INFO]',
      '[INFO] ------------------< com.demo:scs >------------------',
      '[INFO] Building scs 1.0-SNAPSHOT',
    ])

    const snapshot = buildSnapshot(tracker)
    expect(snapshot.reactorDetected).toBe(true)
    expect(snapshot.totalModules).toBe(3)
    expect(snapshot.currentModuleNumber).toBe(1)
    expect(snapshot.completedModules).toBe(0)
  })

  it('按 Reactor 顺序推进模块进度', () => {
    const tracker = start({totalModules: 1})
    ingestLines(tracker, [
      '[INFO] Reactor Build Order:',
      '[INFO]',
      '[INFO] scs',
      '[INFO] scs-common',
      '[INFO] scs-gateway',
      '[INFO]',
      '[INFO] Building scs 1.0-SNAPSHOT',
      '[INFO] --- maven-clean-plugin:3.2.0:clean (default-clean) @ scs ---',
      '[INFO] Building scs-common 1.0-SNAPSHOT',
      '[INFO] --- maven-clean-plugin:3.2.0:clean (default-clean) @ scs-common ---',
    ])

    const snapshot = buildSnapshot(tracker)
    expect(snapshot.currentModuleNumber).toBe(2)
    expect(snapshot.completedModules).toBe(1)
    expect(snapshot.totalModules).toBe(3)
    expect(snapshot.currentModule).toBe('scs-common 1.0-SNAPSHOT')
  })

  it('Reactor Summary 汇总行覆盖模块完成数', () => {
    const tracker = start({totalModules: 3})
    ingestLines(tracker, [
      '[INFO] Reactor Build Order:',
      '[INFO]',
      '[INFO] a',
      '[INFO] b',
      '[INFO] c',
      '[INFO]',
      '[INFO] Building a',
      '[INFO] Building b',
      '[INFO] Building c',
      '[INFO] Reactor Summary for scs 1.0-SNAPSHOT:',
      '[INFO]',
      '[INFO] a .............................................. SUCCESS [  0.512 s]',
      '[INFO] b .............................................. SUCCESS [  1.024 s]',
      '[INFO] c .............................................. SUCCESS [  2.048 s]',
      '[INFO] ------------------------------------------------------------------------',
    ])

    const snapshot = buildSnapshot(tracker)
    expect(snapshot.completedModules).toBe(3)
    expect(snapshot.totalModules).toBe(3)
  })

  it('带 ANSI 颜色的日志也能解析出模块进度', () => {
    const esc = String.fromCharCode(27)
    const color = (text: string) => `${esc}[1;34m${text}${esc}[0m`
    const tracker = start({totalModules: 1})

    ingestLines(tracker, [
      color('[INFO] Reactor Build Order:'),
      color('[INFO]'),
      color('[INFO] scs'),
      color('[INFO] scs-common'),
      color('[INFO] scs-gateway'),
      color('[INFO]'),
      color('[INFO] Building scs 1.0-SNAPSHOT'),
      color('[INFO] Building scs-common 1.0-SNAPSHOT'),
    ])

    const snapshot = buildSnapshot(tracker)
    expect(snapshot.reactorDetected).toBe(true)
    expect(snapshot.totalModules).toBe(3)
    expect(snapshot.currentModuleNumber).toBe(2)
    expect(snapshot.completedModules).toBe(1)
  })

  it('解析 Building 行的 [n/N] 序号后缀，得到精确的模块序号与总数', () => {
    const tracker = start({totalModules: 1})
    ingestLines(tracker, ['[INFO] Building scs-common 1.0-SNAPSHOT   [2/5]'])

    const snapshot = buildSnapshot(tracker)
    expect(snapshot.totalModules).toBe(5)
    expect(snapshot.currentModuleNumber).toBe(2)
    expect(snapshot.currentModule).toBe('scs-common 1.0-SNAPSHOT')
  })

  it('日志给出的模块总数会覆盖前端偏小的估计值（-am 场景）', () => {
    // 用户只选了 1 个模块，-am 让 reactor 变成 4 个
    const tracker = start({totalModules: 1})
    expect(buildSnapshot(tracker).totalModules).toBe(1)

    ingestLines(tracker, [
      '[INFO] Reactor Build Order:',
      '[INFO]',
      '[INFO] a',
      '[INFO] b',
      '[INFO] c',
      '[INFO] d',
      '[INFO]',
      '[INFO] Building a',
    ])
    expect(buildSnapshot(tracker).totalModules).toBe(4)
  })

  it('Reactor Summary 汇总行数量可作为模块总数依据', () => {
    const tracker = start({totalModules: 1})
    ingestLines(tracker, [
      '[INFO] Reactor Summary for scs 1.0-SNAPSHOT:',
      '[INFO]',
      '[INFO] scs .............................................. SUCCESS [  0.512 s]',
      '[INFO] scs-common ....................................... SUCCESS [  1.024 s]',
      '[INFO] scs-gateway ...................................... SUCCESS [  2.048 s]',
    ])

    const snapshot = buildSnapshot(tracker)
    expect(snapshot.totalModules).toBe(3)
    expect(snapshot.completedModules).toBe(3)
  })

  it('BUILD SUCCESS 后进入完成阶段', () => {
    const tracker = start()
    ingestLines(tracker, [...mavenLog, '[INFO] BUILD SUCCESS'])
    const snapshot = buildSnapshot(tracker)
    expect(snapshot.status).toBe('success')
    expect(snapshot.percent).toBe(100)
    expect(snapshot.stages.every((stage) => stage.status === 'done')).toBe(true)
  })

  it('BUILD FAILURE 保留进度并给出失败提示', () => {
    const tracker = start()
    ingestLines(tracker, [
      ...mavenLog,
      '[ERROR] Failed to execute goal org.apache.maven.plugins:maven-compiler-plugin',
      '[INFO] BUILD FAILURE',
    ])
    const snapshot = buildSnapshot(tracker)
    expect(snapshot.status).toBe('failed')
    expect(snapshot.percent).toBeGreaterThan(0)
    expect(snapshot.percent).toBeLessThan(100)
    expect(snapshot.message).toContain('maven-compiler-plugin')
    expect(snapshot.stages.find((stage) => stage.key === 'completed')?.status).toBe('pending')
    expect(snapshot.subSteps.some((step) => step.status === 'failed')).toBe(true)
  })

  it('失败后继续收到日志不会改变状态', () => {
    const tracker = start()
    ingestLines(tracker, ['[INFO] BUILD FAILURE'])
    const before = buildSnapshot(tracker).percent
    expect(ingestLines(tracker, ['[INFO] --- maven-jar-plugin:3.3.0:jar (default-jar) @ x ---'])).toBe(false)
    expect(buildSnapshot(tracker).percent).toBe(before)
  })

  it('没有新日志时按时间插值继续推进，不会卡住', () => {
    const t0 = 1_000_000
    const tracker = start()
    ingestLines(tracker, ['[INFO] Building demo-parent 1.0.0'], t0)
    const atStart = buildSnapshot(tracker, t0).percent
    const later = buildSnapshot(tracker, t0 + 30_000).percent
    expect(later).toBeGreaterThan(atStart)
  })

  it('检测到「打包」时即认为清理/编译已完成，即使缺少对应日志行', () => {
    const t0 = 1_000_000
    const tracker = start()
    ingestLines(tracker, ['[INFO] Building demo-parent 1.0.0'], t0)
    const beforePackage = buildSnapshot(tracker, t0).percent

    ingestLines(tracker, ['[INFO] --- maven-jar-plugin:3.3.0:jar (default-jar) @ x ---'], t0)
    const snapshot = buildSnapshot(tracker, t0)
    expect(snapshot.currentPhase).toBe('打包')
    expect(snapshot.percent).toBeGreaterThan(beforePackage)
    expect(snapshot.subSteps.find((step) => step.key === 'compile')?.status).toBe('done')
    expect(snapshot.subSteps.find((step) => step.key === 'package')?.status).toBe('active')
  })

  it('用已完成模块的实测耗时校准后续模块的推进速度', () => {
    const t0 = 1_000_000
    const uncalibrated = start()
    ingestLines(uncalibrated, ['[INFO] Building m1'], t0)
    const uncalibratedFill = buildSnapshot(uncalibrated, t0 + 1_000).percent - buildSnapshot(uncalibrated, t0).percent

    const calibrated = start()
    // m1 的 clean 阶段实测耗时 60s，远超默认的 1.5s
    ingestLines(calibrated, ['[INFO] Building m1'], t0)
    ingestLines(calibrated, ['[INFO] --- maven-compiler-plugin:3.11.0:compile (default-compile) @ m1 ---'], t0 + 60_000)
    ingestLines(calibrated, ['[INFO] Building m2'], t0 + 60_000)
    const calibratedFill =
      buildSnapshot(calibrated, t0 + 61_000).percent - buildSnapshot(calibrated, t0 + 60_000).percent

    expect(calibratedFill).toBeLessThan(uncalibratedFill)
  })

  it('无变化时不返回 changed，便于调用方跳过状态更新', () => {
    const tracker = start()
    expect(ingestLines(tracker, ['[INFO] Downloading from central: https://repo.maven.apache.org'])).toBe(false)
  })
})
