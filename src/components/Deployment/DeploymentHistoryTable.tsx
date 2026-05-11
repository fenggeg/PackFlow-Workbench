import {Button} from "@/components/ui/button"
import {Input} from "@/components/ui/input"
import {Dialog, DialogContent, DialogHeader, DialogTitle} from "@/components/ui/dialog"
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select"
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table"
import {Badge} from "@/components/ui/badge"
import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {Copy, Delete, Download, Maximize2, Play} from 'lucide-react'
import {useMemo, useRef, useState} from 'react'
import {LogConsole} from '../common/LogConsole'
import {summarizeDeploymentPipeline} from '../../services/deploymentRuntime'
import {useDeploymentLogStore} from '../../store/useDeploymentLogStore'
import {useWorkflowStore} from '../../store/useWorkflowStore'
import type {DeploymentStage, DeploymentTask, ProbeStatus} from '../../types/domain'

const statusLabel = (status: DeploymentTask['status']) => {
  switch (status) {
    case 'pending': return '等待中'
    case 'uploading': return '上传中'
    case 'stopping': return '停止中'
    case 'starting': return '执行中'
    case 'checking': return '检测中'
    case 'waiting': return '等待中'
    case 'success': return '成功'
    case 'failed': return '失败'
    case 'timeout': return '已超时'
    case 'cancelled': return '已取消'
    default: return status
  }
}

const statusBadgeVariant = (status: DeploymentTask['status']): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case 'success': return 'default'
    case 'failed':
    case 'timeout': return 'destructive'
    case 'cancelled': return 'secondary'
    default: return 'secondary'
  }
}

const stageStatusColor = (status: DeploymentStage['status']): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case 'success': return 'default'
    case 'failed':
    case 'timeout': return 'destructive'
    case 'cancelled': return 'secondary'
    case 'skipped': return 'outline'
    case 'running':
    case 'checking':
    case 'waiting':
      return 'secondary'
    default:
      return 'outline'
  }
}

const stageStatusLabel = (status: DeploymentStage['status']) => {
  switch (status) {
    case 'pending': return '等待中'
    case 'waiting': return '等待中'
    case 'running': return '执行中'
    case 'checking': return '检测中'
    case 'success': return '成功'
    case 'failed': return '失败'
    case 'skipped': return '已跳过'
    case 'timeout': return '已超时'
    case 'cancelled': return '已取消'
    default: return status
  }
}

const stepTypeLabel = (type?: string) => {
  switch (type) {
    case 'ssh_command': return 'SSH 命令'
    case 'wait': return '等待'
    case 'port_check': return '端口检测'
    case 'http_check': return 'HTTP 健康检查'
    case 'log_check': return '日志关键字检测'
    case 'upload_file': return '文件上传'
    case 'startup_probe': return '启动探针'
    default: return type ?? '-'
  }
}

const probeTypeLabel = (type: string) => {
  switch (type) {
    case 'process': return '进程探针'
    case 'port': return '端口探针'
    case 'http': return 'HTTP 探针'
    case 'log': return '日志探针'
    case 'timeout': return '超时'
    default: return type
  }
}

const probeStatusBadge = (status: string) => {
  switch (status) {
    case 'success': return <Badge variant="default" className="bg-green-500 hover:bg-green-600">成功</Badge>
    case 'failed': return <Badge variant="destructive">失败</Badge>
    case 'warning': return <Badge variant="secondary" className="bg-yellow-500 hover:bg-yellow-600 text-white">告警</Badge>
    case 'checking': return <Badge variant="secondary">检测中</Badge>
    default: return <Badge variant="outline">{status}</Badge>
  }
}

const formatDuration = (durationMs?: number) => {
  if (!durationMs) {
    return '-'
  }
  return durationMs >= 1000 ? `${(durationMs / 1000).toFixed(1)}s` : `${durationMs}ms`
}

const getFailureReason = (task: DeploymentTask) =>
  task.stages.find((stage) => ['failed', 'timeout', 'cancelled'].includes(stage.status))?.message
  ?? task.log.find((line) => /失败|错误|error|timeout|超时/i.test(line))
  ?? '-'

const classifyLine = (line: string) => {
  const lower = line.toLowerCase()
  if (lower.includes('部署完成') || lower.includes('已替换') || lower.includes('健康检查通过') || lower.includes('检测通过')) {
    return 'success'
  }
  if (lower.includes('停止')) {
    return 'warn'
  }
  if (lower.includes('失败') || lower.includes('错误') || lower.includes('error') || lower.includes('超时') || lower.includes('timeout')) {
    return 'error'
  }
  return ''
}

export function DeploymentHistoryTable() {
  const deploymentTasks = useWorkflowStore((state) => state.deploymentTasks)
  const deleteDeploymentTask = useWorkflowStore((state) => state.deleteDeploymentTask)
  const rerunDeployment = useWorkflowStore((state) => state.rerunDeployment)
  const [expanded, setExpanded] = useState(false)
  const [openTask, setOpenTask] = useState<DeploymentTask>()
  const [logKeyword, setLogKeyword] = useState('')
  const [logFilter, setLogFilter] = useState<'all' | 'error' | 'warn' | 'success'>('all')
  const [logExpanded, setLogExpanded] = useState(false)
  const logModalPanelRef = useRef<HTMLDivElement>(null)
  const openTaskBufferedLogs = useDeploymentLogStore(
    (state) => openTask ? state.logsByTaskId[openTask.id] : undefined,
  )

  const openTaskLogs = useMemo(
    () => openTask ? (openTaskBufferedLogs ?? openTask.log ?? []) : [],
    [openTask, openTaskBufferedLogs],
  )
  const logKeywordValue = logKeyword.trim().toLowerCase()
  const filteredLogs = useMemo(() => openTaskLogs.filter((line) => {
    if (logFilter !== 'all' && classifyLine(line) !== logFilter) return false
    if (logKeywordValue && !line.toLowerCase().includes(logKeywordValue)) return false
    return true
  }), [logFilter, logKeywordValue, openTaskLogs])

  const table = (large = false) => (
    <Table className="deployment-history-table">
      <TableHeader>
        <TableRow>
          <TableHead className="w-[150px]">时间</TableHead>
          <TableHead className="w-[280px]">部署对象</TableHead>
          <TableHead className="w-[96px]">状态</TableHead>
          <TableHead className="w-[138px]">流程进度</TableHead>
          <TableHead className="w-[132px]">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {deploymentTasks.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
              暂无部署记录
            </TableCell>
          </TableRow>
        ) : (
          deploymentTasks.slice(0, large ? 12 : 6).map((task) => {
            const progress = summarizeDeploymentPipeline(task.stages)
            return (
              <TableRow key={task.id}>
                <TableCell>{new Date(task.createdAt).toLocaleString()}</TableCell>
                <TableCell>
                  <div className="artifact-item deployment-history-object">
                    <span className="font-medium truncate block" title={task.deploymentProfileName ?? task.deploymentProfileId}>
                      {task.deploymentProfileName ?? task.deploymentProfileId}
                    </span>
                    <span className="text-muted-foreground text-sm truncate block" title={task.artifactName}>
                      {task.serverName ?? task.serverId} · {task.artifactName}
                    </span>
                    {task.status === 'failed' || task.status === 'timeout' || task.status === 'cancelled' ? (
                      <span className="text-destructive text-sm truncate block" title={getFailureReason(task)}>
                        {getFailureReason(task)}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={statusBadgeVariant(task.status)}>{statusLabel(task.status)}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-0.5 w-full">
                    <div className="w-full bg-secondary rounded-full h-1.5">
                      <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${progress.percent}%` }} />
                    </div>
                    <span className="text-muted-foreground text-xs">{progress.done}/{progress.total} 个步骤完成</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 deployment-history-actions">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="default" onClick={() => void rerunDeployment(task)}>
                          <Play className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>重跑部署</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="ghost" onClick={() => { setOpenTask(task); setLogKeyword('') }}>
                          <Maximize2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>详情</TooltipContent>
                    </Tooltip>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                              <Delete className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>删除</TooltipContent>
                        </Tooltip>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>删除部署记录？</AlertDialogTitle>
                          <AlertDialogDescription>确定要删除这条部署记录吗？</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>取消</AlertDialogCancel>
                          <AlertDialogAction onClick={() => void deleteDeploymentTask(task.id)}>删除</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            )
          })
        )}
      </TableBody>
    </Table>
  )

  return (
    <>
      <div className="table-toolbar">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button aria-label="放大查看部署记录" variant="ghost" size="sm" onClick={() => setExpanded(true)}>
              <Maximize2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>放大查看</TooltipContent>
        </Tooltip>
      </div>
      {table()}
      <Dialog open={expanded} onOpenChange={(open) => { if (!open) setExpanded(false) }}>
        <DialogContent className="max-w-[88vw]">
          <DialogHeader>
            <DialogTitle>部署记录</DialogTitle>
          </DialogHeader>
          {table(true)}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(openTask)} onOpenChange={(open) => { if (!open) setOpenTask(undefined) }}>
        <DialogContent className="max-w-[900px]">
          <DialogHeader>
            <DialogTitle>{openTask ? `部署详情 · ${openTask.deploymentProfileName ?? openTask.id}` : '部署详情'}</DialogTitle>
          </DialogHeader>
          {openTask ? (
            <>
              <dl className="grid grid-cols-2 gap-2 text-sm border rounded-md p-3">
                <div>
                  <dt className="text-muted-foreground">状态</dt>
                  <dd><Badge variant={statusBadgeVariant(openTask.status)}>{statusLabel(openTask.status)}</Badge></dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">服务器</dt>
                  <dd>{openTask.serverName ?? '-'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">部署配置</dt>
                  <dd>{openTask.deploymentProfileName ?? '-'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">模块</dt>
                  <dd>{openTask.moduleId}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted-foreground">产物</dt>
                  <dd>{openTask.artifactPath}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted-foreground">失败原因</dt>
                  <dd>{['failed', 'timeout', 'cancelled'].includes(openTask.status) ? getFailureReason(openTask) : '-'}</dd>
                </div>
                {openTask.probeResult ? (
                  <div className="col-span-2">
                    <dt className="text-muted-foreground">探针结果</dt>
                    <dd><Badge variant={openTask.status === 'success' ? 'default' : 'destructive'}>{openTask.probeResult}</Badge></dd>
                  </div>
                ) : null}
                {openTask.backupPath ? (
                  <div className="col-span-2">
                    <dt className="text-muted-foreground">备份路径</dt>
                    <dd>{openTask.backupPath}</dd>
                  </div>
                ) : null}
                {openTask.rollbackResult ? (
                  <div className="col-span-2">
                    <dt className="text-muted-foreground">回滚结果</dt>
                    <dd className="flex flex-wrap gap-2 items-center">
                      <Badge variant={openTask.rollbackResult.success ? 'default' : 'destructive'}>
                        {openTask.rollbackResult.success ? '回滚成功' : '回滚失败'}
                      </Badge>
                      {openTask.rollbackResult.message ? <span className="text-muted-foreground">{openTask.rollbackResult.message}</span> : null}
                      {openTask.rollbackResult.restoredBackupPath ? <span className="text-muted-foreground">恢复自: {openTask.rollbackResult.restoredBackupPath}</span> : null}
                      {openTask.rollbackResult.restartedOldVersion ? <Badge variant="secondary">已重启旧版本</Badge> : null}
                    </dd>
                  </div>
                ) : null}
              </dl>
              <Table className="deployment-history-table">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">阶段</TableHead>
                    <TableHead className="w-[130px]">类型</TableHead>
                    <TableHead className="w-[100px]">状态</TableHead>
                    <TableHead className="w-[90px]">耗时</TableHead>
                    <TableHead className="w-[90px]">重试</TableHead>
                    <TableHead className="w-[290px]">结果</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {openTask.stages.map((stage) => (
                    <TableRow key={stage.key}>
                      <TableCell>{stage.label}</TableCell>
                      <TableCell>{stepTypeLabel(stage.type)}</TableCell>
                      <TableCell>
                        <Badge variant={stageStatusColor(stage.status)}>{stageStatusLabel(stage.status)}</Badge>
                      </TableCell>
                      <TableCell>{formatDuration(stage.durationMs)}</TableCell>
                      <TableCell>{stage.retryCount ? `${stage.currentRetry ?? 0}/${stage.retryCount}` : '-'}</TableCell>
                      <TableCell>
                        <div className="deployment-history-result">
                          <span>{stage.message ?? '-'}</span>
                          {stage.probeStatuses && stage.probeStatuses.length > 0 ? (
                            <div className="mt-1">
                              {stage.probeStatuses.map((ps: ProbeStatus, idx: number) => (
                                <div key={idx} className="text-xs leading-[18px]">
                                  {probeStatusBadge(ps.status)} {probeTypeLabel(ps.probeType)}
                                  {ps.message ? `：${ps.message}` : ''}
                                  {ps.checkCount ? ` (${ps.checkCount}次)` : ''}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex flex-wrap gap-2 items-center mt-4 mb-2">
                <Select value={logFilter} onValueChange={(value) => setLogFilter(value as 'all' | 'error' | 'warn' | 'success')}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部</SelectItem>
                    <SelectItem value="error">错误</SelectItem>
                    <SelectItem value="warn">告警</SelectItem>
                    <SelectItem value="success">成功</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="搜索日志"
                  className="w-[200px]"
                  value={logKeyword}
                  onChange={(event) => setLogKeyword(event.target.value)}
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="ghost" disabled={openTaskLogs.length === 0} onClick={() => void navigator.clipboard?.writeText(openTaskLogs.join('\n'))}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>复制日志</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="ghost" disabled={openTaskLogs.length === 0} onClick={() => {
                      const text = openTaskLogs.join('\n')
                      if (!text) return
                      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `deployment-${openTask?.id ?? 'log'}.txt`
                      a.click()
                      URL.revokeObjectURL(url)
                    }}>
                      <Download className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>下载日志</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="ghost" onClick={() => setLogExpanded(true)}>
                      <Maximize2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>放大查看</TooltipContent>
                </Tooltip>
              </div>
              <LogConsole
                className="workflow-log-panel"
                lines={filteredLogs}
                classifyLine={classifyLine}
                emptyTitle="暂无部署日志"
                keyPrefix="history-deployment-log"
              />
              <Dialog open={logExpanded} onOpenChange={(open) => { if (!open) setLogExpanded(false) }}>
                <DialogContent className="max-w-[85vw]">
                  <DialogHeader>
                    <DialogTitle>部署日志 · {openTask.deploymentProfileName ?? openTask.id}</DialogTitle>
                  </DialogHeader>
                  <LogConsole
                    ref={logModalPanelRef}
                    className="log-panel log-panel-large"
                    lines={filteredLogs}
                    classifyLine={classifyLine}
                    emptyTitle="暂无部署日志"
                    keyPrefix="history-deployment-log-modal"
                  />
                </DialogContent>
              </Dialog>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}