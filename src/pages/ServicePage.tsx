import {Cloud, Copy, Database, FileText, Maximize2, Rocket} from 'lucide-react'
import {Button} from "@/components/ui/button"
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card"
import {Input} from "@/components/ui/input"
import {Dialog, DialogContent, DialogHeader, DialogTitle} from "@/components/ui/dialog"
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table"
import {Badge} from "@/components/ui/badge"
import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip"
import {useMemo, useState} from 'react'
import {LogConsole} from '../components/common/LogConsole'
import {ServiceOperationButtons} from '../features/service-ops/components/ServiceOperationButtons'
import {ServiceOperationHistoryList} from '../features/service-ops/components/ServiceOperationHistoryList'
import {
  deriveRuntimeConfig,
  getEnvironmentId,
  runtimeConfigKey
} from '../features/service-ops/services/serviceRuntimeConfigService'
import {useServiceOperationStore} from '../features/service-ops/stores/serviceOperationStore'
import {belongsToProject, flattenModules, profileModuleLabel} from '../services/deploymentTopologyService'
import {useAppStore} from '../store/useAppStore'
import {useDeploymentLogStore} from '../store/useDeploymentLogStore'
import {useNavigationStore} from '../store/navigationStore'
import {useWorkflowStore} from '../store/useWorkflowStore'
import type {DeploymentTask} from '../types/domain'


const statusLabel = (status: DeploymentTask['status']) => {
  switch (status) {
    case 'pending': return '等待中'
    case 'uploading': return '上传中'
    case 'stopping': return '停止中'
    case 'starting': return '启动中'
    case 'checking': return '检查中'
    case 'waiting': return '等待中'
    case 'success': return '成功'
    case 'failed': return '失败'
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

const stageStatusLabel = (status: string) => {
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

const formatDuration = (durationMs?: number) => {
  if (!durationMs) {
    return '-'
  }
  return durationMs >= 1000 ? `${(durationMs / 1000).toFixed(1)}s` : `${durationMs}ms`
}

const classifyLine = (line: string) => {
  const lower = line.toLowerCase()
  if (lower.includes('部署完成') || lower.includes('已替换') || lower.includes('健康检查通过')) {
    return 'success'
  }
  if (lower.includes('停止')) {
    return 'warn'
  }
  if (lower.includes('失败') || lower.includes('错误') || lower.includes('error')) {
    return 'error'
  }
  return ''
}

export function ServicePage() {
  const project = useAppStore((state) => state.project)
  const modules = flattenModules(project?.modules ?? [])
  const deploymentProfiles = useWorkflowStore((state) => state.deploymentProfiles)
  const serverProfiles = useWorkflowStore((state) => state.serverProfiles)
  const deploymentTasks = useWorkflowStore((state) => state.deploymentTasks)
  const runtimeConfigs = useServiceOperationStore((state) => state.runtimeConfigs)
  const histories = useServiceOperationStore((state) => state.histories)
  const navigateToDeployment = useNavigationStore((state) => state.navigateToDeployment)
  const currentProjectDeploymentProfiles = useMemo(
    () => deploymentProfiles.filter((profile) =>
      profile.publishType !== 'frontend_static' && belongsToProject(profile, project?.rootPath)),
    [deploymentProfiles, project?.rootPath],
  )

  const [openTask, setOpenTask] = useState<DeploymentTask>()
  const [logKeyword, setLogKeyword] = useState('')
  const [logExpanded, setLogExpanded] = useState(false)
  const [serverKeyword, setServerKeyword] = useState('')
  const openTaskBufferedLogs = useDeploymentLogStore(
    (state) => openTask ? state.logsByTaskId[openTask.id] : undefined,
  )

  const latestTaskMap = useMemo(() => {
    const map = new Map<string, DeploymentTask>()
    for (const task of deploymentTasks) {
      const key = `${task.deploymentProfileId}:${task.serverId}`
      const existing = map.get(key)
      if (!existing || task.createdAt > existing.createdAt) {
        map.set(key, task)
      }
    }
    return map
  }, [deploymentTasks])

  const getLatestTask = (profileId: string, serverId: string) =>
    latestTaskMap.get(`${profileId}:${serverId}`)

  const getRuntimeConfig = (profileId: string, serverId: string, environmentId: string) =>
    runtimeConfigs.find((config) =>
      runtimeConfigKey(config.serviceMappingId, config.serverId, config.environmentId)
      === runtimeConfigKey(profileId, serverId, environmentId))

  const runningCount = deploymentTasks.filter(
    (t) => !['success', 'failed', 'cancelled'].includes(t.status)
  ).length

  const successCount = deploymentTasks.filter((t) => t.status === 'success').length
  const failedCount = deploymentTasks.filter((t) => t.status === 'failed').length

  const openTaskLogs = useMemo(
    () => openTask ? (openTaskBufferedLogs ?? openTask.log ?? []) : [],
    [openTask, openTaskBufferedLogs],
  )
  const logKeywordValue = logKeyword.trim().toLowerCase()
  const filteredLogs = useMemo(
    () => logKeywordValue
      ? openTaskLogs.filter((line) => line.toLowerCase().includes(logKeywordValue))
      : openTaskLogs,
    [logKeywordValue, openTaskLogs],
  )

  return (
    <main className="workspace-page">
      <div className="workspace-heading">
        <div>
          <h3 className="text-2xl font-semibold">服务运维</h3>
          <p className="text-muted-foreground">围绕后端服务映射、部署配置和服务器配置执行重启、日志查看与健康检查。</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <Badge variant="secondary"><Database className="h-3 w-3 mr-1" />服务 {currentProjectDeploymentProfiles.length}</Badge>
        <Badge variant="secondary"><Cloud className="h-3 w-3 mr-1" />服务器 {serverProfiles.length}</Badge>
        <Badge variant="default">运行中 {runningCount}</Badge>
        <Badge variant="default" className="bg-green-500 hover:bg-green-600">成功 {successCount}</Badge>
        <Badge variant="destructive">失败 {failedCount}</Badge>
      </div>

      {currentProjectDeploymentProfiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <p>暂无后端服务配置，请先在部署中心添加后端发布映射</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 w-full">
          {currentProjectDeploymentProfiles.map((profile) => {
            const moduleName = profileModuleLabel(modules, profile)
            return (
              <Card key={profile.id} className="panel-card">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">{profile.name}</CardTitle>
                      <Badge variant="outline">{moduleName}</Badge>
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="ghost" onClick={() => navigateToDeployment(profile.id)}>
                          <Rocket className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>去部署</TooltipContent>
                    </Tooltip>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-3">
                    <dl className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <dt className="text-muted-foreground">产物匹配</dt>
                        <dd>{profile.localArtifactPattern}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">远程目录</dt>
                        <dd>{profile.remoteDeployPath}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">部署流程</dt>
                        <dd>
                          {profile.deploymentSteps?.length
                            ? `${profile.deploymentSteps.filter((step) => step.enabled).length}/${profile.deploymentSteps.length} 个步骤启用`
                            : `${profile.customCommands.filter((c) => c.enabled).length} 条旧版命令启用`}
                        </dd>
                      </div>
                    </dl>
                  {serverProfiles.length === 0 ? (
                    <span className="text-muted-foreground">暂无服务器配置</span>
                  ) : (
                    <>
                      <Input
                        placeholder="搜索服务器名称、地址"
                        className="w-[260px] mb-2"
                        value={serverKeyword}
                        onChange={(event) => setServerKeyword(event.target.value)}
                      />
                      <Table className="overflow-x-auto">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[140px]">服务器</TableHead>
                            <TableHead className="w-[200px]">地址</TableHead>
                            <TableHead className="w-[110px]">状态</TableHead>
                            <TableHead className="w-[170px]">最近部署</TableHead>
                            <TableHead className="w-[160px]">产物</TableHead>
                            <TableHead className="w-[210px]">操作</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {serverProfiles
                            .filter((server) => {
                              const keyword = serverKeyword.trim().toLowerCase()
                              if (!keyword) return true
                              return [server.name, server.host, server.username, String(server.port)]
                                .filter(Boolean)
                                .some((value) => String(value).toLowerCase().includes(keyword))
                            })
                            .slice(0, 5)
                            .map((server) => {
                              const task = getLatestTask(profile.id, server.id)
                              return (
                                <TableRow key={server.id}>
                                  <TableCell>{server.name}</TableCell>
                                  <TableCell className="truncate max-w-[200px]">{server.username}@{server.host}:{server.port}</TableCell>
                                  <TableCell>
                                    {task ? (
                                      <Badge variant={task.status === 'success' ? 'default' : task.status === 'failed' ? 'destructive' : 'secondary'}>
                                        {statusLabel(task.status)}
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline">未部署</Badge>
                                    )}
                                  </TableCell>
                                  <TableCell>{task ? new Date(task.createdAt).toLocaleString() : <span className="text-muted-foreground">-</span>}</TableCell>
                                  <TableCell className="truncate max-w-[160px]">{task?.artifactName ?? '-'}</TableCell>
                                  <TableCell>
                                    <div className="flex flex-wrap gap-1.5">
                                      <ServiceOperationButtons
                                        profile={profile}
                                        server={server}
                                        config={deriveRuntimeConfig(profile, server, getRuntimeConfig(profile.id, server.id, getEnvironmentId(server)))}
                                        onDeploy={() => navigateToDeployment(profile.id)}
                                      />
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            disabled={!task}
                                            onClick={() => {
                                              if (task) {
                                                setOpenTask(task)
                                                setLogKeyword('')
                                              }
                                            }}
                                          >
                                            <FileText className="h-4 w-4" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>查看最近部署日志</TooltipContent>
                                      </Tooltip>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                        </TableBody>
                      </Table>
                    </>
                  )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={Boolean(openTask)} onOpenChange={(open) => { if (!open) setOpenTask(undefined) }}>
        <DialogContent className="max-w-[900px]">
          <DialogHeader>
            <DialogTitle>{openTask ? `部署日志 · ${openTask.deploymentProfileName ?? openTask.deploymentProfileId}` : '部署日志'}</DialogTitle>
          </DialogHeader>
        {openTask ? (
          <div className="flex flex-col gap-4 w-full">
            <dl className="grid grid-cols-2 gap-2 text-sm border rounded-md p-3">
              <div>
                <dt className="text-muted-foreground">状态</dt>
                <dd>
                  <Badge variant={openTask.status === 'success' ? 'default' : openTask.status === 'failed' ? 'destructive' : 'secondary'}>
                    {statusLabel(openTask.status)}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">服务器</dt>
                <dd>{openTask.serverName ?? openTask.serverId}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground">产物</dt>
                <dd>{openTask.artifactName}</dd>
              </div>
            </dl>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">阶段</TableHead>
                  <TableHead className="w-[120px]">类型</TableHead>
                  <TableHead className="w-[100px]">状态</TableHead>
                  <TableHead className="w-[90px]">耗时</TableHead>
                  <TableHead>结果</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {openTask.stages.map((stage) => (
                  <TableRow key={stage.key}>
                    <TableCell>{stage.label}</TableCell>
                    <TableCell>{stepTypeLabel(stage.type)}</TableCell>
                    <TableCell><Badge variant="outline">{stageStatusLabel(stage.status)}</Badge></TableCell>
                    <TableCell>{formatDuration(stage.durationMs)}</TableCell>
                    <TableCell>{stage.message ?? '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex flex-wrap gap-2 items-center">
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
              keyPrefix="service-deployment-log"
            />
            <Dialog open={logExpanded} onOpenChange={(open) => { if (!open) setLogExpanded(false) }}>
              <DialogContent className="max-w-[85vw]">
                <DialogHeader>
                  <DialogTitle>部署日志 · {openTask.deploymentProfileName ?? openTask.id}</DialogTitle>
                </DialogHeader>
                <LogConsole
                  className="log-panel log-panel-large"
                  lines={filteredLogs}
                  classifyLine={classifyLine}
                  emptyTitle="暂无部署日志"
                  keyPrefix="service-deployment-log-modal"
                />
              </DialogContent>
            </Dialog>
          </div>
        ) : null}
        </DialogContent>
      </Dialog>
      <Card className="panel-card mt-4">
        <CardHeader>
          <CardTitle>服务操作历史</CardTitle>
        </CardHeader>
        <CardContent>
          <ServiceOperationHistoryList items={histories} />
        </CardContent>
      </Card>
    </main>
  )
}
