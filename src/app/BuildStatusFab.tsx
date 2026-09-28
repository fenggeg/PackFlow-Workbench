import {AlertTriangle, Check, Loader2, Maximize2, Square} from 'lucide-react'
import {motion} from '@/lib/motion'
import {useBuildSessionStore} from '@/store/useBuildSessionStore'
import {useBuildProgressStore} from '@/store/useBuildProgressStore'
import {useNavigationStore} from '@/store/navigationStore'
import {buildStatusLabel} from './buildStatusText'

/**
 * 构建任务状态悬浮按钮（右上角）：
 * - 构建推进期间展示实时进度，点击打开检查器查看日志；
 * - 构建结束后只要打包进度面板未收起就持续展示（此时它是回看日志/诊断的入口），
 *   进度面板被收起或检查器已展开时隐藏。
 * 与检查器胶囊共享 layoutId：点击时按钮原地「膨胀」成胶囊，收起时缩回按钮。
 */
export function BuildStatusFab() {
  const phase = useBuildSessionStore((state) => state.phase)
  const status = useBuildSessionStore((state) => state.status)
  const cancelling = useBuildSessionStore((state) => state.cancelling)
  const percent = useBuildProgressStore((state) => state.snapshot.percent)
  const indeterminate = useBuildProgressStore((state) => state.snapshot.indeterminate)
  const progressVisible = useBuildProgressStore((state) => state.visible)
  const progressStatus = useBuildProgressStore((state) => state.snapshot.status)
  const inspectorOpen = useNavigationStore((state) => state.inspectorOpen)
  const openInspector = useNavigationStore((state) => state.openInspector)

  const busy = phase === 'starting' || phase === 'running'
  const finished = progressVisible && progressStatus !== 'idle'
  const show = !inspectorOpen && (busy || finished)

  if (!show) return null

  return (
    <motion.button
      type="button"
      className="absolute right-4 top-4 z-20 flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-3.5 py-2 text-[12px] font-medium text-[var(--foreground)] shadow-lg transition-colors hover:bg-[var(--accent)]"
      initial={{opacity: 0, scale: 0.8, y: -8}}
      animate={{opacity: 1, scale: 1, y: 0}}
      transition={{type: 'spring', stiffness: 420, damping: 34}}
      onClick={() => openInspector('logs')}
      aria-label="打开检查器查看构建状态"
    >
      {busy ? (
        <>
          <Loader2 className="size-3.5 shrink-0 animate-spin text-[var(--primary)]" />
          <span className="whitespace-nowrap">
            {buildStatusLabel(cancelling, indeterminate, percent)}
          </span>
        </>
      ) : status === 'SUCCESS' ? (
        <>
          <Check className="size-3.5 shrink-0 text-[var(--success)]" />
          <span className="whitespace-nowrap">构建完成</span>
        </>
      ) : status === 'FAILED' ? (
        <>
          <AlertTriangle className="size-3.5 shrink-0 text-[var(--error)]" />
          <span className="whitespace-nowrap">构建失败</span>
        </>
      ) : (
        <>
          <Square className="size-3.5 shrink-0 text-[var(--warning)]" />
          <span className="whitespace-nowrap">构建已停止</span>
        </>
      )}
      <Maximize2 className="size-3.5 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
    </motion.button>
  )
}
