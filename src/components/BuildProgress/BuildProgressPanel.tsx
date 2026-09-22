import {AlertTriangle, Check, Circle, Loader2, X} from 'lucide-react'
import {useEffect, useState} from 'react'
import {AnimatePresence} from 'motion/react'
import {cn} from '@/lib/utils'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {StatusPill} from '@/components/ui/status-pill'
import {motion, slideInUp} from '@/lib/motion'
import {useAppStore} from '@/store/useAppStore'
import {useBuildProgressStore} from '@/store/useBuildProgressStore'
import {useNavigationStore} from '@/store/navigationStore'
import type {BuildProgressStatus, StepStatus} from '@/services/buildProgressService'
import {isActiveStatus, progressBarClass, progressLabel, progressTextClass} from './progressTone'

const stepIcon = (status: StepStatus, active: boolean) => {
  if (status === 'done') return <Check className="size-3" />
  if (status === 'failed') return <AlertTriangle className="size-3" />
  if (status === 'active') {
    return active ? (
      <Loader2 className="size-3 animate-spin" />
    ) : (
      <Circle className="size-2 fill-current" />
    )
  }
  return <Circle className="size-2" />
}

const stepClass = (status: StepStatus) => {
  switch (status) {
    case 'done':
      return 'border-[var(--success)]/45 text-[var(--success)]'
    case 'failed':
      return 'border-[var(--error)]/45 text-[var(--error)]'
    case 'active':
      return 'border-[var(--primary)]/50 text-[var(--foreground)] font-medium'
    default:
      return 'border-[var(--border)] text-[var(--muted-foreground)]'
  }
}

const StepChip = ({
  label,
  status,
  active,
}: {
  label: string
  status: StepStatus
  active: boolean
}) => (
  <span
    className={cn(
      'inline-flex h-[22px] items-center gap-1 rounded-full border px-2 text-[12px] leading-[18px] whitespace-nowrap transition-colors',
      stepClass(status),
    )}
  >
    {stepIcon(status, active)}
    {label}
  </span>
)

const formatDuration = (ms: number) => {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m${seconds % 60}s`
}

/**
 * 打包进度面板（详细视图）
 * - 阶段：准备 / 构建模块 / 扫描产物 / 完成，区分已完成、进行中、未开始
 * - 子步骤：清理 / 编译 / 测试 / 打包 / 安装，按当前 Maven 阶段推进
 * - 成功：展示完成状态并在数秒后自动收起；失败：保持可见并给出失败提示
 */
export function BuildProgressPanel() {
  const snapshot = useBuildProgressStore((state) => state.snapshot)
  const visible = useBuildProgressStore((state) => state.visible)
  const dismiss = useBuildProgressStore((state) => state.dismiss)
  const artifacts = useAppStore((state) => state.artifacts)
  const durationMs = useAppStore((state) => state.durationMs)
  const diagnosis = useAppStore((state) => state.diagnosis)
  const openInspector = useNavigationStore((state) => state.openInspector)
  const [elapsed, setElapsed] = useState(0)
  const [elapsedRun, setElapsedRun] = useState(snapshot.startedAt)

  const status: BuildProgressStatus = snapshot.status
  const active = isActiveStatus(status)

  // 新一轮构建开始时重置计时（渲染期同步，避免 effect 里的级联渲染）
  if (elapsedRun !== snapshot.startedAt) {
    setElapsedRun(snapshot.startedAt)
    setElapsed(0)
  }

  // 计时只在定时器回调里更新，避免渲染期读取 Date.now 造成不稳定结果
  useEffect(() => {
    if (!active || !snapshot.startedAt) return
    const startedAt = snapshot.startedAt
    const timer = window.setInterval(() => setElapsed(Date.now() - startedAt), 1000)
    return () => window.clearInterval(timer)
  }, [active, snapshot.startedAt])

  if (!visible || status === 'idle') return null

  const failureMessage = snapshot.message ?? diagnosis?.summary

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div key="build-progress-panel" {...slideInUp}>
          <Card className={status === 'failed' ? 'border-[var(--error)]/40' : undefined}>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <div className="flex min-w-0 items-center gap-2">
          <CardTitle>打包进度</CardTitle>
          <StatusPill tone={active ? 'processing' : status === 'success' ? 'success' : status === 'failed' ? 'error' : 'warning'}>
            {progressLabel(status)}
          </StatusPill>
          {snapshot.indeterminate ? (
            <StatusPill tone="warning">进度无法确定</StatusPill>
          ) : snapshot.estimated && active ? (
            <StatusPill>按日志估算</StatusPill>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('font-[family-name:var(--font-mono)] text-[18px] font-semibold', progressTextClass(status))}>
            {snapshot.indeterminate ? '—' : `${snapshot.percent}%`}
          </span>
          <Button variant="ghost" size="iconSm" aria-label="收起进度" onClick={dismiss}>
            <X />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-[var(--muted)]"
          role="progressbar"
          aria-valuenow={snapshot.indeterminate ? undefined : snapshot.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="打包进度"
        >
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-300 ease-out',
              progressBarClass(status),
              (active || snapshot.indeterminate) && 'progress-stripes',
            )}
            style={{width: snapshot.indeterminate ? '100%' : `${snapshot.percent}%`}}
          />
        </div>

        {snapshot.indeterminate ? (
          <p className="m-0 text-[12px] text-[var(--muted-foreground)]">
            日志中缺少可识别的阶段信息（常见于手工改写的命令或 -q 安静模式），无法估算百分比；构建仍在继续，请以下方日志为准。
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-1.5">
          {snapshot.stages.map((stage, index) => (
            <span key={stage.key} className="flex items-center gap-1.5">
              <StepChip label={stage.label} status={stage.status} active={active} />
              {index < snapshot.stages.length - 1 ? (
                <span className="text-[12px] text-[var(--border-strong)]">→</span>
              ) : null}
            </span>
          ))}
        </div>

        {snapshot.totalModules > 1 ? (
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--muted-foreground)]">
            <span>
              模块{' '}
              {snapshot.currentModuleNumber
                ? snapshot.currentModuleNumber
                : Math.min(snapshot.completedModules + (active ? 1 : 0), snapshot.totalModules)}
              /{snapshot.totalModules}
              {snapshot.reactorDetected ? '（按日志 Reactor 统计）' : ''}
            </span>
            {snapshot.currentModule ? (
              <span className="max-w-full truncate text-[var(--foreground)]" title={snapshot.currentModule}>
                正在构建：{snapshot.currentModule}
              </span>
            ) : null}
          </div>
        ) : null}

        {snapshot.subSteps.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] text-[var(--muted-foreground)]">
              子步骤
              {snapshot.currentPhase ? ` · 当前：${snapshot.currentPhase}` : ''}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {snapshot.subSteps.map((step, index) => (
                <span key={step.key} className="flex items-center gap-1.5">
                  <StepChip label={step.label} status={step.status} active={active} />
                  {index < snapshot.subSteps.length - 1 ? (
                    <span className="text-[12px] text-[var(--border-strong)]">→</span>
                  ) : null}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {status === 'failed' ? (
          <div className="flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--error)]/40 bg-[var(--error)]/5 px-3 py-2">
            <span className="text-[13px] font-medium text-[var(--error)]">
              构建失败，已完成 {snapshot.percent}%
            </span>
            {failureMessage ? (
              <span className="break-words text-[12px] text-[var(--muted-foreground)]">{failureMessage}</span>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              className="self-start"
              onClick={() => openInspector('diagnosis')}
            >
              查看诊断与日志
            </Button>
          </div>
        ) : null}

        {status === 'success' ? (
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-[var(--success)]">
            <Check className="size-4" />
            <span>打包完成</span>
            {durationMs > 0 ? <span className="text-[var(--muted-foreground)]">耗时 {formatDuration(durationMs)}</span> : null}
            <span className="text-[var(--muted-foreground)]">发现 {artifacts.length} 个产物</span>
            <span className="text-[12px] text-[var(--muted-foreground)]">（进度条会保留，可点右上角收起）</span>
          </div>
        ) : null}

        {status === 'cancelled' ? (
          <span className="text-[13px] text-[var(--warning)]">构建已停止，进度保留供参考。</span>
        ) : null}

        {active ? (
          <span className="text-[12px] text-[var(--muted-foreground)]">
            已用时 {formatDuration(elapsed)}
          </span>
        ) : null}
      </CardContent>
          </Card>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
