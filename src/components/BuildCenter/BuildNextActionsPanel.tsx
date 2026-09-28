import {Copy, FolderOpen, RefreshCw} from 'lucide-react'
import {useMemo} from 'react'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {StatusPill} from '@/components/ui/status-pill'
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip'
import {useBuildSessionStore} from '@/store/useBuildSessionStore'
import {useAppStore} from '@/store/useAppStore'
import {useBuildProgressStore} from '@/store/useBuildProgressStore'
import {useNavigationStore} from '@/store/navigationStore'
import {api} from '@/services/tauri-api'
import {describeError, notifyError, notifySuccess} from '@/store/useFeedbackStore'
import {diffArtifacts, formatBytes} from '@/utils/buildStats'

/**
 * 下一步操作的内容本体（不含外层卡片）：
 * - 构建结束（成功/失败/已停止）后展示，运行中返回 null
 * - 打包进度面板在构建结束后会内嵌这份内容，让操作紧跟进度、触手可及
 */
export function BuildNextActionsContent() {
  const buildStatus = useBuildSessionStore((state) => state.status)
  const artifacts = useAppStore((state) => state.artifacts)
  const diagnosis = useAppStore((state) => state.diagnosis)
  const history = useAppStore((state) => state.history)
  const projectRoot = useAppStore((state) => state.buildOptions.projectRoot)
  const modulePath = useAppStore((state) => state.buildOptions.selectedModulePath)
  const startBuild = useAppStore((state) => state.startBuild)
  const setActivePage = useNavigationStore((state) => state.setActivePage)
  const openInspector = useNavigationStore((state) => state.openInspector)
  const progressPercent = useBuildProgressStore((state) => state.snapshot.percent)

  // 上一次同项目同范围的成功产物（history[0] 是本次构建，取其后第一条）
  const previousArtifacts = useMemo(() => {
    const candidates = history.filter(
      (record) =>
        record.status === 'SUCCESS'
        && record.projectRoot === projectRoot
        && record.modulePath === modulePath
        && (record.artifacts?.length ?? 0) > 0,
    )
    return candidates[1]?.artifacts ?? []
  }, [history, modulePath, projectRoot])

  const artifactDiff = useMemo(
    () =>
      artifacts.length > 0 && previousArtifacts.length > 0
        ? diffArtifacts(artifacts, previousArtifacts)
        : undefined,
    [artifacts, previousArtifacts],
  )

  if (buildStatus === 'RUNNING') {
    return null
  }

  if (buildStatus === 'FAILED' || buildStatus === 'CANCELLED') {
    return (
      <div className="flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--error)]/40 bg-[var(--error)]/5 px-3 py-2">
        <span className="text-[13px] font-medium text-[var(--error)]">
          {buildStatus === 'FAILED' ? '构建失败' : '构建已停止'}
          {progressPercent > 0 ? `，已完成 ${progressPercent}%` : ''}
        </span>
        <span className="break-words text-[12px] text-[var(--muted-foreground)]">
          {diagnosis?.summary ?? '请查看构建日志了解详情。'}
        </span>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => openInspector('diagnosis')}>
            查看诊断与日志
          </Button>
          <Button variant="primary" size="sm" className="gap-1.5" onClick={() => void startBuild()}>
            <RefreshCw />
            重新构建
          </Button>
        </div>
      </div>
    )
  }

  if (buildStatus !== 'SUCCESS') {
    return null
  }

  return (
    <div className="flex flex-col gap-3">
      {artifactDiff ? (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-[12px] text-[var(--muted-foreground)]">
          <span className="font-medium text-[var(--foreground)]">与上次构建对比</span>
          {artifactDiff.added.length > 0 ? ` · 新增 ${artifactDiff.added.length}` : ''}
          {artifactDiff.changed.length > 0 ? ` · 体积变化 ${artifactDiff.changed.length}` : ''}
          {artifactDiff.removed.length > 0 ? ` · 减少 ${artifactDiff.removed.length}` : ''}
          {artifactDiff.added.length === 0
          && artifactDiff.changed.length === 0
          && artifactDiff.removed.length === 0
            ? ' · 产物完全一致'
            : ''}
          <ul className="m-0 mt-1 flex list-none flex-col gap-0.5 p-0">
            {artifactDiff.changed.slice(0, 5).map((item) => (
              <li key={item.path} className="truncate font-[family-name:var(--font-mono)]">
                {item.fileName} {formatBytes(item.previousBytes)} → {formatBytes(item.currentBytes)}
              </li>
            ))}
            {artifactDiff.removed.slice(0, 5).map((item) => (
              <li key={item.path} className="truncate font-[family-name:var(--font-mono)]">
                {item.fileName} 本次未产出
              </li>
            ))}
          </ul>
        </div>
      ) : null}
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
    </div>
  )
}

const isFinishedProgress = (status: string) =>
  status === 'success' || status === 'failed' || status === 'cancelled'

export function BuildNextActionsPanel() {
  const buildStatus = useBuildSessionStore((state) => state.status)
  const progressVisible = useBuildProgressStore((state) => state.visible)
  const progressStatus = useBuildProgressStore((state) => state.snapshot.status)

  // 进度面板构建结束后会内嵌同一份内容；面板仍可见时不重复渲染底部的独立卡片，
  // 用户收起进度面板后这里自动恢复，操作始终可达
  if (progressVisible && isFinishedProgress(progressStatus)) {
    return null
  }

  if (buildStatus !== 'SUCCESS' && buildStatus !== 'FAILED' && buildStatus !== 'CANCELLED') {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>下一步操作</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <BuildNextActionsContent />
      </CardContent>
    </Card>
  )
}
