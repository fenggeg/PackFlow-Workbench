import {describe, expect, it} from 'vitest'
import {buildSnapshot, createTracker, ingestLines} from './buildProgressService'

/** 真实 Maven 输出片段（用户实测日志），用于回归「模块总数应为 14」 */
const REACTOR_ORDER = [
  '[INFO] Reactor Build Order:',
  '[INFO] ',
  '[INFO] scs                                                                [pom]',
  '[INFO] scs-common                                                         [pom]',
  '[INFO] scs-common-core                                                    [jar]',
  '[INFO] scs-common-feign                                                   [jar]',
  '[INFO] scs-common-swagger                                                 [jar]',
  '[INFO] scs-common-mybatis                                                 [jar]',
  '[INFO] scs-upms                                                           [pom]',
  '[INFO] scs-upms-api                                                       [jar]',
  '[INFO] scs-common-log                                                     [jar]',
  '[INFO] scs-common-security                                                [jar]',
  '[INFO] scs-common-job                                                     [jar]',
  '[INFO] scs-risksource                                                     [pom]',
  '[INFO] scs-risksource-api                                                 [jar]',
  '[INFO] scs-risksource-biz                                                 [jar]',
  '[INFO] ',
]

const SUMMARY = [
  '[INFO] Reactor Summary for scs 1.0-SNAPSHOT:',
  '[INFO] ',
  '[INFO] scs ................................................ SUCCESS [  0.582 s]',
  '[INFO] scs-common ......................................... SUCCESS [  0.006 s]',
  '[INFO] scs-common-core .................................... SUCCESS [  5.584 s]',
  '[INFO] scs-common-feign ................................... SUCCESS [  2.688 s]',
  '[INFO] scs-common-swagger ................................. SUCCESS [  2.594 s]',
  '[INFO] scs-common-mybatis ................................. SUCCESS [  1.980 s]',
  '[INFO] scs-upms ........................................... SUCCESS [  0.006 s]',
  '[INFO] scs-upms-api ....................................... SUCCESS [  3.895 s]',
  '[INFO] scs-common-log ..................................... SUCCESS [  1.853 s]',
  '[INFO] scs-common-security ................................ SUCCESS [  3.129 s]',
  '[INFO] scs-common-job ..................................... SUCCESS [  1.506 s]',
  '[INFO] scs-risksource ..................................... SUCCESS [  0.006 s]',
  '[INFO] scs-risksource-api ................................. SUCCESS [  9.353 s]',
  '[INFO] scs-risksource-biz ................................. SUCCESS [ 11.076 s]',
  '[INFO] ------------------------------------------------------------------------',
  '[INFO] BUILD SUCCESS',
]

const BUILDING = [
  '[INFO] ---------------------------< com.gyyjy:scs >----------------------------',
  '[INFO] Building scs 1.0-SNAPSHOT                                         [1/14]',
  '[INFO]   from pom.xml',
  '[INFO] --- clean:3.2.0:clean (default-clean) @ scs ---',
  '[INFO] Building scs-common 1.0-SNAPSHOT                                  [2/14]',
  '[INFO] Building scs-common-core 1.0-SNAPSHOT                             [3/14]',
  '[INFO] --- resources:3.4.0:resources (default-resources) @ scs-common-core ---',
  '[INFO] --- compiler:3.15.0:compile (default-compile) @ scs-common-core ---',
  '[INFO] --- jar:3.5.0:jar (default-jar) @ scs-common-core ---',
  '[INFO] Building jar: D:\\IdeaProjects\\admRiskSource\\scs-common\\scs-common-core\\target\\scs-common-core.jar',
  '[INFO] Building scs-common-feign 1.0-SNAPSHOT                            [4/14]',
  '[INFO] --- jar:3.5.0:jar (default-jar) @ scs-common-feign ---',
  '[INFO] Building jar: D:\\IdeaProjects\\admRiskSource\\scs-common\\scs-common-feign\\target\\scs-common-feign.jar',
  '[INFO] Building scs-common-swagger 1.0-SNAPSHOT                          [5/14]',
  '[INFO] Building scs-common-mybatis 1.0-SNAPSHOT                          [6/14]',
  '[INFO] Building scs-upms 1.0-SNAPSHOT                                    [7/14]',
  '[INFO] Building scs-upms-api 1.0-SNAPSHOT                                [8/14]',
  '[INFO] Building jar: D:\\IdeaProjects\\admRiskSource\\scs-upms\\scs-upms-api\\target\\scs-upms-api.jar',
  '[INFO] Building scs-common-log 1.0-SNAPSHOT                              [9/14]',
  '[INFO] Building scs-common-security 1.0-SNAPSHOT                        [10/14]',
  '[INFO] Building scs-common-job 1.0-SNAPSHOT                             [11/14]',
  '[INFO] Building scs-risksource 1.0-SNAPSHOT                             [12/14]',
  '[INFO] Building scs-risksource-api 1.0-SNAPSHOT                         [13/14]',
  '[INFO] Building jar: D:\\IdeaProjects\\admRiskSource\\scs-risksource\\scs-risksource-api\\target\\scs-risksource-api.jar',
  '[INFO] Building scs-risksource-biz 1.0-SNAPSHOT                         [14/14]',
  '[INFO] --- spring-boot:2.6.3:repackage (default) @ scs-risksource-biz ---',
  '[INFO] Building jar: D:\\IdeaProjects\\admRiskSource\\scs-risksource\\scs-risksource-biz\\target\\scs-risksource-biz.jar',
]

describe('真实 Reactor 日志（14 个模块）', () => {
  it('Reactor Build Order 解析出 14 个模块（含 [pom]/[jar] 列）', () => {
    const tracker = createTracker({totalModules: 1, goals: ['clean', 'package'], skipTests: true})
    ingestLines(tracker, REACTOR_ORDER)

    const snapshot = buildSnapshot(tracker)
    expect(snapshot.totalModules).toBe(14)
    expect(snapshot.reactorDetected).toBe(true)
  })

  it('按 Reactor 顺序给出精确模块序号（scs-risksource-biz 是第 14 个）', () => {
    const tracker = createTracker({totalModules: 1, goals: ['clean', 'package'], skipTests: true})
    ingestLines(tracker, REACTOR_ORDER)
    ingestLines(tracker, BUILDING)

    const snapshot = buildSnapshot(tracker)
    expect(snapshot.totalModules).toBe(14)
    expect(snapshot.currentModuleNumber).toBe(14)
    expect(snapshot.completedModules).toBe(13)
    expect(snapshot.currentModule).toBe('scs-risksource-biz 1.0-SNAPSHOT')
  })

  it('Reactor Summary 汇总行统计出 14 个已完成模块', () => {
    const tracker = createTracker({totalModules: 1, goals: ['clean', 'package'], skipTests: true})
    ingestLines(tracker, [...REACTOR_ORDER, ...BUILDING, ...SUMMARY])

    const snapshot = buildSnapshot(tracker)
    expect(snapshot.totalModules).toBe(14)
    expect(snapshot.completedModules).toBe(14)
    expect(snapshot.status).toBe('success')
    expect(snapshot.percent).toBe(100)
  })

  it('插件输出「Building jar: ...」不会被当成模块，总数始终不超过 14', () => {
    const tracker = createTracker({totalModules: 1, goals: ['clean', 'package'], skipTests: true})
    let maxTotal = 0
    // 逐行喂入，模拟真实流式到达（修复前这里会一路涨到 24）
    for (const line of [...REACTOR_ORDER, ...BUILDING, ...SUMMARY]) {
      ingestLines(tracker, [line])
      const snapshot = buildSnapshot(tracker)
      maxTotal = Math.max(maxTotal, snapshot.totalModules)
      expect(snapshot.totalModules).toBeLessThanOrEqual(14)
      expect(snapshot.completedModules).toBeLessThanOrEqual(14)
    }

    expect(maxTotal).toBe(14)
    const final = buildSnapshot(tracker)
    expect(final.totalModules).toBe(14)
    expect(final.completedModules).toBe(14)
  })

  it('构建最后一个模块时显示 14/14，而不是被 jar 输出带偏', () => {
    const tracker = createTracker({totalModules: 1, goals: ['clean', 'package'], skipTests: true})
    ingestLines(tracker, [...REACTOR_ORDER, ...BUILDING])

    const snapshot = buildSnapshot(tracker)
    expect(snapshot.currentModuleNumber).toBe(14)
    expect(snapshot.completedModules).toBe(13)
    // 最后一行是 Building jar，不应影响模块序号
    expect(snapshot.currentModule).toBe('scs-risksource-biz 1.0-SNAPSHOT')
  })

  it('兼容短名插件行（compiler:3.15.0:compile / jar:3.5.0:jar）的阶段识别', () => {
    const tracker = createTracker({totalModules: 14, goals: ['clean', 'package'], skipTests: true})
    ingestLines(tracker, REACTOR_ORDER)
    ingestLines(tracker, [
      '[INFO] Building scs-common-core 1.0-SNAPSHOT                             [3/14]',
      '[INFO] --- clean:3.2.0:clean (default-clean) @ scs-common-core ---',
      // 与阶段无关的插件执行行不应干扰进度
      '[INFO] --- git-commit-id:4.9.9:revision (get-the-git-infos) @ scs-common-core ---',
      '[INFO] --- resources:3.4.0:resources (default-resources) @ scs-common-core ---',
      '[INFO] --- compiler:3.15.0:compile (default-compile) @ scs-common-core ---',
    ])

    const compiling = buildSnapshot(tracker)
    expect(compiling.currentPhase).toBe('编译')
    expect(compiling.subSteps.find((step) => step.key === 'clean')?.status).toBe('done')
    expect(compiling.subSteps.find((step) => step.key === 'compile')?.status).toBe('active')

    ingestLines(tracker, ['[INFO] --- jar:3.5.0:jar (default-jar) @ scs-common-core ---'])
    expect(buildSnapshot(tracker).currentPhase).toBe('打包')

    // spring-boot repackage 仍属于打包阶段，不应把进度推到更后面的阶段
    ingestLines(tracker, ['[INFO] --- spring-boot:2.6.3:repackage (default) @ scs-risksource-biz ---'])
    expect(buildSnapshot(tracker).currentPhase).toBe('打包')
  })

  it('未解析到 Reactor 顺序时，[n/N] 后缀也能给出总数', () => {
    const tracker = createTracker({totalModules: 1, goals: ['clean', 'package'], skipTests: true})
    ingestLines(tracker, [
      '[INFO] Building scs-risksource-biz 1.0-SNAPSHOT                    [14/14]',
    ])

    const snapshot = buildSnapshot(tracker)
    expect(snapshot.totalModules).toBe(14)
    expect(snapshot.currentModuleNumber).toBe(14)
  })
})
