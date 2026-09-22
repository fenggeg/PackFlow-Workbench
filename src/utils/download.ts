/** 把文本作为文件下载：用于历史/模板/冲突结果等数据导出 */
export const downloadTextFile = (
  fileName: string,
  content: string,
  mime = 'text/plain;charset=utf-8',
) => {
  const blob = new Blob([content], {type: mime})
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 100)
}

/** 单元格含逗号、引号或换行时按 CSV 规则加引号并转义 */
export const toCsvCell = (value: string | number | undefined | null) => {
  const text = value === undefined || value === null ? '' : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export const toCsv = (rows: ReadonlyArray<ReadonlyArray<string | number | undefined | null>>) =>
  rows.map((row) => row.map(toCsvCell).join(',')).join('\n')

/** 追加 UTF-8 BOM，保证 Excel 打开中文 CSV 不乱码 */
export const withBom = (text: string) => `${String.fromCharCode(0xfeff)}${text}`

export const timestampSuffix = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
