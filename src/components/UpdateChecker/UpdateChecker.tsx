import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import ReactMarkdown from 'react-markdown'
import {Button} from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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

// 周期性静默检查更新的间隔
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

const formatBytes = (bytes: number) => {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

const formatUpdateNotes = (update: Update) => {
  const notes = (typeof update.body === 'string' ? update.body : '').trim()
  return notes || '本次更新未提供更新日志。'
}

const formatReleaseDate = (date: string) => {
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleString()
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
  if (
    rawMessage.includes('network') ||
    rawMessage.includes('fetch') ||
    rawMessage.includes('dns') ||
    rawMessage.includes('resolve') ||
    rawMessage.includes('connection') ||
    rawMessage.includes('request') ||
    rawMessage.includes('response')
  ) {
    return `${prefix}：暂时无法连接更新服务，请检查网络后重试。`
  }
  if (
    rawMessage.includes('signature') ||
    rawMessage.includes('pubkey') ||
    rawMessage.includes('verify') ||
    rawMessage.includes('verification')
  ) {
    return `${prefix}：更新包校验未通过，请等待重新发布后再试。`
  }
  if (rawMessage.includes('404') || rawMessage.includes('not found') || rawMessage.includes('asset')) {
    return `${prefix}：未找到适合当前安装方式的更新包，请稍后重试。`
  }
  if (rawMessage.includes('json') || rawMessage.includes('parse') || rawMessage.includes('format')) {
    return `${prefix}：更新信息格式异常，请等待重新发布后再试。`
  }
  if (
    rawMessage.includes('permission') ||
    rawMessage.includes('access denied') ||
    rawMessage.includes('denied')
  ) {
    return `${prefix}：当前权限不足，请以管理员身份运行后重试。`
  }
  // 后端已给出面向用户的中文说明时直接透传，避免被泛化提示掩盖真实原因。
  if (/[\u4e00-\u9fff]/.test(rawMessage)) {
    return `${prefix}：${getErrorMessage(error)}`
  }
  return `${prefix}：更新服务暂时不可用，请稍后重试。`
}

export function UpdateChecker() {
  const [checking, setChecking] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [currentVersion, setCurrentVersion] = useState(() => (isTauriRuntime() ? '' : '开发预览'))
  const [update, setUpdate] = useState<Update | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [progress, setProgress] = useState<DownloadProgress>({downloaded: 0, finished: false})
  const silentCheckedRef = useRef(false)

  // 统一走全局通知，避免长错误文案被顶栏空间截断
  const flash = useCallback((type: 'info' | 'success' | 'error', text: string) => {
    if (type === 'error') {
      notifyError(text)
      return
    }
    if (type === 'success') {
      notifySuccess(text)
      return
    }
    notifyInfo(text)
  }, [])

  const progressPercent = useMemo(() => {
    if (!progress.total) return 0
    return Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
  }, [progress.downloaded, progress.total])

  const downloadSpeedText = useMemo(() => {
    if (!progress.speed || progress.finished) return ''
    return `${formatBytes(progress.speed)}/s`
  }, [progress.finished, progress.speed])

  const resetProgress = () => {
    setProgress({downloaded: 0, finished: false})
  }

  const checkUpdate = useCallback(
    async (silent = false) => {
      if (!isTauriRuntime()) {
        if (!silent) flash('info', '请在桌面应用中检查更新。')
        return
      }

      setChecking(true)
      try {
        const nextUpdate = await checkForAppUpdate()
        if (!nextUpdate) {
          if (!silent) {
            flash('success', currentVersion ? `当前已是最新版本：${currentVersion}` : '当前已是最新版本。')
          }
          return
        }

        resetProgress()
        // 释放旧更新资源后换新，对话框重新打开；「稍后」关闭后保留 update 用于红点提示
        if (update) void update.close().catch(() => {})
        setUpdate(nextUpdate)
        setDialogOpen(true)
      } catch (error) {
        if (!silent) flash('error', getFriendlyUpdateErrorMessage(error, 'check'))
      } finally {
        setChecking(false)
      }
    },
    [currentVersion, flash, update],
  )

  useEffect(() => {
    if (!isTauriRuntime()) return

    let disposed = false
    void getCurrentAppVersion()
      .then((version) => {
        if (!disposed) setCurrentVersion(version)
      })
      .catch(() => {
        if (!disposed) setCurrentVersion('')
      })

    return () => {
      disposed = true
    }
  }, [])

  useEffect(() => {
    // 启动后的静默检查只跑一次：checkUpdate 依赖 currentVersion，否则会被重复触发
    if (silentCheckedRef.current) return
    silentCheckedRef.current = true
    const timer = window.setTimeout(() => {
      void checkUpdate(true)
    }, 3500)
    return () => window.clearTimeout(timer)
  }, [checkUpdate])

  useEffect(() => {
    // 周期性静默检查：更新弹窗已打开或正在下载安装时跳过，避免打断进行中的更新
    if (!isTauriRuntime()) return
    if (dialogOpen || installing) return
    const interval = window.setInterval(() => {
      void checkUpdate(true)
    }, UPDATE_CHECK_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [checkUpdate, dialogOpen, installing])

  const handleDownloadEvent = (event: DownloadEvent) => {
    if (event.event === 'Started') {
      setProgress({
        downloaded: 0,
        total: event.data.contentLength,
        startedAt: Date.now(),
        finished: false,
      })
      return
    }

    if (event.event === 'Progress') {
      setProgress((current) => {
        const startedAt = current.startedAt ?? Date.now()
        const downloaded = current.downloaded + event.data.chunkLength
        const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 1)
        return {
          ...current,
          startedAt,
          downloaded,
          speed: downloaded / elapsedSeconds,
        }
      })
      return
    }

    setProgress((current) => ({...current, finished: true}))
  }

  const applyUpdate = async () => {
    if (!update || installing) return

    setInstalling(true)
    try {
      // 官方更新插件一步完成下载、签名校验与安装：
      // Windows 上安装前会退出当前进程，由 NSIS 安装器（passive 模式）接管并自动重启应用，
      // 因此这里的 await 在 Windows 上不会返回，也就不会执行到 relaunchApp。
      await downloadAndInstallAppUpdate(update, handleDownloadEvent)
      flash('success', '更新完成，正在重启应用…')
      await relaunchApp()
    } catch (error) {
      flash('error', getFriendlyUpdateErrorMessage(error, 'apply'))
      setInstalling(false)
      resetProgress()
    }
  }

  const closeModal = () => {
    if (installing) return
    // 保留 update 状态用于「检查更新」按钮的小红点提示，仅关闭对话框
    setDialogOpen(false)
    resetProgress()
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      {currentVersion ? (
        <span className="hidden whitespace-nowrap text-[12px] text-[var(--muted-foreground)] lg:inline">
          当前版本 {currentVersion}
        </span>
      ) : null}
      <Button
        variant="secondary"
        size="sm"
        disabled={checking}
        className="relative"
        onClick={() => void checkUpdate(false)}
      >
        {checking ? '检查中…' : '检查更新'}
        {update && !dialogOpen ? (
          <span
            className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-[var(--background)] bg-[var(--error)]"
            title="有可用的新版本"
          />
        ) : null}
      </Button>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>发现新版本</DialogTitle>
          </DialogHeader>
          {update ? (
            <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto px-5 py-2">
              <span className="text-[13px]">
                当前版本 {update.currentVersion || currentVersion}，最新版本 {update.version}
              </span>
              {update.date ? (
                <span className="text-[12px] text-[var(--muted-foreground)]">
                  发布时间：{formatReleaseDate(update.date)}
                </span>
              ) : null}
              <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] p-3 text-[13px] leading-relaxed [&_a]:text-[var(--info)] [&_h1]:mb-2 [&_h1]:text-[15px] [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:text-[14px] [&_h2]:font-semibold [&_h3]:mb-1.5 [&_h3]:text-[13px] [&_h3]:font-semibold [&_p]:my-1.5 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_code]:rounded-[4px] [&_code]:bg-[var(--muted)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-[family-name:var(--font-mono)] [&_code]:text-[12px] [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-[var(--radius)] [&_pre]:bg-[var(--muted)] [&_pre]:p-2.5 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_blockquote]:my-1.5 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--border-strong)] [&_blockquote]:pl-3 [&_blockquote]:text-[var(--muted-foreground)] [&_hr]:my-3 [&_hr]:border-[var(--border)] [&_strong]:font-semibold">
                <ReactMarkdown
                  components={{
                    a: ({children, href}) => (
                      <a href={href} target="_blank" rel="noreferrer">
                        {children}
                      </a>
                    ),
                  }}
                >
                  {formatUpdateNotes(update)}
                </ReactMarkdown>
              </div>
              {(installing || progress.downloaded > 0) && (
                <div className="flex flex-col gap-1.5">
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--muted)]">
                    <div
                      className="h-full rounded-full bg-[var(--primary)] transition-all duration-150"
                      style={{width: `${progress.finished ? 100 : progressPercent}%`}}
                    />
                  </div>
                  <span className="text-[12px] text-[var(--muted-foreground)]">
                    {progress.finished
                      ? '下载完成，正在安装，应用即将自动重启'
                      : progress.total
                        ? `${formatBytes(progress.downloaded)} / ${formatBytes(progress.total)}${downloadSpeedText ? ` · ${downloadSpeedText}` : ''}`
                        : `${formatBytes(progress.downloaded)} 已下载${downloadSpeedText ? ` · ${downloadSpeedText}` : ''}`}
                  </span>
                </div>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="secondary" disabled={installing} onClick={closeModal}>
              稍后
            </Button>
            <Button variant="primary" disabled={installing} onClick={() => void applyUpdate()}>
              {installing ? (progress.finished ? '安装中' : '下载中') : '立即更新'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
