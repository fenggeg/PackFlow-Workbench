/** 构建状态文案：悬浮按钮与检查器头部共用，保证两处信息一致 */
export const buildStatusLabel = (cancelling: boolean, indeterminate: boolean, percent: number) =>
  cancelling ? '正在停止…' : indeterminate ? '构建中' : `构建中 ${percent}%`
