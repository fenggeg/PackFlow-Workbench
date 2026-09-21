import {cn} from '@/lib/utils'
import {useBuildProgressStore} from '@/store/useBuildProgressStore'
import {isActiveStatus, progressBarClass} from './progressTone'

/**
 * 底栏细进度条：在底部操作栏上沿展示，不占用额外布局空间。
 * 成功后随进度面板一起自动收起，失败时保持红色常驻。
 */
export function BuildProgressStrip() {
  const snapshot = useBuildProgressStore((state) => state.snapshot)
  const visible = useBuildProgressStore((state) => state.visible)

  if (!visible || snapshot.status === 'idle') return null

  const active = isActiveStatus(snapshot.status)

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-[var(--muted)]"
      role="progressbar"
      aria-valuenow={snapshot.percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="打包进度"
    >
      <div
        className={cn(
          'h-full transition-[width] duration-300 ease-out',
          progressBarClass(snapshot.status),
          active && 'progress-stripes',
        )}
        style={{width: `${snapshot.percent}%`}}
      />
    </div>
  )
}
