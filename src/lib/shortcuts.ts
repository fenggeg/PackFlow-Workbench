/**
 * 快捷键展示文案。单独成文件，避免组件文件导出非组件内容破坏 fast refresh。
 * 顶栏入口、命令面板、提示文案共用同一份，保证各处一致。
 */
const isMacPlatform = () =>
  typeof navigator !== 'undefined'
  && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent)

export const commandPaletteShortcutLabel = isMacPlatform() ? '⌘ K' : 'Ctrl K'
