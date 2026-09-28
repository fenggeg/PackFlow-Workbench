import {create} from 'zustand'
import {
  type DownloadEvent,
  type Update,
  checkForAppUpdate,
  downloadAndInstallAppUpdate,
  getCurrentAppVersion,
  isTauriRuntime,
  relaunchApp,
} from '@/services/tauri-api'
import {getErrorMessage} from '@/utils/errors'
import {notifyError, notifyInfo, notifySuccess} from '@/store/useFeedbackStore'

type DownloadProgress = {
  downloaded: number
  total?: number
  startedAt?: number
  speed?: number
  finished: boolean
}

const getFriendlyUpdateErrorMessage = (error: unknown, phase: 'check' | 'apply') => {
  const rawMessage = getErrorMessage(error).toLowerCase()
  const prefix = phase === 'check' ? '检查更新失败' : '安装更新失败'

  if (rawMessage.includes('timeout') || rawMessage.includes('timed out')) {
    return `${prefix}：连接更新服务超时，请稍后重试。`
  }
  if (
    rawMessage.includes('decode') ||
    rawMessage.includes('decoding') ||
    rawMessage.includes('body') ||
    rawMessage.includes('unexpected eof') ||
    rawMessage.includes('incomplete') ||
    rawMessage.includes('truncated')
  ) {
    return `${prefix}：更新包下载中断或内容不完整，请检查网络后重新下载。`
  }
  return `${prefix}：${getErrorMessage(error)}`
}

/**
 * 应用更新的全局状态：头部图标按钮、设置页的更新模块共用同一份
 * 版本信息与检查/安装动作，发现新版本时由 store 统一打开更新对话框。
 */
export interface UpdateState {
  currentVersion: string
  update: Update | null
  checking: boolean
  installing: boolean
  dialogOpen: boolean
  progress: DownloadProgress
  versionLoaded: boolean
  initialize: () => Promise<void>
  checkUpdate: (silent?: boolean) => Promise<void>
  applyUpdate: () => Promise<void>
  openDialog: () => void
  closeModal: () => void
  handleDownloadEvent: (event: DownloadEvent) => void
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  currentVersion: isTauriRuntime() ? '' : '开发预览',
  update: null,
  checking: false,
  installing: false,
  dialogOpen: false,
  progress: {downloaded: 0, finished: false},
  versionLoaded: false,

  initialize: async () => {
    if (get().versionLoaded) return
    set({versionLoaded: true})
    if (!isTauriRuntime()) return
    try {
      const version = await getCurrentAppVersion()
      set({currentVersion: version ?? ''})
    } catch {
      set({currentVersion: ''})
    }
  },

  checkUpdate: async (silent = false) => {
    if (!isTauriRuntime()) {
      if (!silent) notifyInfo('请在桌面应用中检查更新。')
      return
    }

    set({checking: true})
    try {
      const nextUpdate = await checkForAppUpdate()
      if (!nextUpdate) {
        const current = get().currentVersion
        if (!silent) {
          if (current) {
            notifySuccess(`当前已是最新版本：${current}`)
          } else {
            notifySuccess('当前已是最新版本。')
          }
        }
        return
      }

      // 释放旧更新资源后换新，对话框重新打开；「稍后」关闭后保留 update 用于红点提示
      const previous = get().update
      if (previous) void previous.close().catch(() => {})
      set({
        update: nextUpdate,
        progress: {downloaded: 0, finished: false},
        dialogOpen: true,
      })
    } catch (error) {
      if (!silent) notifyError(getFriendlyUpdateErrorMessage(error, 'check'))
    } finally {
      set({checking: false})
    }
  },

  applyUpdate: async () => {
    const update = get().update
    if (!update || get().installing) return

    set({installing: true})
    try {
      // 官方更新插件一步完成下载、签名校验与安装：
      // Windows 上安装前会退出当前进程，由 NSIS 安装器（passive 模式）接管并自动重启应用，
      // 因此这里的 await 在 Windows 上不会返回，也就不会执行到 relaunchApp。
      await downloadAndInstallAppUpdate(update, (event) => get().handleDownloadEvent(event))
      notifySuccess('更新完成，正在重启应用…')
      await relaunchApp()
    } catch (error) {
      notifyError(getFriendlyUpdateErrorMessage(error, 'apply'))
      set({installing: false, progress: {downloaded: 0, finished: false}})
    }
  },

  openDialog: () => {
    set({dialogOpen: true})
  },

  closeModal: () => {
    if (get().installing) return
    set({dialogOpen: false, progress: {downloaded: 0, finished: false}})
  },

  handleDownloadEvent: (event) => {
    if (event.event === 'Started') {
      set({
        progress: {
          downloaded: 0,
          total: event.data.contentLength,
          startedAt: Date.now(),
          finished: false,
        },
      })
      return
    }

    if (event.event === 'Progress') {
      const current = get().progress
      const startedAt = current.startedAt ?? Date.now()
      const downloaded = current.downloaded + event.data.chunkLength
      const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 1)
      set({
        progress: {
          ...current,
          startedAt,
          downloaded,
          speed: downloaded / elapsedSeconds,
        },
      })
      return
    }

    set({progress: {...get().progress, finished: true}})
  },
}))
