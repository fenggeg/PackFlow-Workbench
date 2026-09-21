/** ESC / BEL 控制字符用编码构造，避免正则里出现裸控制字符 */
const ESC = String.fromCharCode(27)
const BEL = String.fromCharCode(7)

/** ANSI 颜色转义序列（Maven 彩色输出），会造成换行错位，展示前统一剥离 */
const ANSI_PATTERN = new RegExp(`${ESC}\\[[0-9;]*[A-Za-z]`, 'g')
/** OSC 序列（终端标题等） */
const ANSI_OSC_PATTERN = new RegExp(`${ESC}\\][^${BEL}${ESC}]*(${BEL}|${ESC}\\\\)?`, 'g')

/**
 * 清洗单行日志：
 * 1. Maven 下载进度用 \r 覆盖同一行，只保留最后一次输出
 * 2. 剥离 ANSI/OSC 转义，避免不可见字符影响换行与对齐
 * 3. 去掉行尾空白
 */
export const sanitizeLogLine = (line: string) => {
  const segments = line.split('\r')
  const last = segments[segments.length - 1] ?? ''
  return last.replace(ANSI_OSC_PATTERN, '').replace(ANSI_PATTERN, '').trimEnd()
}
