import {describe, expect, it} from 'vitest'
import {sanitizeLogLine} from './logText'

describe('sanitizeLogLine', () => {
  it('剥离 ANSI 颜色转义，避免换行错位', () => {
    expect(sanitizeLogLine('\u001B[1m[INFO]\u001B[0m Building demo')).toBe('[INFO] Building demo')
    expect(sanitizeLogLine('\u001B[32mBUILD SUCCESS\u001B[0m')).toBe('BUILD SUCCESS')
  })

  it('剥离 OSC 标题转义', () => {
    expect(sanitizeLogLine('\u001B]0;maven\u0007[INFO] ok')).toBe('[INFO] ok')
  })

  it('回车覆盖的进度行只保留最后一次输出', () => {
    expect(sanitizeLogLine('10%\r50%\r100%')).toBe('100%')
  })

  it('去掉行尾空白', () => {
    expect(sanitizeLogLine('[INFO] done   ')).toBe('[INFO] done')
  })

  it('普通日志保持原样', () => {
    const line = '[INFO] --- maven-jar-plugin:3.3.0:jar (default-jar) @ demo ---'
    expect(sanitizeLogLine(line)).toBe(line)
  })
})
