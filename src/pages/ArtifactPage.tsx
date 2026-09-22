import {Copy, File, FileArchive, FileSearch, FolderOpen, Trash2} from 'lucide-react'
import {useMemo, useState} from 'react'
import {JarInspectorDialog} from '@/components/JarTools/JarInspectorDialog'
import {Button} from '@/components/ui/button'
import {Card} from '@/components/ui/card'
import {Checkbox} from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {MonoText} from '@/components/ui/mono-text'
import {PageHeader} from '@/components/ui/page-header'
import {Pagination} from '@/components/ui/pagination'
import {StatusPill} from '@/components/ui/status-pill'
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip'
import {api} from '@/services/tauri-api'
import {useAppStore} from '@/store/useAppStore'
import {describeError, notifyError, notifySuccess} from '@/store/useFeedbackStore'
import type {BuildArtifact} from '@/types/domain'

const formatSize = (size: number) => {
  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(2)} MB`
  }
  if (size >= 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }
  return `${size} B`
}

const formatTime = (value?: string) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

const archiveExtensions = new Set(['jar', 'war', 'zip', 'tar', 'gz', 'rar', '7z', 'ear', 'pom'])

const artifactIcon = (extension: string) =>
  archiveExtensions.has(extension.toLowerCase()) ? FileArchive : File

const artifactTime = (artifact: BuildArtifact) =>
  artifact.modifiedAt ? new Date(artifact.modifiedAt).getTime() : 0

const dedupeArtifacts = (artifacts: BuildArtifact[]) => {
  const seen = new Set<string>()
  return artifacts
    .filter((artifact) => {
      if (seen.has(artifact.path)) return false
      seen.add(artifact.path)
      return true
    })
    // 最新修改在前，避免合并当前产物与历史产物后顺序混乱
    .sort((a, b) => artifactTime(b) - artifactTime(a) || a.fileName.localeCompare(b.fileName))
}

function DeleteArtifactDialog({
  artifact,
  open,
  onOpenChange,
  onDelete,
}: {
  artifact: BuildArtifact | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete: (recordOnly: boolean) => void
}) {
  const [recordOnly, setRecordOnly] = useState(false)

  if (!artifact) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>删除产物</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 px-5 py-2">
          <p className="m-0 text-[13px] text-[var(--foreground)]">
            确定要删除 {artifact.fileName} 吗？
          </p>
          <label className="flex cursor-pointer items-center gap-2 text-[13px]">
            <Checkbox checked={recordOnly} onCheckedChange={(v) => setRecordOnly(v === true)} />
            仅删除记录，不删除文件
          </label>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onDelete(recordOnly)
              onOpenChange(false)
              setRecordOnly(false)
            }}
          >
            删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ArtifactPage() {
  const artifacts = useAppStore((state) => state.artifacts)
  const history = useAppStore((state) => state.history)
  const removeArtifact = useAppStore((state) => state.removeArtifact)
  const [deleteTarget, setDeleteTarget] = useState<BuildArtifact | null>(null)
  const [inspectTarget, setInspectTarget] = useState<BuildArtifact | null>(null)
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)
  const pageSize = 20

  const allArtifacts = useMemo(
    () => dedupeArtifacts([...artifacts, ...history.flatMap((record) => record.artifacts ?? [])]),
    [artifacts, history],
  )

  const visibleArtifacts = useMemo(() => {
    const query = keyword.trim().toLowerCase()
    if (!query) return allArtifacts
    return allArtifacts.filter(
      (artifact) =>
        artifact.fileName.toLowerCase().includes(query) ||
        artifact.path.toLowerCase().includes(query) ||
        artifact.modulePath.toLowerCase().includes(query),
    )
  }, [allArtifacts, keyword])

  const pageCount = Math.max(1, Math.ceil(visibleArtifacts.length / pageSize))
  const currentPage = Math.min(page, pageCount - 1)
  const pageArtifacts = visibleArtifacts.slice(
    currentPage * pageSize,
    currentPage * pageSize + pageSize,
  )

  const copyPath = async (artifact: BuildArtifact) => {
    try {
      await navigator.clipboard?.writeText(artifact.path)
      notifySuccess('已复制路径')
    } catch (error) {
      notifyError('复制路径失败', describeError(error))
    }
  }

  const openArtifactLocation = async (artifact: BuildArtifact) => {
    try {
      await api.openPathInExplorer(artifact.path)
    } catch (error) {
      notifyError('打开目录失败', describeError(error))
    }
  }

  const deleteArtifact = async (artifact: BuildArtifact, recordOnly: boolean) => {
    try {
      await removeArtifact(artifact.path, recordOnly)
      notifySuccess(recordOnly ? `已移除 ${artifact.fileName} 的记录` : `已清理 ${artifact.fileName}`)
    } catch (error) {
      notifyError('删除产物失败', describeError(error))
    }
  }

  return (
    <section className="mx-auto w-full max-w-[1180px] p-4 lg:p-6">
      <PageHeader
        title="产物管理"
        description="集中查看构建产物，复制路径、打开目录，并进入部署。"
      />
      {allArtifacts.length > 0 ? (
        <div className="mb-3 max-w-sm">
          <Input
            placeholder="搜索文件名 / 路径 / 模块"
            value={keyword}
            onChange={(event) => {
              setKeyword(event.target.value)
              setPage(0)
            }}
          />
        </div>
      ) : null}
      {allArtifacts.length === 0 ? (
        <Card className="flex min-h-32 items-center justify-center">
          <span className="text-[13px] text-[var(--muted-foreground)]">暂无构建产物</span>
        </Card>
      ) : visibleArtifacts.length === 0 ? (
        <Card className="flex min-h-32 items-center justify-center">
          <span className="text-[13px] text-[var(--muted-foreground)]">没有匹配的产物</span>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] table-fixed border-collapse text-[13px]">
              <colgroup>
                <col className="w-[38%]" />
                <col className="w-[90px]" />
                <col className="w-[90px]" />
                <col className="w-[22%]" />
                <col className="w-[150px]" />
                <col className="w-[120px]" />
              </colgroup>
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--muted)] text-left text-[12px] font-medium text-[var(--muted-foreground)]">
                  <th className="px-3 py-2">文件名</th>
                  <th className="px-3 py-2">类型</th>
                  <th className="px-3 py-2 text-right">大小</th>
                  <th className="px-3 py-2">模块</th>
                  <th className="px-3 py-2">修改时间</th>
                  <th className="px-3 py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {pageArtifacts.map((artifact) => {
                  const Icon = artifactIcon(artifact.extension)
                  return (
                    <tr
                      key={artifact.path}
                      className="border-b border-[var(--border)] transition-colors last:border-b-0 hover:bg-[var(--accent)]"
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]">
                            <Icon className="size-4" />
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-medium text-[var(--foreground)]" title={artifact.fileName}>
                              {artifact.fileName}
                            </div>
                            <MonoText className="mt-0.5 block truncate text-[11px] leading-[14px] text-[var(--muted-foreground)]">
                              {artifact.path}
                            </MonoText>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusPill>{artifact.extension || 'file'}</StatusPill>
                      </td>
                      <td className="px-3 py-2.5 text-right font-[family-name:var(--font-mono)] text-[12px] text-[var(--foreground)]">
                        {formatSize(artifact.sizeBytes)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="block truncate text-[12px] text-[var(--muted-foreground)]" title={artifact.modulePath}>
                          {artifact.modulePath || '根项目'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-[var(--muted-foreground)]">
                        {formatTime(artifact.modifiedAt)}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-0.5">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="iconSm"
                                aria-label="复制路径"
                                onClick={() => void copyPath(artifact)}
                              >
                                <Copy />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>复制路径</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="iconSm"
                                aria-label="打开目录"
                                onClick={() => void openArtifactLocation(artifact)}
                              >
                                <FolderOpen />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>打开目录</TooltipContent>
                          </Tooltip>
                          {archiveExtensions.has(artifact.extension.toLowerCase()) ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="iconSm"
                                  aria-label="查看归档内容"
                                  onClick={() => setInspectTarget(artifact)}
                                >
                                  <FileSearch />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>查看内容</TooltipContent>
                            </Tooltip>
                          ) : null}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="iconSm"
                                className="text-[var(--error)]"
                                aria-label="删除"
                                onClick={() => setDeleteTarget(artifact)}
                              >
                                <Trash2 />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>删除</TooltipContent>
                          </Tooltip>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pagination
            total={visibleArtifacts.length}
            pageSize={pageSize}
            currentPage={currentPage}
            onPageChange={setPage}
          />
        </Card>
      )}
      <JarInspectorDialog
        key={inspectTarget?.path ?? 'none'}
        artifact={inspectTarget}
        open={Boolean(inspectTarget)}
        onOpenChange={(open) => {
          if (!open) setInspectTarget(null)
        }}
      />
      <DeleteArtifactDialog
        artifact={deleteTarget}
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        onDelete={(recordOnly) => {
          if (deleteTarget) void deleteArtifact(deleteTarget, recordOnly)
        }}
      />
    </section>
  )
}
