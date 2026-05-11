import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {Badge} from "@/components/ui/badge"
import {Button} from "@/components/ui/button"
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card"
import {Checkbox} from "@/components/ui/checkbox"
import {Dialog, DialogContent, DialogHeader, DialogTitle} from "@/components/ui/dialog"
import {Input} from "@/components/ui/input"
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select"
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table"
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs"
import {Delete, Play, RefreshCw, Rocket, Save, Square} from 'lucide-react'
import {useEffect, useMemo, useState} from 'react'
import {LogConsole} from '../components/common/LogConsole'
import {createDefaultBuildOptions} from '../services/tauri-api'
import {useAppStore} from '../store/useAppStore'
import {useReleaseStore} from '../store/useReleaseStore'
import {useWorkflowStore} from '../store/useWorkflowStore'
import type {
  BuildOptions,
  MavenModule,
  ReleaseRecord,
  ReleaseStageRecord,
  ReleaseTargetBindingMode,
  ReleaseTemplate,
  StartupProbeConfig,
} from '../types/domain'

const defaultHealthCheck = (): StartupProbeConfig => ({
  enabled: true,
  timeoutSeconds: 120,
  intervalSeconds: 3,
  processProbe: {enabled: true},
  portProbe: {enabled: true, host: '127.0.0.1', port: 8080, consecutiveSuccesses: 2},
  httpProbe: {enabled: false, method: 'GET', consecutiveSuccesses: 2},
  logProbe: {
    enabled: true,
    logPath: '${logFile}',
    successPatterns: ['Started'],
    failurePatterns: [
      'APPLICATION FAILED TO START',
      'Application run failed',
      'Port already in use',
      'Web server failed to start',
      'BindException',
      'OutOfMemoryError',
    ],
    warningPatterns: ['Exception', 'ERROR'],
    useRegex: false,
    onlyCurrentDeployLog: true,
  },
  successPolicy: 'health_first',
})

const flattenModules = (modules: MavenModule[]): MavenModule[] =>
  modules.flatMap((moduleItem) => [moduleItem, ...flattenModules(moduleItem.children ?? [])])

const firstDeployableModule = (modules: MavenModule[]) =>
  flattenModules(modules).find((moduleItem) => moduleItem.packaging !== 'pom') ?? flattenModules(modules)[0]

const selectedModuleLabel = (moduleItem?: MavenModule) =>
  moduleItem?.artifactId ?? moduleItem?.name ?? '未选择模块'

const createDraft = (
  projectRoot = '',
  moduleItem?: MavenModule,
  buildOptions?: BuildOptions,
): ReleaseTemplate => ({
  id: crypto.randomUUID(),
  name: moduleItem ? `${moduleItem.artifactId} 发布模板` : '新发布模板',
  projectPath: projectRoot,
  moduleId: moduleItem?.id ?? '',
  moduleName: selectedModuleLabel(moduleItem),
  buildOptions: buildOptions
    ? {...buildOptions, selectedModulePath: moduleItem?.relativePath ?? buildOptions.selectedModulePath}
    : createDefaultBuildOptions(projectRoot, moduleItem?.relativePath ?? ''),
  environmentProfileId: undefined,
  preferMavenWrapper: false,
  artifactPattern: '*.jar',
  targetBindingMode: 'runtime',
  targetServerId: '',
  remoteDeployDir: '',
  stopCommand: '',
  startCommand: '',
  healthCheck: defaultHealthCheck(),
  logConfig: {logPath: '', tailLines: 500},
})

const releaseStatusMeta = (status: string) => {
  switch (status) {
    case 'success': return {label: '成功', variant: 'default' as const, className: 'bg-green-500 hover:bg-green-600'}
    case 'failed': return {label: '失败', variant: 'destructive' as const, className: ''}
    case 'cancelled': return {label: '已取消', variant: 'secondary' as const, className: ''}
    case 'prechecking': return {label: '预检中', variant: 'secondary' as const, className: ''}
    case 'building': return {label: '构建中', variant: 'secondary' as const, className: ''}
    case 'matching_artifact': return {label: '匹配产物', variant: 'secondary' as const, className: ''}
    case 'deploying': return {label: '部署中', variant: 'secondary' as const, className: ''}
    case 'checking': return {label: '健康检查', variant: 'secondary' as const, className: ''}
    default: return {label: '等待', variant: 'outline' as const, className: ''}
  }
}

const stageStatus = (stage: ReleaseStageRecord) => {
  switch (stage.status) {
    case 'success': return 'completed'
    case 'failed':
    case 'cancelled':
      return 'error'
    case 'running':
      return 'active'
    default:
      return 'pending'
  }
}

const precheckColor = (status: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case 'success': return 'default'
    case 'warning': return 'secondary'
    case 'failed': return 'destructive'
    case 'running': return 'secondary'
    default: return 'outline'
  }
}

const precheckLabel = (status: string) => {
  switch (status) {
    case 'success': return '通过'
    case 'failed': return '失败'
    case 'warning': return '提醒'
    case 'running': return '检查中'
    default: return '待检查'
  }
}

const splitText = (value: string) =>
  value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean)

const targetBindingMode = (template: ReleaseTemplate): ReleaseTargetBindingMode =>
  template.targetBindingMode ?? (template.targetServerId ? 'fixed' : 'runtime')

const normalizeProjectRoot = (value: string) =>
  value.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
const StepsComponent = ({ steps, current }: { steps: { title: string; status: string; description?: string }[]; current: number }) => (
  <div className="flex flex-col gap-0">
    {steps.map((step, idx) => {
      const isActive = idx === current
      const isCompleted = step.status === 'completed'
      const isError = step.status === 'error'
      return (
        <div key={idx} className="flex items-start gap-3">
          <div className="flex flex-col items-center">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium border ${
              isCompleted ? 'bg-green-500 text-white border-green-500' :
              isError ? 'bg-destructive text-destructive-foreground border-destructive' :
              isActive ? 'bg-primary text-primary-foreground border-primary' :
              'bg-muted text-muted-foreground border-border'
            }`}>
              {isCompleted ? '✓' : idx + 1}
            </div>
            {idx < steps.length - 1 && <div className={`w-0.5 h-6 ${isCompleted ? 'bg-green-500' : 'bg-border'}`} />}
          </div>
          <div className="pb-4">
            <p className={`text-sm font-medium ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>{step.title}</p>
            {step.description && <p className="text-xs text-muted-foreground">{step.description}</p>}
          </div>
        </div>
      )
    })}
  </div>
)

export function ReleasePage() {
  const project = useAppStore((state) => state.project)
  const buildOptions = useAppStore((state) => state.buildOptions)
  const chooseProject = useAppStore((state) => state.chooseProject)
  const environmentSettings = useAppStore((state) => state.environmentSettings)
  const serverProfiles = useWorkflowStore((state) => state.serverProfiles)
  const deploymentProfiles = useWorkflowStore((state) => state.deploymentProfiles)
  const releaseTemplates = useReleaseStore((state) => state.templates)
  const releaseRecords = useReleaseStore((state) => state.records)
  const currentRecord = useReleaseStore((state) => state.currentRecord)
  const precheckItems = useReleaseStore((state) => state.precheckItems)
  const running = useReleaseStore((state) => state.running)
  const cancelling = useReleaseStore((state) => state.cancelling)
  const error = useReleaseStore((state) => state.error)
  const saveTemplate = useReleaseStore((state) => state.saveTemplate)
  const deleteTemplate = useReleaseStore((state) => state.deleteTemplate)
  const runPrecheck = useReleaseStore((state) => state.runPrecheck)
  const startRelease = useReleaseStore((state) => state.startRelease)
  const rerunRelease = useReleaseStore((state) => state.rerunRelease)
  const cancelRelease = useReleaseStore((state) => state.cancelCurrentRelease)
  const [activeStep, setActiveStep] = useState(0)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>()
  const [draft, setDraft] = useState<ReleaseTemplate>(() => createDraft())
  const [runtimeServerId, setRuntimeServerId] = useState<string>()
  const [selectedRecord, setSelectedRecord] = useState<ReleaseRecord>()
  const [detailOpen, setDetailOpen] = useState(false)
  const [alertOpen, setAlertOpen] = useState(false)
  const [alertTitle, setAlertTitle] = useState("")
  const [alertMessage, setAlertMessage] = useState("")
  const showAlert = (title: string, message: string) => {
    setAlertTitle(title)
    setAlertMessage(message)
    setAlertOpen(true)
  }

  const modules = useMemo(() => flattenModules(project?.modules ?? []), [project?.modules])
  const currentProjectDeploymentProfiles = useMemo(
    () => deploymentProfiles.filter((profile) => normalizeProjectRoot(profile.projectRoot) === normalizeProjectRoot(draft.projectPath)),
    [deploymentProfiles, draft.projectPath],
  )
  const selectedDeploymentProfile = currentProjectDeploymentProfiles.find((profile) => profile.id === draft.deploymentProfileId)
  const selectedModule = modules.find((moduleItem) => moduleItem.id === draft.moduleId)
  const visibleRecord = currentRecord ?? selectedRecord

  useEffect(() => {
    if (!selectedTemplateId && project && !draft.projectPath) {
      const moduleItem = firstDeployableModule(project.modules)
      queueMicrotask(() => {
        setDraft(createDraft(project.rootPath, moduleItem, buildOptions))
      })
    }
  }, [buildOptions, draft.projectPath, project, selectedTemplateId, serverProfiles])

  const patchDraft = (patch: Partial<ReleaseTemplate>) => {
    setDraft((current) => ({...current, ...patch}))
  }

  const patchBuildOptions = (patch: Partial<BuildOptions>) => {
    setDraft((current) => ({
      ...current,
      buildOptions: {...current.buildOptions, ...patch},
    }))
  }
  const applyDeploymentProfile = (deploymentProfileId: string) => {
    const profile = currentProjectDeploymentProfiles.find((item) => item.id === deploymentProfileId)
    if (!profile) {
      patchDraft({deploymentProfileId})
      return
    }
    const moduleItem = modules.find((item) =>
      item.id === profile.moduleId || item.relativePath === profile.modulePath || item.artifactId === profile.moduleArtifactId)
    setDraft((current) => ({
      ...current,
      deploymentProfileId,
      moduleId: moduleItem?.id ?? profile.moduleId,
      moduleName: moduleItem?.artifactId ?? profile.moduleArtifactId,
      artifactPattern: profile.localArtifactPattern || current.artifactPattern,
      remoteDeployDir: profile.remoteDeployPath,
      healthCheck: profile.startupProbe ?? current.healthCheck,
      logConfig: {...(current.logConfig ?? {tailLines: 500}), logPath: profile.logPath ?? current.logConfig?.logPath ?? ''},
      buildOptions: {
        ...current.buildOptions,
        selectedModulePath: moduleItem?.relativePath ?? profile.modulePath,
      },
    }))
  }

  const applyTemplate = (templateId: string) => {
    const template = releaseTemplates.find((item) => item.id === templateId)
    if (!template) {
      return
    }
    setSelectedTemplateId(templateId)
    setDraft({...template, buildOptions: {...template.buildOptions}})
    setRuntimeServerId(template.targetBindingMode === 'runtime' ? undefined : template.targetServerId)
  }

  const createTemplateForSave = (): ReleaseTemplate => {
    const mode = targetBindingMode(draft)
    return {
      ...draft,
      targetBindingMode: mode,
      targetServerId: mode === 'fixed' ? draft.targetServerId : '',
      deploymentProfileId: selectedDeploymentProfile?.id ?? draft.deploymentProfileId,
      moduleId: selectedDeploymentProfile ? (selectedModule?.id ?? selectedDeploymentProfile.moduleId) : draft.moduleId,
      moduleName: selectedDeploymentProfile ? (selectedModule?.artifactId ?? selectedDeploymentProfile.moduleArtifactId) : selectedModuleLabel(selectedModule) || draft.moduleName,
      artifactPattern: selectedDeploymentProfile?.localArtifactPattern ?? draft.artifactPattern,
      remoteDeployDir: selectedDeploymentProfile?.remoteDeployPath ?? draft.remoteDeployDir,
      healthCheck: selectedDeploymentProfile?.startupProbe ?? draft.healthCheck,
      logConfig: selectedDeploymentProfile
        ? {...(draft.logConfig ?? {tailLines: 500}), logPath: selectedDeploymentProfile.logPath ?? draft.logConfig?.logPath ?? ''}
        : draft.logConfig,
      buildOptions: {
        ...draft.buildOptions,
        projectRoot: draft.projectPath,
        selectedModulePath: selectedDeploymentProfile?.modulePath ?? selectedModule?.relativePath ?? draft.buildOptions.selectedModulePath,
      },
    }
  }

  const createTemplateForExecution = (template: ReleaseTemplate): ReleaseTemplate | undefined => {
    const mode = targetBindingMode(template)
    const targetServerId = mode === 'fixed' ? template.targetServerId : runtimeServerId
    if (!targetServerId) {
      return undefined
    }
    return {
      ...template,
      targetBindingMode: mode,
      targetServerId,
    }
  }

  const saveCurrentTemplate = async () => {
    const saved = await saveTemplate(createTemplateForSave())
    if (saved) {
      setSelectedTemplateId(saved.id)
      setDraft(saved)
    }
  }

  const startCurrentRelease = async () => {
    const templateToSave = createTemplateForSave()
    if (!templateToSave.deploymentProfileId) {
      showAlert('缺少发布映射', '请选择发布映射：发布模板需要引用部署中心已有发布映射，不会自动创建新的发布映射。')
      setActiveStep(2)
      return
    }
    const saved = selectedTemplateId ? templateToSave : await saveTemplate(templateToSave)
    if (!saved) {
      return
    }
    const executableTemplate = createTemplateForExecution(saved)
    if (!executableTemplate) {
      showAlert('缺少目标服务器', '请选择目标服务器：当前发布模板设置为发布时选择服务器，请先在部署配置中选择本次发布的目标服务器。')
      setActiveStep(2)
      return
    }
    setSelectedTemplateId(saved.id)
    setDraft(saved)
    setActiveStep(5)
    await startRelease(executableTemplate)
  }
  const renderProgressDetail = (record?: ReleaseRecord) => {
    if (!record) {
      return (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <p>发布开始后展示完整链路</p>
        </div>
      )
    }
    const meta = releaseStatusMeta(record.status)
    return (
      <div className="flex flex-col gap-3 w-full">
        <div className="flex flex-wrap gap-2 items-center">
          <Badge variant={meta.variant} className={meta.className}>{meta.label}</Badge>
          <span className="font-medium">{record.moduleName}</span>
          <span className="text-muted-foreground">{record.gitBranch ?? '未记录分支'}</span>
          {record.gitCommit ? <Badge variant="outline">{record.gitCommit.slice(0, 8)}</Badge> : null}
        </div>
        {record.failureSummary ? (
          <div className="border border-destructive/50 bg-destructive/10 rounded-md p-3 text-sm">
            <p className="font-medium text-destructive">失败阶段：{record.failedStage ?? '未知'}</p>
            <p className="text-destructive/80">{record.failureSummary}</p>
          </div>
        ) : null}
        <StepsComponent
          steps={record.stages.map((stage) => ({
            title: stage.label,
            status: stageStatus(stage),
            description: stage.summary ?? (stage.durationMs ? `耗时 ${Math.round(stage.durationMs / 1000)} 秒` : undefined),
          }))}
          current={record.stages.findIndex((s) => stageStatus(s) === 'active')}
        />
        <LogConsole
          lines={record.logs}
          emptyTitle="暂无发布日志"
          emptyDescription="发布开始后会持续写入构建、部署和验证日志。"
          keyPrefix={`release-${record.id}`}
        />
      </div>
    )
  }
  return (
    <main className="workspace-page">
      <div className="workspace-heading">
        <div>
          <h3 className="text-2xl font-semibold">发布向导</h3>
          <p className="text-muted-foreground">选择模块、构建、匹配产物、上传部署、启动验证并观察日志。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void saveCurrentTemplate()}>
            <Save className="h-4 w-4 mr-2" />保存模板
          </Button>
          <Button disabled={running} onClick={() => void startCurrentRelease()}>
            <Rocket className="h-4 w-4 mr-2" />{running ? '发布中...' : '开始发布'}
          </Button>
          <Button variant="destructive" disabled={!running || cancelling} onClick={() => void cancelRelease()}>
            <Square className="h-4 w-4 mr-2" />取消发布
          </Button>
        </div>
      </div>

      {error ? (
        <div className="border border-destructive/50 bg-destructive/10 rounded-md p-3 text-sm text-destructive mb-4">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 xxl:grid-cols-[280px_1fr] gap-4">
        <Card className="panel-card">
          <CardHeader>
            <CardTitle>发布模板</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              <Select
                value={selectedTemplateId}
                onValueChange={(value) => value ? applyTemplate(value) : setSelectedTemplateId(undefined)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择已有发布模板" />
                </SelectTrigger>
                <SelectContent>
                  {releaseTemplates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  const moduleItem = project ? firstDeployableModule(project.modules) : undefined
                  setSelectedTemplateId(undefined)
                  setDraft(createDraft(project?.rootPath ?? '', moduleItem, buildOptions))
                }}
              >
                新建模板
              </Button>
              {releaseTemplates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-4 text-muted-foreground text-sm">
                  <p>暂无模板</p>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {releaseTemplates.slice(0, 8).map((template) => (
                    <div key={template.id} className="flex items-center justify-between p-2 border rounded-md text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{template.name}</p>
                        <p className="text-muted-foreground text-xs truncate">{template.moduleName} · {template.remoteDeployDir || '未配置目录'}</p>
                      </div>
                      <div className="flex gap-1 ml-2 shrink-0">
                        <Button size="sm" variant="ghost" onClick={() => applyTemplate(template.id)}>使用</Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                              <Delete className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>删除该发布模板？</AlertDialogTitle>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>取消</AlertDialogCancel>
                              <AlertDialogAction onClick={() => void deleteTemplate(template.id)}>删除</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="panel-card">
          <CardContent className="pt-6">
            <div className="flex gap-2 mb-5">
              {[0,1,2,3,4,5].map((i) => (
                <button key={i} className={`text-xs px-2 py-1 rounded ${activeStep === i ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`} onClick={() => setActiveStep(i)}>
                  {['项目模块','构建环境','部署配置','验证日志','发布预检','执行进度'][i]}
                </button>
              ))}
            </div>

            {activeStep === 0 ? (
              <div className="flex flex-col gap-4">
                {!project ? (
                  <div className="border border-yellow-500/50 bg-yellow-500/10 rounded-md p-3 text-sm flex items-center justify-between">
                    <span>请先选择 Maven 项目</span>
                    <Button size="sm" onClick={() => void chooseProject()}>选择项目</Button>
                  </div>
                ) : null}
                <div className="step-card-body">
                  <div className="step-field step-field-full">
                    <span className="text-muted-foreground text-sm">模板名称</span>
                    <Input value={draft.name} onChange={(event) => patchDraft({name: event.target.value})} />
                  </div>
                  <div className="step-field step-field-full">
                    <span className="text-muted-foreground text-sm">项目路径</span>
                    <Input value={draft.projectPath} onChange={(event) => patchDraft({projectPath: event.target.value})} />
                  </div>
                  <div className="step-field">
                    <span className="text-muted-foreground text-sm">发布模块</span>
                    <Select
                      value={draft.moduleId}
                      onValueChange={(moduleId) => {
                        const moduleItem = modules.find((item) => item.id === moduleId)
                        patchDraft({
                          moduleId,
                          moduleName: selectedModuleLabel(moduleItem),
                          buildOptions: {
                            ...draft.buildOptions,
                            selectedModulePath: moduleItem?.relativePath ?? '',
                          },
                        })
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {modules.map((moduleItem) => (
                          <SelectItem key={moduleItem.id} value={moduleItem.id}>{moduleItem.artifactId} · {moduleItem.relativePath || '根模块'}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="step-field">
                    <span className="text-muted-foreground text-sm">产物匹配规则</span>
                    <Input
                      disabled={Boolean(selectedDeploymentProfile)}
                      value={selectedDeploymentProfile?.localArtifactPattern ?? draft.artifactPattern}
                      onChange={(event) => patchDraft({artifactPattern: event.target.value})}
                      placeholder="先在部署中心发布映射中维护"
                    />
                  </div>
                </div>
              </div>
            ) : null}
            {activeStep === 1 ? (
              <div className="step-card-body">
                <div className="step-field">
                  <span className="text-muted-foreground text-sm">环境方案</span>
                  <Select
                    value={draft.environmentProfileId}
                    onValueChange={(environmentProfileId) => patchDraft({environmentProfileId})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="使用当前环境" />
                    </SelectTrigger>
                    <SelectContent>
                      {(environmentSettings?.profiles ?? []).map((profile) => (
                        <SelectItem key={profile.id} value={profile.id}>{profile.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="step-field">
                  <span className="text-muted-foreground text-sm">构建目标</span>
                  <Input value={draft.buildOptions.goals.join(' ')} onChange={(event) => patchBuildOptions({goals: splitText(event.target.value)})} />
                </div>
                <div className="step-field">
                  <span className="text-muted-foreground text-sm">Profiles</span>
                  <Input value={draft.buildOptions.profiles.join(',')} onChange={(event) => patchBuildOptions({profiles: splitText(event.target.value)})} />
                </div>
                <div className="step-field">
                  <span className="text-muted-foreground text-sm">自定义参数</span>
                  <Input value={draft.buildOptions.customArgs.join(' ')} onChange={(event) => patchBuildOptions({customArgs: splitText(event.target.value)})} />
                </div>
                <div className="step-field flex items-center gap-2">
                  <Checkbox checked={draft.buildOptions.skipTests} onCheckedChange={(checked) => patchBuildOptions({skipTests: !!checked})} />
                  <span className="text-sm">跳过测试</span>
                </div>
                <div className="step-field flex items-center gap-2">
                  <Checkbox checked={draft.buildOptions.alsoMake} onCheckedChange={(checked) => patchBuildOptions({alsoMake: !!checked})} />
                  <span className="text-sm">同时构建依赖模块</span>
                </div>
                <div className="step-field flex items-center gap-2">
                  <Checkbox checked={draft.preferMavenWrapper} onCheckedChange={(checked) => patchDraft({preferMavenWrapper: !!checked})} />
                  <span className="text-sm">优先使用 mvnw</span>
                </div>
              </div>
            ) : null}
            {activeStep === 2 ? (
              <div className="step-card-body">
                <div className="step-field step-field-full">
                  <span className="text-muted-foreground text-sm">部署中心发布映射</span>
                  <Select
                    value={draft.deploymentProfileId}
                    onValueChange={applyDeploymentProfile}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择已有发布映射" />
                    </SelectTrigger>
                    <SelectContent>
                      {currentProjectDeploymentProfiles.length === 0 ? (
                        <SelectItem value="__none" disabled>当前项目暂无发布映射，请先到部署中心创建。</SelectItem>
                      ) : (
                        currentProjectDeploymentProfiles.map((profile) => (
                          <SelectItem key={profile.id} value={profile.id}>{profile.name} · {profile.moduleArtifactId || profile.modulePath || '未绑定模块'} · {profile.remoteDeployPath}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    发布模板只引用这里的发布映射；远程目录、上传替换流程、启停命令、健康检查都继续在部署中心维护。
                  </p>
                </div>
                {selectedDeploymentProfile ? (
                  <div className="border border-blue-500/50 bg-blue-500/10 rounded-md p-3 text-sm">
                    <p className="font-medium">已引用发布映射：{selectedDeploymentProfile.name}</p>
                    <p className="text-muted-foreground">模块：{selectedDeploymentProfile.moduleArtifactId || selectedDeploymentProfile.modulePath || '-'}；远程目录：{selectedDeploymentProfile.remoteDeployPath || '-'}；产物规则：{selectedDeploymentProfile.localArtifactPattern || '*.jar'}；部署步骤：{selectedDeploymentProfile.deploymentSteps?.filter((step) => step.enabled).length ?? 0} 个</p>
                  </div>
                ) : (
                  <div className="border border-yellow-500/50 bg-yellow-500/10 rounded-md p-3 text-sm">
                    <p className="font-medium">发布模板还没有引用发布映射</p>
                    <p className="text-muted-foreground">请先在部署中心创建或选择已有发布映射。发布向导不会再自动创建发布映射。</p>
                  </div>
                )}
                <div className="step-field">
                  <span className="text-muted-foreground text-sm">服务器绑定方式</span>
                  <Select
                    value={targetBindingMode(draft)}
                    onValueChange={(value: string) => {
                      const mode = value as ReleaseTargetBindingMode
                      patchDraft({
                        targetBindingMode: mode,
                        targetServerId: mode === 'fixed' ? (draft.targetServerId || runtimeServerId || serverProfiles[0]?.id || '') : '',
                      })
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="runtime">发布时选择服务器</SelectItem>
                      <SelectItem value="fixed">模板固定服务器</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="step-field">
                  <span className="text-muted-foreground text-sm">{targetBindingMode(draft) === 'fixed' ? '模板绑定服务器' : '本次发布服务器'}</span>
                  <Select
                    value={targetBindingMode(draft) === 'fixed' ? draft.targetServerId || undefined : runtimeServerId}
                    onValueChange={(targetServerId) => {
                      if (targetBindingMode(draft) === 'fixed') {
                        patchDraft({targetServerId})
                      } else {
                        setRuntimeServerId(targetServerId)
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={targetBindingMode(draft) === 'fixed' ? '选择模板固定服务器' : '选择本次目标服务器'} />
                    </SelectTrigger>
                    <SelectContent>
                      {serverProfiles.map((server) => (
                        <SelectItem key={server.id} value={server.id}>{server.name} · {server.username}@{server.host}:{server.port}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {targetBindingMode(draft) === 'fixed'
                      ? '适合固定环境或少量服务器，保存模板时会写入服务器。'
                      : '适合多服务器集群，模板只保存服务发布策略，服务器在每次发布时选择。'}
                  </p>
                </div>
                <div className="step-field">
                  <span className="text-muted-foreground text-sm">远程部署目录</span>
                  <Input disabled value={selectedDeploymentProfile?.remoteDeployPath ?? draft.remoteDeployDir} placeholder="来自发布映射" />
                </div>
              </div>
            ) : null}
            {activeStep === 3 ? (
              <div className="step-card-body">
                <div className="border border-blue-500/50 bg-blue-500/10 rounded-md p-3 text-sm">
                  <p className="font-medium">健康检查和日志观察来自部署中心发布映射</p>
                  <p className="text-muted-foreground">这里展示当前引用发布映射中的关键配置。需要调整探针、日志路径或部署步骤时，请到部署中心编辑发布映射。</p>
                </div>
                <div className="step-field flex items-center gap-2">
                  <Checkbox disabled checked={selectedDeploymentProfile?.startupProbe?.enabled ?? draft.healthCheck?.enabled ?? false} />
                  <span className="text-sm">启用健康检查</span>
                </div>
                <div className="step-field">
                  <span className="text-muted-foreground text-sm">检查超时（秒）</span>
                  <Input disabled type="number" min={10} value={selectedDeploymentProfile?.startupProbe?.timeoutSeconds ?? draft.healthCheck?.timeoutSeconds ?? 120} />
                </div>
                <div className="step-field">
                  <span className="text-muted-foreground text-sm">检查间隔（秒）</span>
                  <Input disabled type="number" min={1} value={selectedDeploymentProfile?.startupProbe?.intervalSeconds ?? draft.healthCheck?.intervalSeconds ?? 3} />
                </div>
                <div className="step-field">
                  <span className="text-muted-foreground text-sm">HTTP 健康地址</span>
                  <Input disabled value={selectedDeploymentProfile?.startupProbe?.httpProbe?.url ?? draft.healthCheck?.httpProbe?.url ?? ''} placeholder="http://127.0.0.1:8080/actuator/health" />
                </div>
                <div className="step-field">
                  <span className="text-muted-foreground text-sm">日志路径</span>
                  <Input disabled value={selectedDeploymentProfile?.logPath ?? draft.logConfig?.logPath ?? ''} />
                </div>
                <div className="step-field">
                  <span className="text-muted-foreground text-sm">观察行数</span>
                  <Input type="number" min={50} max={5000} value={draft.logConfig?.tailLines ?? 500} onChange={(event) => patchDraft({logConfig: {...(draft.logConfig ?? {logPath: ''}), tailLines: Number(event.target.value) || 500}})} />
                </div>
              </div>
            ) : null}

            {activeStep === 4 ? (
              <div className="flex flex-col gap-3">
                <Button variant="outline" onClick={() => {
                  const executableTemplate = createTemplateForExecution(createTemplateForSave())
                  if (!executableTemplate) {
                  showAlert('缺少目标服务器', '请选择目标服务器：发布预检需要知道本次要连接的目标服务器。')
                  setActiveStep(2)
                    return
                  }
                  void runPrecheck(executableTemplate)
                }}>
                  <RefreshCw className="h-4 w-4 mr-2" />执行发布预检
                </Button>
                <div className="flex flex-col gap-1">
                  {precheckItems.map((item, idx) => (
                    <div key={idx} className="flex flex-col p-2 border rounded-md text-sm">
                      <div className="flex items-center gap-2">
                        <Badge variant={precheckColor(item.status)}>{precheckLabel(item.status)}</Badge>
                        <span>{item.label}</span>
                      </div>
                      {item.message ? <span className="text-muted-foreground text-xs mt-1">{item.message}</span> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {activeStep === 5 ? renderProgressDetail(visibleRecord) : null}
          </CardContent>
        </Card>

        <Card className="panel-card xxl:col-span-2">
          <CardHeader>
            <CardTitle>发布历史</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="records">
              <TabsList>
                <TabsTrigger value="records">完整链路</TabsTrigger>
              </TabsList>
              <TabsContent value="records">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[96px]">状态</TableHead>
                      <TableHead>模块</TableHead>
                      <TableHead>分支</TableHead>
                      <TableHead>开始时间</TableHead>
                      <TableHead>失败阶段</TableHead>
                      <TableHead className="w-[220px]">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {releaseRecords.map((record) => {
                      const meta = releaseStatusMeta(record.status)
                      return (
                        <TableRow key={record.id}>
                          <TableCell><Badge variant={meta.variant} className={meta.className}>{meta.label}</Badge></TableCell>
                          <TableCell>{record.moduleName}</TableCell>
                          <TableCell>{record.gitBranch ?? '-'}</TableCell>
                          <TableCell>{new Date(record.startedAt).toLocaleString()}</TableCell>
                          <TableCell>{record.failedStage ?? '-'}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button size="sm" variant="ghost" onClick={() => { setSelectedRecord(record); setDetailOpen(true) }}>详情</Button>
                              <Button size="sm" variant="ghost" onClick={() => void rerunRelease(record)}>
                                <Play className="h-4 w-4 mr-1" />重跑
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <Dialog open={detailOpen} onOpenChange={(open) => { if (!open) setDetailOpen(false) }}>
        <DialogContent className="max-w-[min(980px,calc(100vw-64px))]">
          <DialogHeader>
            <DialogTitle>发布详情</DialogTitle>
          </DialogHeader>
          {renderProgressDetail(selectedRecord)}
        </DialogContent>
      </Dialog>
    </main>
  )
}
