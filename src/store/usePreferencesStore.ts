import {create} from 'zustand'
import {persist} from 'zustand/middleware'

export interface PreferencesState {
  /** 日志自动换行（检查器日志工具栏的换行开关读写同一偏好） */
  logWrap: boolean
  /** 日志自动滚动跟随最新输出 */
  logAutoScroll: boolean
  /** 构建结束时发送系统通知 */
  desktopNotification: boolean
  /** 构建结束播放提示音 */
  completionSound: boolean
  /** 启动时与运行期间自动检查更新（设置页/命令面板仍可手动检查） */
  autoCheckUpdate: boolean
  setLogWrap: (value: boolean) => void
  setLogAutoScroll: (value: boolean) => void
  setDesktopNotification: (value: boolean) => void
  setCompletionSound: (value: boolean) => void
  setAutoCheckUpdate: (value: boolean) => void
  resetToDefault: () => void
}

const defaults = {
  logWrap: true,
  logAutoScroll: true,
  desktopNotification: true,
  completionSound: true,
  autoCheckUpdate: true,
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      ...defaults,
      setLogWrap: (logWrap) => set({logWrap}),
      setLogAutoScroll: (logAutoScroll) => set({logAutoScroll}),
      setDesktopNotification: (desktopNotification) => set({desktopNotification}),
      setCompletionSound: (completionSound) => set({completionSound}),
      setAutoCheckUpdate: (autoCheckUpdate) => set({autoCheckUpdate}),
      resetToDefault: () => set({...defaults}),
    }),
    {name: 'app-preferences', version: 1},
  ),
)
