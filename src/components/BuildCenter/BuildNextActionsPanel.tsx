import {Copy, FolderOpen, RefreshCw} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {StatusPill} from '@/components/ui/status-pill'
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip'
import {useAppStore} from '@/store/useAppStore'
import {useNavigationStore} from '@/store/navigationStore'
import {api} from '@/services/tauri-api'
import {describeError, notifyError, notifySuccess} from '@/store/useFeedbackStore'

export function BuildNextActionsPanel() {
  const buildStatus = useAppStore((state) => state.buildStatus)
  const buildCancelling = useAppStore((state) => state.buildCancelling)
  const artifacts = useAppStore((state) => state.artifacts)
  const diagnosis = useAppStore((state) => state.diagnosis)
  const startBuild = useAppStore((state) => state.startBuild)
  const setActivePage = useNavigationStore((state) => state.setActivePage)

  if (buildStatus === 'RUNNING' || buildCancelling) {
    return null
  }

  if (buildStatus === 'FAILED' || buildStatus === 'CANCELLED') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>下一步操作</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[16px] font-semibold text-[var(--error)]">
              {buildStatus === 'FAILED' ? '构建失败' : '构建已停止'}
            </span>
            <span className="text-[13px] text-[var(--muted-foreground)]">
              {diagnosis?.summary ?? '请查看构建日志了解详情。'}
            </span>
          </div>
          <Button variant="primary" className="gap-1.5" onClick={() => void startBuild()}>
            <RefreshCw />
            重新构建
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (buildStatus !== 'SUCCESS') {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>下一步操作</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {artifacts.length === 0 ? (
          <div className="rounded-[var(--radius)] border border-[var(--warning)]/30 bg-[var(--warning)]/5 px-3 py-2 text-[13px] text-[var(--warning)]">
            构建成功，但未发现 jar/war 产物
          </div>
        ) : null}

        {artifacts.length > 0 ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone="info">构建产物</StatusPill>
              <span className="text-[13px] font-medium">共 {artifacts.length} 个产物，可复制或定位到文件</span>
            </div>
            <ul className="m-0 list-none divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] p-0">
              {artifacts.slice(0, 4).map((artifact) => (
                <li key={artifact.path} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium" title={artifact.fileName}>
                      {artifact.fileName}
                    </div>
                    <div className="text-[12px] text-[var(--muted-foreground)]">
                      {artifact.modulePath || '根项目'} · {(artifact.sizeBytes / 1024 / 1024).toFixed(2)} MB
                    </div>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="iconSm"
                        aria-label="复制文件"
                        onClick={() => {
                          void api.copyFileToClipboard(artifact.path).then(
                            () => notifySuccess('已复制文件到剪贴板'),
                            (error) => notifyError('复制文件失败', describeError(error)),
                          )
                        }}
                      >
                        <Copy />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>复制文件</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="iconSm"
                        aria-label="定位产物"
                        onClick={() =>
                          void api.openPathInExplorer(artifact.path).catch((error) => {
                            notifyError('打开目录失败', describeError(error))
                          })
                        }
                      >
                        <FolderOpen />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>定位产物</TooltipContent>
                  </Tooltip>
                </li>
              ))}
            </ul>
            {artifacts.length > 4 ? (
              <Button variant="ghost" size="sm" className="self-start" onClick={() => setActivePage('artifacts')}>
                查看全部 {artifacts.length} 个产物
              </Button>
            ) : null}
          </>
        ) : (
          <div className="flex min-h-16 items-center justify-center text-[13px] text-[var(--muted-foreground)]">
            暂无可操作产物
          </div>
        )}
      </CardContent>
    </Card>
  )
}
