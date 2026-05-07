import {
    Alert,
    Button,
    Card,
    Checkbox,
    Col,
    Empty,
    Input,
    InputNumber,
    List,
    Modal,
    Popconfirm,
    Row,
    Select,
    Space,
    Steps,
    Table,
    Tabs,
    Tag,
    Typography,
} from 'antd'
import {
    DeleteOutlined,
    PlayCircleOutlined,
    ReloadOutlined,
    RocketOutlined,
    SaveOutlined,
    StopOutlined,
} from '@ant-design/icons'
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

const {Title, Text} = Typography

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
    case 'success': return {label: '成功', color: 'green'}
    case 'failed': return {label: '失败', color: 'red'}
    case 'cancelled': return {label: '已取消', color: 'default'}
    case 'prechecking': return {label: '预检中', color: 'processing'}
    case 'building': return {label: '构建中', color: 'processing'}
    case 'matching_artifact': return {label: '匹配产物', color: 'processing'}
    case 'deploying': return {label: '部署中', color: 'processing'}
    case 'checking': return {label: '健康检查', color: 'processing'}
    default: return {label: '等待', color: 'blue'}
  }
}

const stageStatus = (stage: ReleaseStageRecord) => {
  switch (stage.status) {
    case 'success': return 'finish'
    case 'failed':
    case 'cancelled':
      return 'error'
    case 'running':
      return 'process'
    default:
      return 'wait'
  }
}

const precheckColor = (status: string) => {
  switch (status) {
    case 'success': return 'green'
    case 'warning': return 'gold'
    case 'failed': return 'red'
    case 'running': return 'processing'
    default: return 'default'
  }
}

const splitText = (value: string) =>
  value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean)

const targetBindingMode = (template: ReleaseTemplate): ReleaseTargetBindingMode =>
  template.targetBindingMode ?? (template.targetServerId ? 'fixed' : 'runtime')

const normalizeProjectRoot = (value: string) =>
  value.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

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
      Modal.warning({
        title: '请选择服务映射',
        content: '发布模板需要引用部署中心已有服务映射，不会自动创建新的服务映射。',
        okText: '知道了',
      })
      setActiveStep(2)
      return
    }
    const saved = selectedTemplateId ? templateToSave : await saveTemplate(templateToSave)
    if (!saved) {
      return
    }
    const executableTemplate = createTemplateForExecution(saved)
    if (!executableTemplate) {
      Modal.warning({
        title: '请选择目标服务器',
        content: '当前发布模板设置为发布时选择服务器，请先在部署配置中选择本次发布的目标服务器。',
        okText: '知道了',
      })
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
      return <Empty description="发布开始后展示完整链路" image={Empty.PRESENTED_IMAGE_SIMPLE} />
    }
    const meta = releaseStatusMeta(record.status)
    return (
      <Space direction="vertical" size={12} style={{width: '100%'}}>
        <Space wrap>
          <Tag color={meta.color}>{meta.label}</Tag>
          <Text strong>{record.moduleName}</Text>
          <Text type="secondary">{record.gitBranch ?? '未记录分支'}</Text>
          {record.gitCommit ? <Tag>{record.gitCommit.slice(0, 8)}</Tag> : null}
        </Space>
        {record.failureSummary ? (
          <Alert type="error" showIcon message={`失败阶段：${record.failedStage ?? '未知'}`} description={record.failureSummary} />
        ) : null}
        <Steps
          direction="vertical"
          size="small"
          items={record.stages.map((stage) => ({
            title: stage.label,
            status: stageStatus(stage),
            description: stage.summary ?? (stage.durationMs ? `耗时 ${Math.round(stage.durationMs / 1000)} 秒` : undefined),
          }))}
        />
        <LogConsole
          lines={record.logs}
          emptyTitle="暂无发布日志"
          emptyDescription="发布开始后会持续写入构建、部署和验证日志。"
          keyPrefix={`release-${record.id}`}
        />
      </Space>
    )
  }

  return (
    <main className="workspace-page">
      <div className="workspace-heading">
        <div>
          <Title level={3}>发布向导</Title>
          <Text type="secondary">选择模块、构建、匹配产物、上传部署、启动验证并观察日志。</Text>
        </div>
        <Space wrap>
          <Button icon={<SaveOutlined />} onClick={() => void saveCurrentTemplate()}>
            保存模板
          </Button>
          <Button type="primary" icon={<RocketOutlined />} loading={running} onClick={() => void startCurrentRelease()}>
            开始发布
          </Button>
          <Button danger icon={<StopOutlined />} disabled={!running} loading={cancelling} onClick={() => void cancelRelease()}>
            取消发布
          </Button>
        </Space>
      </div>

      {error ? <Alert type="error" showIcon message={error} style={{marginBottom: 16}} /> : null}

      <Row gutter={[16, 16]}>
        <Col xs={24} xxl={7}>
          <Card title="发布模板" className="panel-card">
            <Space direction="vertical" size={12} style={{width: '100%'}}>
              <Select
                allowClear
                placeholder="选择已有发布模板"
                value={selectedTemplateId}
                options={releaseTemplates.map((template) => ({label: template.name, value: template.id}))}
                onChange={(value) => value ? applyTemplate(value) : setSelectedTemplateId(undefined)}
              />
              <Button
                block
                onClick={() => {
                  const moduleItem = project ? firstDeployableModule(project.modules) : undefined
                  setSelectedTemplateId(undefined)
                  setDraft(createDraft(project?.rootPath ?? '', moduleItem, buildOptions))
                }}
              >
                新建模板
              </Button>
              {releaseTemplates.length === 0 ? (
                <Empty description="暂无模板" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                <List
                  size="small"
                  dataSource={releaseTemplates.slice(0, 8)}
                  renderItem={(template) => (
                    <List.Item
                      actions={[
                        <Button key="apply" size="small" onClick={() => applyTemplate(template.id)}>使用</Button>,
                        <Popconfirm
                          key="delete"
                          title="删除该发布模板？"
                          okText="删除"
                          cancelText="取消"
                          onConfirm={() => void deleteTemplate(template.id)}
                        >
                          <Button size="small" danger type="text" icon={<DeleteOutlined />} />
                        </Popconfirm>,
                      ]}
                    >
                      <List.Item.Meta title={template.name} description={`${template.moduleName} · ${template.remoteDeployDir || '未配置目录'}`} />
                    </List.Item>
                  )}
                />
              )}
            </Space>
          </Card>
        </Col>

        <Col xs={24} xxl={17}>
          <Card className="panel-card">
            <Steps
              current={activeStep}
              onChange={setActiveStep}
              items={[
                {title: '项目模块'},
                {title: '构建环境'},
                {title: '部署配置'},
                {title: '验证日志'},
                {title: '发布预检'},
                {title: '执行进度'},
              ]}
              style={{marginBottom: 20}}
            />

            {activeStep === 0 ? (
              <Space direction="vertical" size={16} style={{width: '100%'}}>
                {!project ? (
                  <Alert
                    type="warning"
                    showIcon
                    message="请先选择 Maven 项目"
                    action={<Button type="primary" onClick={() => void chooseProject()}>选择项目</Button>}
                  />
                ) : null}
                <div className="step-card-body">
                  <div className="step-field step-field-full">
                    <Text type="secondary">模板名称</Text>
                    <Input value={draft.name} onChange={(event) => patchDraft({name: event.target.value})} />
                  </div>
                  <div className="step-field step-field-full">
                    <Text type="secondary">项目路径</Text>
                    <Input value={draft.projectPath} onChange={(event) => patchDraft({projectPath: event.target.value})} />
                  </div>
                  <div className="step-field">
                    <Text type="secondary">发布模块</Text>
                    <Select
                      value={draft.moduleId}
                      options={modules.map((moduleItem) => ({label: `${moduleItem.artifactId} · ${moduleItem.relativePath || '根模块'}`, value: moduleItem.id}))}
                      onChange={(moduleId) => {
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
                    />
                  </div>
                  <div className="step-field">
                    <Text type="secondary">产物匹配规则</Text>
                    <Input
                      disabled={Boolean(selectedDeploymentProfile)}
                      value={selectedDeploymentProfile?.localArtifactPattern ?? draft.artifactPattern}
                      onChange={(event) => patchDraft({artifactPattern: event.target.value})}
                      placeholder="先在部署中心服务映射中维护"
                    />
                  </div>
                </div>
              </Space>
            ) : null}

            {activeStep === 1 ? (
              <div className="step-card-body">
                <div className="step-field">
                  <Text type="secondary">环境方案</Text>
                  <Select
                    allowClear
                    placeholder="使用当前环境"
                    value={draft.environmentProfileId}
                    options={(environmentSettings?.profiles ?? []).map((profile) => ({label: profile.name, value: profile.id}))}
                    onChange={(environmentProfileId) => patchDraft({environmentProfileId})}
                  />
                </div>
                <div className="step-field">
                  <Text type="secondary">构建目标</Text>
                  <Input value={draft.buildOptions.goals.join(' ')} onChange={(event) => patchBuildOptions({goals: splitText(event.target.value)})} />
                </div>
                <div className="step-field">
                  <Text type="secondary">Profiles</Text>
                  <Input value={draft.buildOptions.profiles.join(',')} onChange={(event) => patchBuildOptions({profiles: splitText(event.target.value)})} />
                </div>
                <div className="step-field">
                  <Text type="secondary">自定义参数</Text>
                  <Input value={draft.buildOptions.customArgs.join(' ')} onChange={(event) => patchBuildOptions({customArgs: splitText(event.target.value)})} />
                </div>
                <div className="step-field">
                  <Checkbox checked={draft.buildOptions.skipTests} onChange={(event) => patchBuildOptions({skipTests: event.target.checked})}>
                    跳过测试
                  </Checkbox>
                </div>
                <div className="step-field">
                  <Checkbox checked={draft.buildOptions.alsoMake} onChange={(event) => patchBuildOptions({alsoMake: event.target.checked})}>
                    同时构建依赖模块
                  </Checkbox>
                </div>
                <div className="step-field">
                  <Checkbox checked={draft.preferMavenWrapper} onChange={(event) => patchDraft({preferMavenWrapper: event.target.checked})}>
                    优先使用 mvnw
                  </Checkbox>
                </div>
              </div>
            ) : null}

            {activeStep === 2 ? (
              <div className="step-card-body">
                <div className="step-field step-field-full">
                  <Text type="secondary">部署中心服务映射</Text>
                  <Select
                    placeholder="选择已有服务映射"
                    value={draft.deploymentProfileId}
                    options={currentProjectDeploymentProfiles.map((profile) => ({
                      label: `${profile.name} · ${profile.moduleArtifactId || profile.modulePath || '未绑定模块'} · ${profile.remoteDeployPath}`,
                      value: profile.id,
                    }))}
                    onChange={applyDeploymentProfile}
                    notFoundContent="当前项目暂无服务映射，请先到部署中心创建。"
                  />
                  <Text type="secondary" style={{fontSize: 12}}>
                    发布模板只引用这里的服务映射；远程目录、上传替换流程、启停命令、健康检查都继续在部署中心维护。
                  </Text>
                </div>
                {selectedDeploymentProfile ? (
                  <Alert
                    type="info"
                    showIcon
                    message={`已引用服务映射：${selectedDeploymentProfile.name}`}
                    description={`模块：${selectedDeploymentProfile.moduleArtifactId || selectedDeploymentProfile.modulePath || '-'}；远程目录：${selectedDeploymentProfile.remoteDeployPath || '-'}；产物规则：${selectedDeploymentProfile.localArtifactPattern || '*.jar'}；部署步骤：${selectedDeploymentProfile.deploymentSteps?.filter((step) => step.enabled).length ?? 0} 个`}
                  />
                ) : (
                  <Alert
                    type="warning"
                    showIcon
                    message="发布模板还没有引用服务映射"
                    description="请先在部署中心创建或选择已有服务映射。发布向导不会再自动创建服务映射。"
                  />
                )}
                <div className="step-field">
                  <Text type="secondary">服务器绑定方式</Text>
                  <Select
                    value={targetBindingMode(draft)}
                    options={[
                      {label: '发布时选择服务器', value: 'runtime'},
                      {label: '模板固定服务器', value: 'fixed'},
                    ]}
                    onChange={(value: ReleaseTargetBindingMode) => {
                      patchDraft({
                        targetBindingMode: value,
                        targetServerId: value === 'fixed' ? (draft.targetServerId || runtimeServerId || serverProfiles[0]?.id || '') : '',
                      })
                    }}
                  />
                </div>
                <div className="step-field">
                  <Text type="secondary">{targetBindingMode(draft) === 'fixed' ? '模板绑定服务器' : '本次发布服务器'}</Text>
                  <Select
                    allowClear={targetBindingMode(draft) === 'runtime'}
                    placeholder={targetBindingMode(draft) === 'fixed' ? '选择模板固定服务器' : '选择本次目标服务器'}
                    value={targetBindingMode(draft) === 'fixed' ? draft.targetServerId || undefined : runtimeServerId}
                    options={serverProfiles.map((server) => ({label: `${server.name} · ${server.username}@${server.host}:${server.port}`, value: server.id}))}
                    onChange={(targetServerId) => {
                      if (targetBindingMode(draft) === 'fixed') {
                        patchDraft({targetServerId})
                      } else {
                        setRuntimeServerId(targetServerId)
                      }
                    }}
                  />
                  <Text type="secondary" style={{fontSize: 12}}>
                    {targetBindingMode(draft) === 'fixed'
                      ? '适合固定环境或少量服务器，保存模板时会写入服务器。'
                      : '适合多服务器集群，模板只保存服务发布策略，服务器在每次发布时选择。'}
                  </Text>
                </div>
                <div className="step-field">
                  <Text type="secondary">远程部署目录</Text>
                  <Input disabled value={selectedDeploymentProfile?.remoteDeployPath ?? draft.remoteDeployDir} placeholder="来自服务映射" />
                </div>
              </div>
            ) : null}

            {activeStep === 3 ? (
              <div className="step-card-body">
                <Alert
                  type="info"
                  showIcon
                  message="健康检查和日志观察来自部署中心服务映射"
                  description="这里展示当前引用服务映射中的关键配置。需要调整探针、日志路径或部署步骤时，请到部署中心编辑服务映射。"
                />
                <div className="step-field">
                  <Checkbox
                    disabled
                    checked={selectedDeploymentProfile?.startupProbe?.enabled ?? draft.healthCheck?.enabled ?? false}
                  >
                    启用健康检查
                  </Checkbox>
                </div>
                <div className="step-field">
                  <Text type="secondary">检查超时（秒）</Text>
                  <InputNumber
                    disabled
                    min={10}
                    value={selectedDeploymentProfile?.startupProbe?.timeoutSeconds ?? draft.healthCheck?.timeoutSeconds ?? 120}
                  />
                </div>
                <div className="step-field">
                  <Text type="secondary">检查间隔（秒）</Text>
                  <InputNumber
                    disabled
                    min={1}
                    value={selectedDeploymentProfile?.startupProbe?.intervalSeconds ?? draft.healthCheck?.intervalSeconds ?? 3}
                  />
                </div>
                <div className="step-field">
                  <Text type="secondary">HTTP 健康地址</Text>
                  <Input
                    disabled
                    value={selectedDeploymentProfile?.startupProbe?.httpProbe?.url ?? draft.healthCheck?.httpProbe?.url ?? ''}
                    placeholder="http://127.0.0.1:8080/actuator/health"
                  />
                </div>
                <div className="step-field">
                  <Text type="secondary">日志路径</Text>
                  <Input disabled value={selectedDeploymentProfile?.logPath ?? draft.logConfig?.logPath ?? ''} />
                </div>
                <div className="step-field">
                  <Text type="secondary">观察行数</Text>
                  <InputNumber min={50} max={5000} value={draft.logConfig?.tailLines ?? 500} onChange={(value) => patchDraft({logConfig: {...(draft.logConfig ?? {logPath: ''}), tailLines: Number(value) || 500}})} />
                </div>
              </div>
            ) : null}

            {activeStep === 4 ? (
              <Space direction="vertical" size={12} style={{width: '100%'}}>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={() => {
                    const executableTemplate = createTemplateForExecution(createTemplateForSave())
                    if (!executableTemplate) {
                      Modal.warning({
                        title: '请选择目标服务器',
                        content: '发布预检需要知道本次要连接的目标服务器。',
                        okText: '知道了',
                      })
                      setActiveStep(2)
                      return
                    }
                    void runPrecheck(executableTemplate)
                  }}
                >
                  执行发布预检
                </Button>
                <List
                  dataSource={precheckItems}
                  renderItem={(item) => (
                    <List.Item>
                      <Space direction="vertical" size={2}>
                        <Space>
                          <Tag color={precheckColor(item.status)}>{item.status === 'success' ? '通过' : item.status === 'failed' ? '失败' : item.status === 'warning' ? '提醒' : item.status === 'running' ? '检查中' : '待检查'}</Tag>
                          <Text>{item.label}</Text>
                        </Space>
                        {item.message ? <Text type="secondary">{item.message}</Text> : null}
                      </Space>
                    </List.Item>
                  )}
                />
              </Space>
            ) : null}

            {activeStep === 5 ? renderProgressDetail(visibleRecord) : null}
          </Card>
        </Col>

        <Col span={24}>
          <Card title="发布历史" className="panel-card">
            <Tabs
              items={[
                {
                  key: 'records',
                  label: '完整链路',
                  children: (
                    <Table
                      rowKey="id"
                      size="small"
                      dataSource={releaseRecords}
                      columns={[
                        {
                          title: '状态',
                          dataIndex: 'status',
                          width: 96,
                          render: (status: string) => {
                            const meta = releaseStatusMeta(status)
                            return <Tag color={meta.color}>{meta.label}</Tag>
                          },
                        },
                        {title: '模块', dataIndex: 'moduleName'},
                        {title: '分支', dataIndex: 'gitBranch', render: (value?: string) => value ?? '-'},
                        {title: '开始时间', dataIndex: 'startedAt', render: (value: string) => new Date(value).toLocaleString()},
                        {title: '失败阶段', dataIndex: 'failedStage', render: (value?: string) => value ?? '-'},
                        {
                          title: '操作',
                          width: 220,
                          render: (_: unknown, record: ReleaseRecord) => (
                            <Space>
                              <Button size="small" onClick={() => { setSelectedRecord(record); setDetailOpen(true) }}>详情</Button>
                              <Button size="small" icon={<PlayCircleOutlined />} onClick={() => void rerunRelease(record)}>重跑</Button>
                            </Space>
                          ),
                        },
                      ]}
                    />
                  ),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Modal
        title="发布详情"
        open={detailOpen}
        width="min(980px, calc(100vw - 64px))"
        footer={null}
        onCancel={() => setDetailOpen(false)}
      >
        {renderProgressDetail(selectedRecord)}
      </Modal>
    </main>
  )
}
