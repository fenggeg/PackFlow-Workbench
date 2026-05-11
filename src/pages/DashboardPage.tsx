import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle,} from '@/components/ui/card'
import {AlertTriangle, Database, FileSearch, Play, RefreshCw, Rocket, Server,} from 'lucide-react'
import {useMemo} from 'react'
import {useAppStore} from '../store/useAppStore'
import {useNavigationStore} from '../store/navigationStore'
import {useReleaseStore} from '../store/useReleaseStore'
import {useWorkflowStore} from '../store/useWorkflowStore'

const releaseStatusMeta = (status: string) => {
  switch (status) {
    case 'success': return { label: '成功', className: 'bg-green-500 text-white' }
    case 'failed': return { label: '失败', className: 'bg-red-500 text-white' }
    case 'cancelled': return { label: '已取消', className: 'bg-secondary text-secondary-foreground' }
    case 'building': return { label: '构建中', className: 'bg-blue-500 text-white animate-pulse' }
    case 'deploying': return { label: '部署中', className: 'bg-blue-500 text-white animate-pulse' }
    case 'checking': return { label: '验证中', className: 'bg-blue-500 text-white animate-pulse' }
    default: return { label: '进行中', className: 'bg-blue-500 text-white' }
  }
}

const targetBindingMode = (targetServerId?: string, mode?: string) =>
  mode ?? (targetServerId ? 'fixed' : 'runtime')

export function DashboardPage() {
  const setActivePage = useNavigationStore((state) => state.setActivePage)
  const navigateToDeployment = useNavigationStore((state) => state.navigateToDeployment)
  const navigateToServerDetail = useNavigationStore((state) => state.navigateToServerDetail)
  const project = useAppStore((state) => state.project)
  const environment = useAppStore((state) => state.environment)
  const buildStatus = useAppStore((state) => state.buildStatus)
  const releaseTemplates = useReleaseStore((state) => state.templates)
  const releaseRecords = useReleaseStore((state) => state.records)
  const startRelease = useReleaseStore((state) => state.startRelease)
  const runningRelease = useReleaseStore((state) => state.running)
  const currentRelease = useReleaseStore((state) => state.currentRecord)
  const deploymentTask = useWorkflowStore((state) => state.currentDeploymentTask)
  const serverProfiles = useWorkflowStore((state) => state.serverProfiles)

  const favoriteTemplates = useMemo(() => releaseTemplates.slice(0, 5), [releaseTemplates])
  const recentRecords = useMemo(() => releaseRecords.slice(0, 6), [releaseRecords])
  const runningTasks = [
    buildStatus === 'RUNNING' ? 'Maven 构建正在运行' : undefined,
    runningRelease && currentRelease ? `发布任务：${currentRelease.moduleName}` : undefined,
    deploymentTask && !['success', 'failed', 'timeout', 'cancelled'].includes(deploymentTask.status)
      ? `部署任务：${deploymentTask.deploymentProfileName ?? deploymentTask.id}`
      : undefined,
  ].filter((item): item is string => Boolean(item))

  return (
    <main className="workspace-page">
      <div className="workspace-heading">
        <div>
          <h3 className="text-xl font-semibold">首页 Dashboard</h3>
          <p className="text-sm text-muted-foreground">围绕一键发布闭环聚合模板、历史、环境和正在运行的任务。</p>
        </div>
        <Button onClick={() => setActivePage('release')}>
          <Rocket className="mr-1.5 h-4 w-4" />
          一键发布
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">常用发布模板</CardTitle>
          </CardHeader>
          <CardContent>
            {favoriteTemplates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <p className="mb-3">暂无发布模板</p>
                <Button onClick={() => setActivePage('release')}>
                  <Rocket className="mr-1.5 h-4 w-4" />
                  创建发布模板
                </Button>
              </div>
            ) : (
              <div className="divide-y">
                {favoriteTemplates.map((template) => (
                  <div key={template.id ?? template.name} className="flex items-center justify-between py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{template.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {`${template.moduleName} → ${targetBindingMode(template.targetServerId, template.targetBindingMode) === 'runtime' ? '发布时选择服务器' : serverProfiles.find((server) => server.id === template.targetServerId)?.name ?? '目标服务器'} · ${template.remoteDeployDir}`}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      className="ml-3 shrink-0"
                      disabled={runningRelease && Boolean(template.targetServerId)}
                      onClick={() => {
                        if (targetBindingMode(template.targetServerId, template.targetBindingMode) === 'runtime') {
                          setActivePage('release')
                          return
                        }
                        void startRelease(template)
                      }}
                    >
                      <Play className="mr-1 h-3.5 w-3.5" />
                      {targetBindingMode(template.targetServerId, template.targetBindingMode) === 'runtime' ? '选择服务器' : '发布'}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">最近发布记录</CardTitle>
          </CardHeader>
          <CardContent>
            {recentRecords.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <p>暂无发布历史</p>
              </div>
            ) : (
              <div className="divide-y">
                {recentRecords.map((record) => {
                  const meta = releaseStatusMeta(record.status)
                  return (
                    <div key={record.id} className="py-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={meta.className}>{meta.label}</Badge>
                        <span className="text-sm">{record.moduleName}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {`${new Date(record.startedAt).toLocaleString()} · ${record.gitBranch ?? '未记录分支'} · ${record.failureSummary ?? record.artifactPath ?? '链路已记录'}`}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">当前环境状态</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2 text-sm">
              <span>项目：{project?.artifactId ?? '未选择'}</span>
              <span className="text-muted-foreground truncate" title={project?.rootPath}>
                {project?.rootPath ?? '选择项目后显示路径'}
              </span>
              <div className="flex flex-wrap gap-1.5">
                <Badge className={environment?.status === 'ok' ? 'bg-green-500 text-white' : environment?.status === 'error' ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'}>
                  {environment?.status === 'ok' ? '环境正常' : environment?.status === 'error' ? '环境异常' : '待检查'}
                </Badge>
                <Badge variant="secondary">JDK：{environment?.javaVersion ?? '未识别'}</Badge>
                <Badge variant="secondary">Maven：{environment?.mavenVersion ?? (environment?.hasMavenWrapper ? 'mvnw' : '未识别')}</Badge>
              </div>
              {environment?.errors?.length ? (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{environment.errors.join('；')}</span>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">正在运行任务</CardTitle>
          </CardHeader>
          <CardContent>
            {runningTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <p>当前没有运行中的构建、发布或部署任务</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {runningTasks.map((item) => (
                  <Badge key={item} className="bg-blue-500 text-white animate-pulse w-fit">{item}</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">快捷操作</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setActivePage('release')}>
                <Rocket className="mr-1.5 h-4 w-4" />
                一键发布
              </Button>
              <Button variant="outline" onClick={() => setActivePage('build')}>
                <Database className="mr-1.5 h-4 w-4" />
                仅打包
              </Button>
              <Button variant="outline" onClick={() => navigateToDeployment()}>
                <Server className="mr-1.5 h-4 w-4" />
                仅部署
              </Button>
              <Button variant="outline" onClick={() => setActivePage('servers')}>
                <FileSearch className="mr-1.5 h-4 w-4" />
                查看日志
              </Button>
              <Button
                variant="outline"
                disabled={serverProfiles.length === 0}
                onClick={() => {
                  const firstServer = serverProfiles[0]
                  if (firstServer) {
                    navigateToServerDetail(firstServer.id, 'commands')
                  }
                }}
              >
                <RefreshCw className="mr-1.5 h-4 w-4" />
                重启服务
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}