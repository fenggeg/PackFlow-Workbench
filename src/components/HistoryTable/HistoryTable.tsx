import {Copy, Download, FolderOpen, Maximize2, RotateCcw, ScrollText, Trash2} from 'lucide-react'
import {useMemo, useState} from 'react'
import {Button} from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {MonoText} from '@/components/ui/mono-text'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {StatusPill} from '@/components/ui/status-pill'
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip'
import {motion, slideInUp} from '@/lib/motion'
import {api} from '@/services/tauri-api'
import {useAppStore} from '@/store/useAppStore'
import {describeError, notifyError, notifySuccess} from '@/store/useFeedbackStore'
import {LogConsole} from '@/components/common/LogConsole'
import type {BuildHistoryRecord} from '@/types/domain'
import {downloadTextFile, timestampSuffix, toCsv, withBom} from '@/utils/download'
import {classifyLogLine} from '@/utils/format'

const statusTone: Record<BuildHistoryRecord['status'], 'success' | 'error' | 'warning'> = {
  SUCCESS: 'success',
  FAILED: 'error',
  CANCELLED: 'warning',
}

const historyPath = (record: BuildHistoryRecord) => {
  if (!record.modulePath || record.modulePath.includes(',')) {
    return record.projectRoot
  }
  return targetPath(modulePath(record.projectRoot, record.modulePath))
}

const modulePath = (projectRoot: string, moduleRelativePath: string) => {
  const normalizedModulePath = moduleRelativePath.replace(/^\.?[\\/]/, '')
  return `${projectRoot}\\${normalizedModulePath}`
}

const targetPath = (basePath: string) => `${basePath}\\target`

const modulePaths = (record: BuildHistoryRecord) =>
  record.modulePath
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

const isMultiModuleRecord = (record: BuildHistoryRecord) => modulePaths(record).length > 1

type StatusFilter = 'all' | BuildHistoryRecord['status']

export function HistoryTable() {
  const history = useAppStore((state) => state.history)
  const buildStatus = useAppStore((state) => state.buildStatus)
  const rerunHistory = useAppStore((state) => state.rerunHistory)
  const rerunHistoryNow = useAppStore((state) => state.rerunHistoryNow)
  const deleteHistory = useAppStore((state) => state.deleteHistory)
  const [page, setPage] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [openRecord, setOpenRecord] = useState<BuildHistoryRecord | undefined>(undefined)
  const [deleteTarget, setDeleteTarget] = useState<BuildHistoryRecord | null>(null)
  const [rerunTarget, setRerunTarget] = useState<BuildHistoryRecord | null>(null)
  const [rerunning, setRerunning] = useState(false)
  const [logView, setLogView] = useState<{
    record: BuildHistoryRecord
    content?: string
    error?: string
  } | null>(null)
  const pageSize = expanded ? 20 : 12

  const toggleExpanded = (next: boolean) => {
    setExpanded(next)
    setPage(0)
  }

  const filteredHistory = useMemo(() => {
    const query = keyword.trim().toLowerCase()
    return history.filter((record) => {
      if (statusFilter !== 'all' && record.status !== statusFilter) return false
      if (!query) return true
      const label = record.moduleArtifactId ?? ''
      return (
        label.toLowerCase().includes(query) ||
        record.modulePath.toLowerCase().includes(query) ||
        record.command.toLowerCase().includes(query)
      )
    })
  }, [history, keyword, statusFilter])

  /** 打开历史构建日志：日志文件在构建时已落盘，这里按需读取 */
  const openLog = async (record: BuildHistoryRecord) => {
    if (!record.logPath) return
    setLogView({record})
    try {
      const content = await api.readTextFile(record.logPath)
      setLogView({record, content})
    } catch (error) {
      setLogView({record, error: describeError(error)})
    }
  }

  /** 导出当前筛选结果为 CSV（带 BOM，Excel 直接打开不乱码） */
  const exportCsv = () => {
    const rows: Array<Array<string | number>> = [
      ['构建时间', '结果', '项目路径', '模块', '命令', '耗时(秒)', '产物数'],
      ...filteredHistory.map((record) => [
        new Date(record.createdAt).toLocaleString(),
        record.status,
        record.projectRoot,
        record.moduleArtifactId ?? record.modulePath ?? '全部项目',
        record.command,
        (record.durationMs / 1000).toFixed(1),
        record.artifacts?.length ?? 0,
      ]),
    ]
    downloadTextFile(
      `packflow-history-${timestampSuffix()}.csv`,
      withBom(toCsv(rows)),
      'text/csv;charset=utf-8',
    )
    notifySuccess(`已导出 ${filteredHistory.length} 条历史记录`)
  }

  const pageCount = Math.max(1, Math.ceil(filteredHistory.length / pageSize))
  const currentPage = Math.min(page, pageCount - 1)
  const pageRecords = filteredHistory.slice(currentPage * pageSize, currentPage * pageSize + pageSize)

  const handleOpen = (record: BuildHistoryRecord) => {
    if (isMultiModuleRecord(record)) {
      setOpenRecord(record)
      return
    }
    void api.openPathInExplorer(historyPath(record)).catch((error) => {
      notifyError('打开目录失败', describeError(error))
    })
  }

  const handleCopyCommand = async (record: BuildHistoryRecord) => {
    try {
      await navigator.clipboard?.writeText(record.command)
      notifySuccess('已复制命令')
    } catch (error) {
      notifyError('复制命令失败', describeError(error))
    }
  }

  const confirmRerun = async () => {
    if (!rerunTarget) return
    setRerunning(true)
    try {
      await rerunHistoryNow(rerunTarget)
      setRerunTarget(null)
    } catch (error) {
      notifyError('重跑失败', describeError(error))
    } finally {
      setRerunning(false)
    }
  }

  const renderTable = () => (
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] table-fixed border-collapse text-[13px]">
          <colgroup>
            <col className="w-[170px]" />
            <col className="w-[170px]" />
            <col className="w-[110px]" />
            <col className="w-[90px]" />
            <col className="w-[90px]" />
            <col className="w-[200px]" />
          </colgroup>
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--muted)] text-left text-[12px] font-medium text-[var(--muted-foreground)]">
              <th className="px-3 py-2">时间</th>
              <th className="px-3 py-2">模块</th>
              <th className="px-3 py-2">结果</th>
              <th className="px-3 py-2">耗时</th>
              <th className="px-3 py-2">产物</th>
              <th className="px-3 py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {pageRecords.map((record) => {
              const artifacts = record.artifacts ?? []
              const moduleLabel = record.moduleArtifactId ?? (record.modulePath || '全部项目')
              return (
                <motion.tr
                  key={record.id}
                  className="border-b border-[var(--border)] transition-colors last:border-b-0 hover:bg-[var(--accent)]"
                  {...slideInUp}
                >
                  <td className="px-3 py-2 font-[family-name:var(--font-mono)] text-[12px] text-[var(--muted-foreground)]">
                    {new Date(record.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="max-w-full truncate text-[13px] text-[var(--foreground)] underline-offset-2 hover:underline"
                      title={`${moduleLabel}，点击打开目录`}
                      onClick={() => handleOpen(record)}
                    >
                      {moduleLabel}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill tone={statusTone[record.status]}>{record.status}</StatusPill>
                  </td>
                  <td className="px-3 py-2 font-[family-name:var(--font-mono)] text-[12px]">
                    {Math.round(record.durationMs / 1000)}s
                  </td>
                  <td className="px-3 py-2">
                    {artifacts.length === 0 ? (
                      <span className="text-[var(--muted-foreground)]">-</span>
                    ) : (
                      <button
                        type="button"
                        className="text-[13px] underline-offset-2 hover:underline"
                        onClick={() =>
                          void api.openPathInExplorer(artifacts[0].path).catch((error) => {
                            notifyError('打开目录失败', describeError(error))
                          })
                        }
                      >
                        {artifacts.length} 个
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-0.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="secondary"
                            size="iconSm"
                            disabled={buildStatus === 'RUNNING'}
                            aria-label="重跑（会清空当前日志）"
                            onClick={() => setRerunTarget(record)}
                          >
                            <RotateCcw />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>重跑（会清空当前日志与产物）</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="iconSm"
                            aria-label="载入参数"
                            onClick={() => {
                              rerunHistory(record)
                              notifySuccess('已载入该记录的构建参数')
                            }}
                          >
                            <RotateCcw className="opacity-60" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>仅载入参数，不执行构建</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="iconSm"
                            aria-label="复制命令"
                            onClick={() => void handleCopyCommand(record)}
                          >
                            <Copy />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>复制命令</TooltipContent>
                      </Tooltip>
                      {record.logPath ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="iconSm"
                              aria-label="查看构建日志"
                              onClick={() => void openLog(record)}
                            >
                              <ScrollText />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>查看构建日志</TooltipContent>
                        </Tooltip>
                      ) : null}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="iconSm"
                            aria-label="打开目录"
                            onClick={() => handleOpen(record)}
                          >
                            <FolderOpen />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>打开目录</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="iconSm"
                            className="text-[var(--error)]"
                            aria-label="删除"
                            onClick={() => setDeleteTarget(record)}
                          >
                            <Trash2 />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>删除</TooltipContent>
                      </Tooltip>
                    </div>
                  </td>
                </motion.tr>
              )
            })}
            {pageRecords.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-[var(--muted-foreground)]">
                  {history.length === 0 ? '暂无构建历史' : '没有匹配的记录'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {filteredHistory.length > pageSize ? (
        <div className="flex items-center justify-between border-t border-[var(--border)] px-3 py-2">
          <span className="text-[12px] text-[var(--muted-foreground)]">
            {filteredHistory.length} 条 · 第 {currentPage + 1}/{pageCount} 页
          </span>
          <div className="flex gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              上一页
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={currentPage >= pageCount - 1}
              onClick={() => setPage(currentPage + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-end gap-1.5">
        <Input
          className="h-8 w-full max-w-56"
          placeholder="搜索模块 / 命令"
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value)
            setPage(0)
          }}
        />
        <Select
          value={statusFilter}
          onValueChange={(value) => {
            setStatusFilter(value as StatusFilter)
            setPage(0)
          }}
        >
          <SelectTrigger className="h-8 w-[110px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部结果</SelectItem>
            <SelectItem value="SUCCESS">成功</SelectItem>
            <SelectItem value="FAILED">失败</SelectItem>
            <SelectItem value="CANCELLED">已停止</SelectItem>
          </SelectContent>
        </Select>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="secondary"
              size="iconSm"
              aria-label="导出当前筛选结果"
              disabled={filteredHistory.length === 0}
              onClick={exportCsv}
            >
              <Download />
            </Button>
          </TooltipTrigger>
          <TooltipContent>导出当前筛选结果（CSV）</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="secondary" size="iconSm" aria-label="放大查看" onClick={() => toggleExpanded(true)}>
              <Maximize2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>放大查看</TooltipContent>
        </Tooltip>
      </div>
      {renderTable()}

      <Dialog open={expanded} onOpenChange={toggleExpanded}>
        <DialogContent className="max-h-[88vh] max-w-[88vw] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>历史记录</DialogTitle>
          </DialogHeader>
          <div className="px-1 pb-2">{renderTable()}</div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(openRecord)} onOpenChange={(open) => !open && setOpenRecord(undefined)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>选择要打开的模块目录</DialogTitle>
          </DialogHeader>
          {openRecord ? (
            <div className="flex flex-col gap-3 px-5 py-2">
              <Button
                variant="secondary"
                size="sm"
                className="self-start gap-1.5"
                onClick={() =>
                  void api.openPathInExplorer(openRecord.projectRoot).catch((error) => {
                    notifyError('打开目录失败', describeError(error))
                  })
                }
              >
                <FolderOpen />
                打开项目根目录
              </Button>
              <ul className="m-0 list-none divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] p-0">
                {modulePaths(openRecord).map((path) => {
                  const fullPath = targetPath(modulePath(openRecord.projectRoot, path))
                  return (
                    <li key={path} className="flex items-center gap-2 px-3 py-2">
                      <MonoText className="min-w-0 flex-1 truncate text-[12px]">
                        {path}\target
                      </MonoText>
                      <Button
                        variant="ghost"
                        size="iconSm"
                        aria-label="打开目录"
                        onClick={() =>
                          void api.openPathInExplorer(fullPath).catch((error) => {
                            notifyError('打开目录失败', describeError(error))
                          })
                        }
                      >
                        <FolderOpen />
                      </Button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(rerunTarget)} onOpenChange={(open) => !open && setRerunTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>重跑这条构建记录？</DialogTitle>
          </DialogHeader>
          <p className="m-0 px-5 py-2 text-[13px] text-[var(--muted-foreground)]">
            将按记录的参数立即开始构建，当前日志与产物会被清空。
          </p>
          <DialogFooter>
            <Button variant="secondary" disabled={rerunning} onClick={() => setRerunTarget(null)}>
              取消
            </Button>
            <Button variant="primary" disabled={rerunning} onClick={() => void confirmRerun()}>
              {rerunning ? '启动中…' : '确认重跑'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(logView)} onOpenChange={(open) => !open && setLogView(null)}>
        <DialogContent className="flex h-[80vh] max-w-[88vw] flex-col p-0">
          <DialogHeader className="border-b border-[var(--border)] px-5 py-3">
            <DialogTitle>
              构建日志
              {logView ? ` · ${new Date(logView.record.createdAt).toLocaleString()}` : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 p-3">
            <LogConsole
              lines={(logView?.content ?? '').split('\n').filter((line) => line.length > 0)}
              classifyLine={classifyLogLine}
              emptyTitle={logView?.error ? '无法读取构建日志' : '正在读取构建日志…'}
              emptyDescription={logView?.error}
              keyPrefix="history-log"
              renderLimit={3000}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <p className="m-0 px-5 py-2 text-[13px]">删除后无法恢复，确认删除此构建记录？</p>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteTarget) void deleteHistory(deleteTarget.id)
                setDeleteTarget(null)
              }}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
