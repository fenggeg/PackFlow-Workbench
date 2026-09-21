import {Copy, Play, RefreshCw, Save, Square} from 'lucide-react'
import {useState} from 'react'
import {Button} from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {StatusPill} from '@/components/ui/status-pill'
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip'
import {SaveTemplateDialog} from '@/components/BuildTemplate/SaveTemplateDialog'
import {BuildProgressStrip} from '@/components/BuildProgress/BuildProgressStrip'
import {isActiveStatus} from '@/components/BuildProgress/progressTone'
import {useAppStore} from '@/store/useAppStore'
import {useBuildProgressStore} from '@/store/useBuildProgressStore'
import {describeError, notifyError, notifySuccess} from '@/store/useFeedbackStore'
import type {BuildStatus} from '@/types/domain'

const statusText: Record<BuildStatus, string> = {
  IDLE: '待构建',
  RUNNING: '构建中',
  SUCCESS: '成功',
  FAILED: '失败',
  CANCELLED: '已停止',
}

const statusTone = {
  IDLE: 'neutral',
  RUNNING: 'processing',
  SUCCESS: 'success',
  FAILED: 'error',
  CANCELLED: 'warning',
} as const

export function BottomActionBar() {
  const buildOptions = useAppStore((state) => state.buildOptions)
  const buildStatus = useAppStore((state) => state.buildStatus)
  const buildCancelling = useAppStore((state) => state.buildCancelling)
  const selectedModules = useAppStore((state) => state.selectedModules)
  const project = useAppStore((state) => state.project)
  const setEditableCommand = useAppStore((state) => state.setEditableCommand)
  const refreshCommandPreview = useAppStore((state) => state.refreshCommandPreview)
  const startBuild = useAppStore((state) => state.startBuild)
  const cancelBuild = useAppStore((state) => state.cancelBuild)
  const [commandOpen, setCommandOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [draftCommand, setDraftCommand] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const progress = useBuildProgressStore((state) => state.snapshot)
  const progressVisible = useBuildProgressStore((state) => state.visible)

  const running = buildStatus === 'RUNNING'
  const progressActive = progressVisible && progress.status !== 'idle'
  const commandReady = Boolean(buildOptions.projectRoot && buildOptions.editableCommand.trim())
  const targetLabel = selectedModules.length > 0
    ? selectedModules.length === 1
      ? selectedModules[0].artifactId
      : `${selectedModules.length} 个模块`
    : project
      ? '全部项目'
      : '未选择项目'
  const statusLabel = buildCancelling
    ? '停止中'
    : commandReady && buildStatus === 'IDLE'
      ? '待执行'
      : statusText[buildStatus]
  const tone = buildCancelling
    ? 'warning'
    : commandReady && buildStatus === 'IDLE'
      ? 'info'
      : statusTone[buildStatus]

  const openCommandEditor = () => {
    setDraftCommand(buildOptions.editableCommand)
    setCommandOpen(true)
  }

  const copyCommand = async () => {
    try {
      await navigator.clipboard?.writeText(buildOptions.editableCommand)
      notifySuccess('已复制构建命令')
    } catch (error) {
      notifyError('复制命令失败', describeError(error))
    }
  }

  const regenerate = async () => {
    setPreviewing(true)
    try {
      await refreshCommandPreview()
      notifySuccess('已按当前参数重新生成命令')
    } catch (error) {
      notifyError('生成命令失败', describeError(error))
    } finally {
      setPreviewing(false)
    }
  }

  return (
    <footer className="relative flex h-14 items-center gap-2 border-t border-[var(--border)] bg-[var(--card)] px-3 md:gap-3 md:px-4 overflow-hidden">
      <BuildProgressStrip />
      <div className="flex min-w-0 items-center gap-2">
        {progressActive ? (
          <StatusPill
            tone={
              progress.status === 'failed'
                ? 'error'
                : progress.status === 'success'
                  ? 'success'
                  : isActiveStatus(progress.status)
                    ? 'processing'
                    : 'warning'
            }
            className="shrink-0"
            title={progress.currentPhase ? `当前阶段：${progress.currentPhase}` : undefined}
          >
            {progress.percent}%{progress.status === 'success' ? ' · 已完成' : progress.currentPhase ? ` · ${progress.currentPhase}` : ''}
          </StatusPill>
        ) : (
          <StatusPill tone={tone} className="shrink-0">{statusLabel}</StatusPill>
        )}
        <span className="hidden max-w-40 truncate text-[13px] font-medium text-[var(--foreground)] sm:inline" title={targetLabel}>
          目标：{targetLabel}
        </span>
      </div>
      <button
        type="button"
        disabled={!buildOptions.editableCommand.trim()}
        onClick={openCommandEditor}
        title={buildOptions.editableCommand}
        data-allow-context-menu
        className="min-w-0 flex-1 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] px-3 py-1 text-left font-[family-name:var(--font-mono)] text-[12px] leading-4 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="line-clamp-2 break-all">
          {buildOptions.editableCommand || '选择项目后生成 Maven 命令'}
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              disabled={!buildOptions.editableCommand.trim()}
              aria-label="复制命令"
              onClick={() => void copyCommand()}
            >
              <Copy />
            </Button>
          </TooltipTrigger>
          <TooltipContent>复制命令</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              disabled={previewing || !buildOptions.projectRoot}
              aria-label="重新生成命令"
              onClick={() => void regenerate()}
            >
              <RefreshCw className={previewing ? 'animate-spin' : undefined} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>重新生成命令</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              disabled={!buildOptions.projectRoot}
              aria-label="保存为模板"
              onClick={() => setTemplateOpen(true)}
            >
              <Save />
            </Button>
          </TooltipTrigger>
          <TooltipContent>保存为构建模板</TooltipContent>
        </Tooltip>
        {running ? (
          <Button
            variant="destructive"
            disabled={buildCancelling}
            className="gap-1.5"
            onClick={() => void cancelBuild()}
          >
            <Square />
            停止
          </Button>
        ) : (
          <Button variant="primary" disabled={!commandReady} className="gap-1.5" onClick={() => void startBuild()}>
            <Play />
            开始构建
          </Button>
        )}
      </div>

      <Dialog open={commandOpen} onOpenChange={setCommandOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>完整命令预览</DialogTitle>
          </DialogHeader>
          <div className="px-5 py-2">
            <textarea
              data-allow-context-menu
              className="min-h-24 w-full resize-y rounded-[var(--radius)] border border-[var(--input)] bg-[var(--card)] px-3 py-2 font-[family-name:var(--font-mono)] text-[12px] text-[var(--foreground)] focus-visible:border-[var(--ring)] focus-visible:outline-none"
              rows={5}
              value={draftCommand}
              onChange={(event) => setDraftCommand(event.target.value)}
            />
            <p className="m-0 mt-2 text-[12px] text-[var(--muted-foreground)]">
              手动修改后点击「保存修改」生效；点击「恢复自动生成」会丢弃改动并按当前参数重新生成。
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={!buildOptions.projectRoot}
              onClick={() => void regenerate()}
            >
              恢复自动生成
            </Button>
            <Button variant="secondary" onClick={() => setCommandOpen(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setEditableCommand(draftCommand)
                setCommandOpen(false)
                notifySuccess('已保存命令修改')
              }}
            >
              保存修改
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SaveTemplateDialog open={templateOpen} onOpenChange={setTemplateOpen} />
    </footer>
  )
}
