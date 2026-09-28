import {useEffect, useMemo, useRef} from 'react'
import ReactMarkdown from 'react-markdown'
import {RefreshCw} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip'
import {type Update, isTauriRuntime} from '@/services/tauri-api'
import {useUpdateStore} from '@/store/useUpdateStore'
import {usePreferencesStore} from '@/store/usePreferencesStore'

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

/**
 * 顶部更新入口（图标按钮）+ 更新对话框。
 * 检查/安装逻辑都在 useUpdateStore：设置页的更新模块与这里共享状态，
 * 任一处触发检查，发现新版本都会弹出同一个对话框。
 */
export function UpdateChecker() {
  const autoCheckUpdate = usePreferencesStore((state) => state.autoCheckUpdate)
  const currentVersion = useUpdateStore((state) => state.currentVersion)
  const update = useUpdateStore((state) => state.update)
  const checking = useUpdateStore((state) => state.checking)
  const installing = useUpdateStore((state) => state.installing)
  const dialogOpen = useUpdateStore((state) => state.dialogOpen)
  const progress = useUpdateStore((state) => state.progress)
  const initialize = useUpdateStore((state) => state.initialize)
  const checkUpdate = useUpdateStore((state) => state.checkUpdate)
  const applyUpdate = useUpdateStore((state) => state.applyUpdate)
  const closeModal = useUpdateStore((state) => state.closeModal)
  const silentCheckedRef = useRef(false)

  // 当前版本号只取一次；浏览器预览下 store 已给出「开发预览」占位
  useEffect(() => {
    void initialize()
  }, [initialize])

  // 通过 ref 持有最新 checkUpdate，供启动检查在空依赖 effect 中调用，
  // 避免 checkUpdate 因 currentVersion 变化而重建时，cleanup 清掉启动定时器导致检查被跳过
  const checkUpdateRef = useRef(checkUpdate)
  useEffect(() => {
    checkUpdateRef.current = checkUpdate
  }, [checkUpdate])

  useEffect(() => {
    // 启动后的静默检查只跑一次：空依赖数组保证定时器不被依赖变化清理
    if (silentCheckedRef.current) return
    silentCheckedRef.current = true
    // 设置页可关闭自动检查；手动「检查更新」不受影响
    if (!usePreferencesStore.getState().autoCheckUpdate) return
    const timer = window.setTimeout(() => {
      void checkUpdateRef.current(true)
    }, 3500)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    // 周期性静默检查：更新弹窗已打开或正在下载安装时跳过，避免打断进行中的更新
    if (!isTauriRuntime()) return
    if (!autoCheckUpdate) return
    if (dialogOpen || installing) return
    const interval = window.setInterval(() => {
      void checkUpdate(true)
    }, UPDATE_CHECK_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [autoCheckUpdate, checkUpdate, dialogOpen, installing])

  const progressPercent = useMemo(() => {
    if (!progress.total) return 0
    return Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
  }, [progress.downloaded, progress.total])

  const downloadSpeedText = useMemo(() => {
    if (!progress.speed || progress.finished) return ''
    return `${formatBytes(progress.speed)}/s`
  }, [progress.finished, progress.speed])

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="iconSm"
            className="relative"
            disabled={checking}
            aria-label={checking ? '正在检查更新' : '检查更新'}
            onClick={() => void checkUpdate(false)}
          >
            <RefreshCw className={checking ? 'animate-spin' : undefined} />
            {update && !dialogOpen ? (
              <span
                className="absolute -right-0.5 -top-0.5 size-2 rounded-full border border-[var(--background)] bg-[var(--error)]"
                title="有可用的新版本"
              />
            ) : null}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{checking ? '正在检查更新…' : '检查更新'}</TooltipContent>
      </Tooltip>

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
    </>
  )
}
