import {cn} from '@/lib/utils'

/**
 * 启动页：与产品内视觉保持一致
 * - 使用同一套设计令牌（浅色/深色自动跟随）
 * - 标识与顶栏 logo 同构（圆角方块 + PF）
 * - 进度条与打包进度条同构（2px 细条 + 主色不定量动画）
 */
export function SplashOverlay({visible}: {visible: boolean}) {
  return (
    <div
      className={cn(
        'fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-[var(--background)] transition-opacity duration-200',
        visible ? 'opacity-100' : 'invisible opacity-0',
      )}
      style={{pointerEvents: visible ? 'auto' : 'none'}}
      aria-hidden={!visible}
    >
      <div className="flex size-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary)] text-[13px] font-semibold tracking-[-0.01em] text-[var(--primary-foreground)]">
        PF
      </div>
      <div className="mt-5 text-[16px] font-semibold tracking-[-0.01em] text-[var(--foreground)]">
        PackFlow Workbench
      </div>
      <div className="mt-1.5 text-[12px] text-[var(--muted-foreground)]">正在加载工作区…</div>
      <div className="mt-7 h-0.5 w-[120px] overflow-hidden rounded-full bg-[var(--border)]">
        <div className="splash-bar h-full w-1/3 rounded-full bg-[var(--primary)]" />
      </div>
    </div>
  )
}
