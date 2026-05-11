import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Dialog, DialogContent, DialogHeader, DialogTitle,} from '@/components/ui/dialog'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow,} from '@/components/ui/table'
import {Tooltip, TooltipContent, TooltipTrigger,} from '@/components/ui/tooltip'
import {Copy, FolderOpen, Maximize2, Play, Undo2} from 'lucide-react'
import {useState} from 'react'
import {api} from '../../services/tauri-api'
import {useAppStore} from '../../store/useAppStore'
import type {BuildHistoryRecord} from '../../types/domain'

const statusBadgeClass: Record<BuildHistoryRecord['status'], string> = {
  SUCCESS: 'bg-green-500 text-white',
  FAILED: 'bg-red-500 text-white',
  CANCELLED: 'bg-amber-500 text-white',
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

const isMultiModuleRecord = (record: BuildHistoryRecord) =>
  modulePaths(record).length > 1

export function HistoryTable() {
  const history = useAppStore((state) => state.history)
  const rerunHistory = useAppStore((state) => state.rerunHistory)
  const rerunHistoryNow = useAppStore((state) => state.rerunHistoryNow)
  const [expanded, setExpanded] = useState(false)
  const [openRecord, setOpenRecord] = useState<BuildHistoryRecord>()
  const [page, setPage] = useState(0)
  const [expandedPage, setExpandedPage] = useState(0)

  const handleOpen = (record: BuildHistoryRecord) => {
    if (isMultiModuleRecord(record)) {
      setOpenRecord(record)
      return
    }
    void api.openPathInExplorer(historyPath(record))
  }

  const renderTable = (large = false) => {
    const pageSize = large ? 12 : 6
    const currentPage = large ? expandedPage : page
    const setCurrentPage = large ? setExpandedPage : setPage
    const paged = history.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
    const totalPages = Math.ceil(history.length / pageSize)

    return (
      <div className="space-y-2">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[170px]">时间</TableHead>
                <TableHead className="min-w-[170px]">模块</TableHead>
                <TableHead className="w-[110px]">结果</TableHead>
                <TableHead className="w-[90px]">耗时</TableHead>
                <TableHead className="w-[90px]">产物</TableHead>
                <TableHead className="min-w-[160px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((record) => {
                const moduleLabel = record.moduleArtifactId ?? (record.modulePath || '全部项目')
                const artifacts = record.artifacts ?? []
                return (
                  <TableRow key={record.id}>
                    <TableCell>{new Date(record.createdAt).toLocaleString()}</TableCell>
                    <TableCell>
                      <button
                        className="text-sm text-primary underline underline-offset-2 hover:text-primary/80 truncate max-w-[150px] block"
                        title={`${moduleLabel}，点击打开目录`}
                        onClick={() => handleOpen(record)}
                      >
                        {moduleLabel}
                      </button>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusBadgeClass[record.status]}>{record.status}</Badge>
                    </TableCell>
                    <TableCell>{Math.round(record.durationMs / 1000)}s</TableCell>
                    <TableCell>
                      {artifacts.length === 0 ? (
                        <span className="text-sm text-muted-foreground">-</span>
                      ) : (
                        <button
                          className="text-sm text-primary underline underline-offset-2 hover:text-primary/80"
                          onClick={() => void api.openPathInExplorer(artifacts[0].path)}
                        >
                          {artifacts.length} 个
                        </button>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="icon" className="h-7 w-7" onClick={() => void rerunHistoryNow(record)}>
                              <Play className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>重跑</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => rerunHistory(record)}>
                              <Undo2 className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>恢复</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => void navigator.clipboard?.writeText(record.command)}>
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>复制命令</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => handleOpen(record)}>
                              <FolderOpen className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>打开目录</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 0}
              onClick={() => setCurrentPage((p) => p - 1)}
            >
              上一页
            </Button>
            <span className="text-sm text-muted-foreground">
              {currentPage + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages - 1}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              下一页
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="table-toolbar">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label="放大查看历史记录"
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setExpanded(true)}
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>放大查看</TooltipContent>
        </Tooltip>
      </div>
      {renderTable()}
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="w-[88vw] max-w-[88vw]">
          <DialogHeader>
            <DialogTitle>历史记录</DialogTitle>
          </DialogHeader>
          {renderTable(true)}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(openRecord)} onOpenChange={(open) => { if (!open) setOpenRecord(undefined) }}>
        <DialogContent className="max-w-[720px]">
          <DialogHeader>
            <DialogTitle>选择要打开的模块目录</DialogTitle>
          </DialogHeader>
          {openRecord ? (
            <div className="flex flex-col gap-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => void api.openPathInExplorer(openRecord.projectRoot)}>
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>打开项目根目录</TooltipContent>
              </Tooltip>
              <div className="border rounded-md divide-y">
                {modulePaths(openRecord).map((path) => {
                  const fullPath = targetPath(modulePath(openRecord.projectRoot, path))
                  return (
                    <div key={path} className="flex items-center justify-between px-3 py-2">
                      <span className="text-sm truncate path-text" title={fullPath}>
                        {path}\target
                      </span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            onClick={() => void api.openPathInExplorer(fullPath)}
                          >
                            <FolderOpen className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>打开目录</TooltipContent>
                      </Tooltip>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
