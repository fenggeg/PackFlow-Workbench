import {Code, Copy, Download, Square, Zap} from 'lucide-react'
import {useState} from 'react'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {StatusPill} from '@/components/ui/status-pill'
import {api} from '@/services/tauri-api'
import {useAppStore} from '@/store/useAppStore'
import {useDependencyStore} from '@/store/useDependencyStore'
import {describeError, notifyError, notifyInfo, notifySuccess} from '@/store/useFeedbackStore'
import type {DependencyConflict, ModuleConflictResult} from '@/types/domain'
import {downloadTextFile, timestampSuffix} from '@/utils/download'

function ConflictRow({
  conflict,
  onPreview,
}: {
  conflict: DependencyConflict
  onPreview: (code: string) => void
}) {
  const handleGenerate = async () => {
    try {
      const code = await api.generateExclusionCode(conflict.groupId, conflict.artifactId)
      onPreview(code)
    } catch (error) {
      notifyError('生成排除代码失败', describeError(error))
    }
  }

  return (
    <div className="border-b border-[var(--border)] py-2 last:border-b-0">
      <StatusPill tone="error">
        {conflict.groupId}:{conflict.artifactId}
      </StatusPill>
      <div className="mt-1 text-[13px]">
        <span className="text-[var(--muted-foreground)]">冲突版本：</span>
        <span className="line-through">{conflict.requestedVersion}</span>
        <span className="mx-2">→</span>
        <span className="font-medium text-[var(--success)]">{conflict.selectedVersion}</span>
      </div>
      <div className="mt-0.5 text-[12px] text-[var(--muted-foreground)]">
        依赖路径：{conflict.dependencyPath}
      </div>
      <div className="mt-1.5">
        <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => void handleGenerate()}>
          <Code />
          生成排除代码
        </Button>
      </div>
    </div>
  )
}

function ExclusionPreviewModal({
  open,
  code,
  onClose,
}: {
  open: boolean
  code: string
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      notifySuccess('已复制排除代码')
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      notifyError('复制失败', describeError(error))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Maven 排除代码预览</DialogTitle>
        </DialogHeader>
        <div className="px-5 py-2">
          <p className="m-0 mb-2 text-[13px] text-[var(--muted-foreground)]">
            将以下代码添加到对应 &lt;dependency&gt; 声明中即可排除冲突的传递依赖：
          </p>
          <pre
            data-allow-context-menu
            className="m-0 overflow-x-auto rounded-[var(--radius)] bg-[var(--console-bg)] p-3 font-[family-name:var(--font-mono)] text-[13px] leading-relaxed text-[var(--console-text)]"
          >
            <code>{code}</code>
          </pre>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            关闭
          </Button>
          <Button variant="primary" className="gap-1.5" onClick={() => void handleCopy()}>
            <Copy />
            {copied ? '已复制' : '复制到剪贴板'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}分${s}秒` : `${s}秒`
}

export function DependencyConflictPanel() {
  const project = useAppStore((state) => state.project)
  const scanning = useDependencyStore((state) => state.scanning)
  const elapsed = useDependencyStore((state) => state.elapsed)
  const progress = useDependencyStore((state) => state.progress)
  const result = useDependencyStore((state) => state.result)
  const error = useDependencyStore((state) => state.error)
  const startScan = useDependencyStore((state) => state.startScan)
  const cancelScan = useDependencyStore((state) => state.cancelScan)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewCode, setPreviewCode] = useState('')
  const [detailModule, setDetailModule] = useState<ModuleConflictResult | null>(null)

  const handleScan = () => {
    if (!project?.rootPath) {
      notifyError('请先选择 Maven 项目再扫描')
      return
    }
    void startScan(project.rootPath)
  }

  const handleBulkPreview = async (conflicts: DependencyConflict[]) => {
    try {
      const code = await api.generateBulkExclusionCode(conflicts)
      if (code) {
        setPreviewCode(code)
        setPreviewOpen(true)
      } else {
        notifyInfo('无冲突可生成排除代码')
      }
    } catch (err) {
      notifyError('批量生成失败', describeError(err))
    }
  }

  /** 导出扫描结果为 JSON，便于贴到 issue 或交给同事复现 */
  const exportResult = () => {
    if (!result) return
    downloadTextFile(
      `packflow-conflicts-${timestampSuffix()}.json`,
      JSON.stringify(result, null, 2),
      'application/json;charset=utf-8',
    )
    notifySuccess('已导出依赖冲突结果')
  }

  const progressPercent =
    progress && progress.totalModules > 0
      ? Math.round((progress.scannedModules / progress.totalModules) * 100)
      : undefined

  return (
    <Card>
      <CardHeader>
        <CardTitle>依赖冲突检测</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="m-0 text-[13px] text-[var(--muted-foreground)]">
          通过 mvn dependency:tree -Dverbose 分析项目中各模块的传递依赖冲突，并可生成 Maven 排除代码。
        </p>

        <div className="flex gap-2">
          <Button
            variant="primary"
            className="flex-1 gap-1.5"
            disabled={scanning || !project}
            onClick={handleScan}
          >
            <Zap />
            {scanning ? '正在扫描...' : '扫描依赖冲突'}
          </Button>
          {result && !scanning ? (
            <Button variant="secondary" className="gap-1.5" onClick={exportResult}>
              <Download />
              导出
            </Button>
          ) : null}
          {scanning ? (
            <Button
              variant="destructive"
              className="gap-1.5"
              title="终止 dependency:tree 进程并放弃本次结果"
              onClick={cancelScan}
            >
              <Square />
              取消扫描
            </Button>
          ) : null}
        </div>

        {scanning ? (
          <div className="flex flex-col gap-2 py-2">
            {progressPercent !== undefined ? (
              <>
                <div className="flex items-center justify-between text-[12px] text-[var(--muted-foreground)]">
                  <span>
                    {progress ? `${progress.scannedModules} / ${progress.totalModules} 模块` : ''}
                  </span>
                  <span>{progressPercent}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--muted)]">
                  <div
                    className="h-full rounded-full bg-[var(--primary)] transition-all duration-150"
                    style={{width: `${progressPercent}%`}}
                  />
                </div>
                {progress?.currentModule ? (
                  <div className="truncate text-[12px] text-[var(--muted-foreground)]">
                    正在扫描：{progress.currentModule}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 py-4">
                <span className="size-4 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--primary)]" />
                <span className="text-[13px] text-[var(--muted-foreground)]">正在启动 dependency:tree...</span>
              </div>
            )}
            {elapsed > 2 ? (
              <div className="text-right text-[12px] text-[var(--muted-foreground)]">
                已用时 {formatTime(elapsed)}
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-[var(--radius)] border border-[var(--error)]/30 bg-[var(--error)]/5 px-3 py-2 text-[13px] text-[var(--error)]">
            扫描失败
            <p className="m-0 mt-1 text-[12px]">{error}</p>
          </div>
        ) : null}

        {result?.warning ? (
          <div className="rounded-[var(--radius)] border border-[var(--warning)] bg-[var(--warning)]/10 px-3 py-2 text-[12px] text-[var(--foreground)]">
            {result.warning}
          </div>
        ) : null}

        {result && !result.hasConflicts ? (
          <div className="flex min-h-16 items-center justify-center text-[13px] text-[var(--muted-foreground)]">
            {result.warning ? '本次扫描未发现冲突，但结果可能不完整' : '未发现依赖冲突，所有依赖版本一致'}
          </div>
        ) : null}

        {result && result.hasConflicts ? (
          <div className="text-right text-[12px] text-[var(--muted-foreground)]">
            共 {result.modules.length} 个模块存在冲突，扫描耗时 {formatTime(elapsed)}
          </div>
        ) : null}

        {result?.modules.map((mod) => (
          <div key={mod.moduleId} className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusPill tone="warning" className="max-w-[140px] truncate">
                {mod.artifactId}
              </StatusPill>
              <StatusPill tone="warning">{mod.conflicts.length} 个冲突</StatusPill>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                className="h-7 gap-1.5 text-[12px]"
                onClick={() => setDetailModule(mod)}
              >
                查看详情
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-[12px]"
                onClick={() => void handleBulkPreview(mod.conflicts)}
              >
                <Code />
                批量排除
              </Button>
            </div>
          </div>
        ))}

        {!project ? (
          <div className="rounded-[var(--radius)] border border-[var(--warning)]/30 bg-[var(--warning)]/5 px-3 py-2 text-[13px] text-[var(--warning)]">
            请先选择 Maven 项目再扫描
          </div>
        ) : null}
      </CardContent>

      <Dialog open={Boolean(detailModule)} onOpenChange={(open) => !open && setDetailModule(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{detailModule?.artifactId} 的冲突详情</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto px-5 py-2">
            {detailModule?.conflicts.map((conflict) => (
              <ConflictRow
                key={`${conflict.groupId}:${conflict.artifactId}:${conflict.requestedVersion}:${conflict.dependencyPath}`}
                conflict={conflict}
                onPreview={(code) => {
                  setPreviewCode(code)
                  setPreviewOpen(true)
                }}
              />
            ))}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDetailModule(null)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ExclusionPreviewModal open={previewOpen} code={previewCode} onClose={() => setPreviewOpen(false)} />
    </Card>
  )
}
