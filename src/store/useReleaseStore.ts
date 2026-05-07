import {create} from 'zustand'
import {api} from '../services/tauri-api'
import {appendBoundedItems} from '../utils/boundedBuffer'
import type {
    BuildArtifact,
    BuildEnvironment,
    BuildFinishedEvent,
    BuildHistoryRecord,
    BuildLogEvent,
    DeploymentLogEvent,
    DeploymentStage,
    DeploymentTask,
    MavenModule,
    MavenProject,
    ReleasePrecheckItem,
    ReleaseRecord,
    ReleaseStageRecord,
    ReleaseStatus,
    ReleaseTemplate,
} from '../types/domain'

interface ActiveReleaseContext {
  template: ReleaseTemplate
  project: MavenProject
  environment: BuildEnvironment
  command: string
  buildId?: string
  deploymentTaskId?: string
  startedAtMs: number
}

interface ReleaseState {
  templates: ReleaseTemplate[]
  records: ReleaseRecord[]
  currentRecord?: ReleaseRecord
  currentDeploymentTask?: DeploymentTask
  precheckItems: ReleasePrecheckItem[]
  loading: boolean
  running: boolean
  cancelling: boolean
  error?: string
  initialize: () => Promise<void>
  refresh: () => Promise<void>
  saveTemplate: (template: ReleaseTemplate) => Promise<ReleaseTemplate | undefined>
  deleteTemplate: (templateId: string) => Promise<void>
  deleteRecord: (recordId: string) => Promise<void>
  runPrecheck: (template: ReleaseTemplate) => Promise<ReleasePrecheckItem[]>
  startRelease: (template: ReleaseTemplate) => Promise<void>
  rerunRelease: (record: ReleaseRecord) => Promise<void>
  cancelCurrentRelease: () => Promise<void>
  handleBuildLog: (event: BuildLogEvent) => void
  handleBuildFinished: (event: BuildFinishedEvent) => void
  handleDeploymentLog: (event: DeploymentLogEvent) => void
  handleDeploymentUpdated: (task: DeploymentTask) => void
  handleDeploymentFinished: (task: DeploymentTask) => void
}

const releaseStages = (): ReleaseStageRecord[] => [
  {key: 'precheck', label: '发布预检', status: 'pending'},
  {key: 'build', label: '构建阶段', status: 'pending'},
  {key: 'artifact', label: '产物匹配', status: 'pending'},
  {key: 'deploy', label: '上传部署', status: 'pending'},
  {key: 'startup', label: '启动阶段', status: 'pending'},
  {key: 'health', label: '健康检查', status: 'pending'},
  {key: 'log', label: '日志观察', status: 'pending'},
]

const createPrecheckItems = (): ReleasePrecheckItem[] => [
  {key: 'maven_project', label: '校验 Maven 项目', status: 'pending'},
  {key: 'module', label: '校验模块', status: 'pending'},
  {key: 'environment', label: '校验 JDK / Maven / mvnw', status: 'pending'},
  {key: 'git', label: '校验 Git 状态', status: 'pending'},
  {key: 'ssh', label: '校验 SSH 连接', status: 'pending'},
  {key: 'remote_dir', label: '校验远程目录', status: 'pending'},
  {key: 'start_command', label: '校验启动命令', status: 'pending'},
  {key: 'health', label: '校验健康检查配置', status: 'pending'},
]

const terminalStatuses = new Set(['success', 'failed', 'cancelled'])

let activeContext: ActiveReleaseContext | undefined

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

const nowIso = () => new Date().toISOString()

const sortRecords = (records: ReleaseRecord[]) =>
  [...records].sort((left, right) => right.startedAt.localeCompare(left.startedAt))

const sortTemplates = (templates: ReleaseTemplate[]) =>
  [...templates].sort((left, right) =>
    (right.updatedAt ?? '').localeCompare(left.updatedAt ?? '')
      || left.name.localeCompare(right.name, 'zh-CN'))

const flattenModules = (modules: MavenModule[]): MavenModule[] =>
  modules.flatMap((moduleItem) => [moduleItem, ...flattenModules(moduleItem.children ?? [])])

const findModule = (project: MavenProject, template: ReleaseTemplate) =>
  flattenModules(project.modules).find((moduleItem) =>
    moduleItem.id === template.moduleId
      || moduleItem.relativePath === template.buildOptions.selectedModulePath
      || moduleItem.artifactId === template.moduleName)

const wildcardToRegExp = (pattern: string) =>
  new RegExp(`^${pattern
    .trim()
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')}$`, 'i')

const matchesArtifactPattern = (artifact: BuildArtifact, pattern: string) => {
  const trimmed = pattern.trim()
  if (!trimmed || trimmed === '*') {
    return true
  }
  return wildcardToRegExp(trimmed).test(artifact.fileName)
}

const markStage = (
  stages: ReleaseStageRecord[],
  key: string,
  status: ReleaseStageRecord['status'],
  summary?: string,
) => {
  const timestamp = nowIso()
  return stages.map((stage) => {
    if (stage.key !== key) {
      return stage
    }
    const startedAt = stage.startedAt ?? (status === 'running' ? timestamp : undefined)
    const endedAt = ['success', 'failed', 'cancelled', 'skipped'].includes(status) ? timestamp : undefined
    const startedTime = startedAt ? Date.parse(startedAt) : undefined
    const endedTime = endedAt ? Date.parse(endedAt) : undefined
    return {
      ...stage,
      status,
      startedAt,
      endedAt,
      durationMs: startedTime && endedTime ? endedTime - startedTime : stage.durationMs,
      summary: summary ?? stage.summary,
    }
  })
}

const updateRecord = async (
  set: (partial: Partial<ReleaseState> | ((state: ReleaseState) => Partial<ReleaseState>)) => void,
  updater: (record: ReleaseRecord) => ReleaseRecord,
) => {
  let nextRecord: ReleaseRecord | undefined
  set((state) => {
    if (!state.currentRecord) {
      return {}
    }
    nextRecord = updater(state.currentRecord)
    return {currentRecord: nextRecord}
  })
  if (nextRecord) {
    await api.saveReleaseRecord(nextRecord)
  }
}

const appendRecordLog = (
  record: ReleaseRecord,
  line: string,
  maxItems = 5000,
): ReleaseRecord => ({
  ...record,
  logs: appendBoundedItems(record.logs, [`${new Date().toLocaleTimeString()} ${line}`], maxItems),
})

const finishRecord = (
  record: ReleaseRecord,
  status: ReleaseStatus,
  failedStage?: string,
  failureSummary?: string,
): ReleaseRecord => {
  const endedAt = nowIso()
  return {
    ...record,
    status,
    endedAt,
    durationMs: Date.parse(endedAt) - Date.parse(record.startedAt),
    failedStage,
    failureSummary,
  }
}

const releaseStatusFromDeployment = (task: DeploymentTask): ReleaseStatus => {
  switch (task.status) {
    case 'uploading':
      return 'deploying'
    case 'starting':
      return 'starting'
    case 'checking':
    case 'waiting':
      return 'checking'
    case 'success':
      return 'observing_log'
    case 'failed':
    case 'timeout':
      return 'failed'
    case 'cancelled':
      return 'cancelled'
    default:
      return 'deploying'
  }
}

const stageKeyFromDeploymentStage = (stage: DeploymentStage) => {
  if (stage.type === 'upload_file' || stage.key.includes('upload')) {
    return 'deploy'
  }
  if (stage.type === 'http_check' || stage.type === 'port_check' || stage.type === 'log_check' || stage.key.includes('probe')) {
    return 'health'
  }
  if (stage.label.includes('启动')) {
    return 'startup'
  }
  return 'deploy'
}

const mergeDeploymentStages = (record: ReleaseRecord, task: DeploymentTask): ReleaseRecord => {
  let stages = record.stages
  for (const deploymentStage of task.stages) {
    const releaseKey = stageKeyFromDeploymentStage(deploymentStage)
    if (['running', 'checking', 'waiting'].includes(deploymentStage.status)) {
      stages = markStage(stages, releaseKey, 'running', deploymentStage.message)
    }
    if (deploymentStage.status === 'success') {
      stages = markStage(stages, releaseKey, 'success', deploymentStage.message)
    }
    if (['failed', 'timeout'].includes(deploymentStage.status)) {
      stages = markStage(stages, releaseKey, 'failed', deploymentStage.message)
    }
    if (deploymentStage.status === 'cancelled') {
      stages = markStage(stages, releaseKey, 'cancelled', deploymentStage.message)
    }
  }
  return {...record, stages, deploymentTaskId: task.id, status: releaseStatusFromDeployment(task)}
}

const loadDeploymentProfileForRelease = async (template: ReleaseTemplate) => {
  if (!template.deploymentProfileId) {
    throw new Error('发布模板未绑定部署中心服务映射，请先选择已有服务映射。')
  }
  const profiles = await api.listDeploymentProfiles()
  const profile = profiles.find((item) => item.id === template.deploymentProfileId)
  if (!profile) {
    throw new Error('发布模板绑定的服务映射不存在或已被删除。')
  }
  return profile
}

const artifactPatternForRelease = (template: ReleaseTemplate, profile: {localArtifactPattern: string}) =>
  template.artifactPattern?.trim() || profile.localArtifactPattern || '*.jar'

export const useReleaseStore = create<ReleaseState>((set, get) => ({
  templates: [],
  records: [],
  precheckItems: createPrecheckItems(),
  loading: false,
  running: false,
  cancelling: false,

  initialize: async () => {
    await get().refresh()
  },

  refresh: async () => {
    set({loading: true, error: undefined})
    try {
      const [templates, records] = await Promise.all([
        api.listReleaseTemplates(),
        api.listReleaseRecords(),
      ])
      set({templates: sortTemplates(templates), records: sortRecords(records)})
    } catch (error) {
      set({error: getErrorMessage(error)})
    } finally {
      set({loading: false})
    }
  },

  saveTemplate: async (template) => {
    try {
      const saved = await api.saveReleaseTemplate(template)
      set((state) => ({
        templates: sortTemplates([saved, ...state.templates.filter((item) => item.id !== saved.id)]),
      }))
      return saved
    } catch (error) {
      set({error: getErrorMessage(error)})
      return undefined
    }
  },

  deleteTemplate: async (templateId) => {
    try {
      await api.deleteReleaseTemplate(templateId)
      set((state) => ({templates: state.templates.filter((item) => item.id !== templateId)}))
    } catch (error) {
      set({error: getErrorMessage(error)})
    }
  },

  deleteRecord: async (recordId) => {
    try {
      await api.deleteReleaseRecord(recordId)
      set((state) => ({records: state.records.filter((item) => item.id !== recordId)}))
    } catch (error) {
      set({error: getErrorMessage(error)})
    }
  },

  runPrecheck: async (template) => {
    const items = createPrecheckItems()
    const updateItem = (key: string, status: ReleasePrecheckItem['status'], message?: string) => {
      const index = items.findIndex((item) => item.key === key)
      if (index >= 0) {
        items[index] = {...items[index], status, message}
        set({precheckItems: [...items]})
      }
    }
    set({precheckItems: items, error: undefined})

    let project: MavenProject | undefined
    let deploymentProfile: Awaited<ReturnType<typeof loadDeploymentProfileForRelease>> | undefined
    try {
      updateItem('maven_project', 'running')
      project = await api.parseMavenProject(template.projectPath)
      updateItem('maven_project', 'success', `项目 ${project.artifactId} 可解析`)
    } catch (error) {
      updateItem('maven_project', 'failed', getErrorMessage(error))
      return items
    }

    try {
      deploymentProfile = await loadDeploymentProfileForRelease(template)
    } catch (error) {
      updateItem('module', 'failed', getErrorMessage(error))
      return items
    }

    const moduleItem = findModule(project, template)
    if (moduleItem) {
      updateItem('module', 'success', `模块 ${moduleItem.artifactId} 已匹配`)
    } else {
      updateItem('module', 'failed', '模板绑定模块不在当前项目中。')
      return items
    }

    try {
      updateItem('environment', 'running')
      const environment = await api.detectEnvironment(template.projectPath)
      const envErrors = [...environment.errors]
      if (!environment.javaPath && !environment.javaHome) {
        envErrors.push('未找到 JDK')
      }
      if (template.preferMavenWrapper && !environment.hasMavenWrapper) {
        envErrors.push('模板要求优先使用 mvnw，但项目未检测到 Maven Wrapper')
      }
      if (!template.preferMavenWrapper && !environment.mavenPath && !environment.mavenHome && !environment.hasMavenWrapper) {
        envErrors.push('未找到 Maven 或 Maven Wrapper')
      }
      if (envErrors.length > 0) {
        updateItem('environment', 'failed', envErrors.join('；'))
        return items
      }
      updateItem('environment', 'success', environment.useMavenWrapper || template.preferMavenWrapper ? '将使用 mvnw' : 'JDK / Maven 可用')
    } catch (error) {
      updateItem('environment', 'failed', getErrorMessage(error))
      return items
    }

    try {
      updateItem('git', 'running')
      const gitStatus = await api.checkGitStatus(template.projectPath)
      if (!gitStatus.isGitRepo) {
        updateItem('git', 'warning', '当前目录不是 Git 仓库，发布记录不会包含分支和 commit。')
      } else if (gitStatus.hasLocalChanges) {
        updateItem('git', 'warning', '存在未提交变更，请确认这是预期状态。')
      } else {
        updateItem('git', 'success', gitStatus.branch ? `当前分支 ${gitStatus.branch}` : 'Git 状态正常')
      }
    } catch (error) {
      updateItem('git', 'warning', getErrorMessage(error))
    }

    try {
      updateItem('ssh', 'running')
      const message = await api.testServerConnection(template.targetServerId)
      updateItem('ssh', 'success', message)
    } catch (error) {
      updateItem('ssh', 'failed', getErrorMessage(error))
      return items
    }

    try {
      updateItem('remote_dir', 'running')
      const remoteDir = deploymentProfile.remoteDeployPath.trim()
      if (!remoteDir || remoteDir === '/') {
        updateItem('remote_dir', 'failed', '远程部署目录不能为空，也不能是根目录 /。')
        return items
      }
      const quoted = remoteDir.replace(/'/g, `'"'"'`)
      await api.executeRemoteCommand(template.targetServerId, `test -d '${quoted}' || mkdir -p '${quoted}'`)
      updateItem('remote_dir', 'success', remoteDir)
    } catch (error) {
      updateItem('remote_dir', 'failed', getErrorMessage(error))
      return items
    }

    if ((deploymentProfile.deploymentSteps?.length ?? 0) > 0 || (deploymentProfile.customCommands?.length ?? 0) > 0) {
      updateItem('start_command', 'success', '将使用部署中心服务映射中的部署流程')
    } else {
      updateItem('start_command', 'warning', '服务映射未配置自定义流程，将使用部署中心内置默认流程。')
    }

    const health = deploymentProfile.startupProbe
    if (!health || health.enabled === false) {
      updateItem('health', 'warning', '未启用健康检查，发布可以执行但无法确认服务真实可用。')
    } else {
      updateItem('health', 'success', `超时 ${health.timeoutSeconds}s，间隔 ${health.intervalSeconds}s`)
    }

    return items
  },

  startRelease: async (template) => {
    if (get().running) {
      set({error: '当前已有发布任务在执行，请先停止或等待完成。'})
      return
    }
    if (!template.targetServerId) {
      set({error: '当前发布模板未绑定服务器，请在发布向导中选择本次目标服务器。'})
      return
    }
    if (!template.deploymentProfileId) {
      set({error: '当前发布模板未绑定部署中心服务映射，请先选择已有服务映射。'})
      return
    }

    const startedAt = nowIso()
    const record: ReleaseRecord = {
      id: crypto.randomUUID(),
      projectName: template.projectPath.split(/[\\/]/).at(-1) ?? template.projectPath,
      projectPath: template.projectPath,
      moduleName: template.moduleName,
      targetServerId: template.targetServerId,
      status: 'prechecking',
      startedAt,
      templateId: template.id,
      stages: markStage(releaseStages(), 'precheck', 'running'),
      logs: [`${new Date().toLocaleTimeString()} 发布任务已创建：${template.name}`],
      artifacts: [],
    }
    set({currentRecord: record, currentDeploymentTask: undefined, running: true, cancelling: false, error: undefined})
    await api.saveReleaseRecord(record)

    const precheckItems = await get().runPrecheck(template)
    const failedPrecheck = precheckItems.find((item) => item.status === 'failed')
    if (failedPrecheck) {
      const failedRecord = finishRecord({
        ...record,
        stages: markStage(record.stages, 'precheck', 'failed', failedPrecheck.message),
      }, 'failed', '发布预检', failedPrecheck.message)
      set({currentRecord: failedRecord, records: sortRecords([failedRecord, ...get().records]), running: false})
      await api.saveReleaseRecord(failedRecord)
      return
    }

    try {
      const [project, environment, gitStatus, commits] = await Promise.all([
        api.parseMavenProject(template.projectPath),
        api.detectEnvironment(template.projectPath),
        api.checkGitStatus(template.projectPath).catch(() => undefined),
        api.listGitCommits(template.projectPath, 1).catch(() => []),
      ])
      const command = await api.buildCommandPreview({
        options: template.buildOptions,
        environment: {...environment, useMavenWrapper: template.preferMavenWrapper || environment.useMavenWrapper},
      })
      activeContext = {template, project, environment, command, startedAtMs: Date.now()}
      await updateRecord(set, (current) => ({
        ...appendRecordLog(current, `预检完成，开始构建：${command}`),
        gitBranch: gitStatus?.branch,
        gitCommit: commits[0]?.hash,
        status: 'building',
        stages: markStage(markStage(current.stages, 'precheck', 'success'), 'build', 'running'),
      }))
      const buildId = await api.startBuild({
        projectRoot: template.projectPath,
        command,
        modulePath: template.buildOptions.selectedModulePath,
        moduleArtifactId: template.moduleName,
        javaHome: environment.javaHome,
        mavenHome: environment.mavenHome,
        useMavenWrapper: template.preferMavenWrapper || environment.useMavenWrapper,
      })
      activeContext = {...activeContext, buildId}
      await updateRecord(set, (current) => ({...current, buildHistoryId: buildId}))
    } catch (error) {
      const message = getErrorMessage(error)
      const failed = finishRecord({
        ...appendRecordLog(get().currentRecord ?? record, `发布启动失败：${message}`),
        stages: markStage((get().currentRecord ?? record).stages, 'build', 'failed', message),
      }, 'failed', '构建阶段', message)
      set({currentRecord: failed, records: sortRecords([failed, ...get().records]), running: false})
      await api.saveReleaseRecord(failed)
      activeContext = undefined
    }
  },

  rerunRelease: async (record) => {
    const template = get().templates.find((item) => item.id === record.templateId)
    if (!template) {
      set({error: '未找到该发布记录关联的模板，无法一键重跑。'})
      return
    }
    await get().startRelease({...template, targetServerId: record.targetServerId})
  },

  cancelCurrentRelease: async () => {
    const record = get().currentRecord
    if (!record || terminalStatuses.has(record.status)) {
      return
    }
    set({cancelling: true})
    try {
      if (activeContext?.deploymentTaskId) {
        await api.cancelDeployment(activeContext.deploymentTaskId)
      } else if (activeContext?.buildId) {
        await api.cancelBuild(activeContext.buildId)
      }
      await updateRecord(set, (current) =>
        appendRecordLog({...current, status: 'cancelled'}, '已请求取消发布，等待当前阶段停止。'))
    } catch (error) {
      set({error: getErrorMessage(error)})
    } finally {
      set({cancelling: false})
    }
  },

  handleBuildLog: (event) => {
    if (!activeContext?.buildId || event.buildId !== activeContext.buildId) {
      return
    }
    void updateRecord(set, (record) => appendRecordLog(record, `[构建/${event.stream}] ${event.line}`))
  },

  handleBuildFinished: (event) => {
    if (!activeContext?.buildId || event.buildId !== activeContext.buildId) {
      return
    }

    void (async () => {
      const context = activeContext
      if (!context) {
        return
      }
      if (event.status !== 'SUCCESS') {
        const status = event.status === 'CANCELLED' ? 'cancelled' : 'failed'
        const failed = finishRecord({
          ...(get().currentRecord as ReleaseRecord),
          stages: markStage((get().currentRecord as ReleaseRecord).stages, 'build', status === 'cancelled' ? 'cancelled' : 'failed'),
        }, status, '构建阶段', event.status === 'CANCELLED' ? '构建已取消。' : '构建失败，请查看完整日志。')
        set({currentRecord: failed, records: sortRecords([failed, ...get().records]), running: false})
        await api.saveReleaseRecord(failed)
        activeContext = undefined
        return
      }

      await updateRecord(set, (record) => ({
        ...appendRecordLog(record, '构建成功，开始扫描产物。'),
        status: 'matching_artifact',
        stages: markStage(markStage(record.stages, 'build', 'success', `耗时 ${Math.round(event.durationMs / 1000)} 秒`), 'artifact', 'running'),
      }))
      const artifacts = await api.scanBuildArtifacts(context.template.projectPath, context.template.buildOptions.selectedModulePath)
      const deploymentProfile = await loadDeploymentProfileForRelease(context.template)
      const artifactPattern = artifactPatternForRelease(context.template, deploymentProfile)
      const artifact = artifacts.find((item) => matchesArtifactPattern(item, artifactPattern))
      const historyRecord: BuildHistoryRecord = {
        id: event.buildId,
        createdAt: nowIso(),
        projectRoot: context.template.projectPath,
        modulePath: context.template.buildOptions.selectedModulePath,
        moduleArtifactId: context.template.moduleName,
        command: context.command,
        status: event.status,
        durationMs: event.durationMs,
        javaHome: context.environment.javaHome,
        mavenHome: context.environment.mavenHome,
        useMavenWrapper: context.template.preferMavenWrapper || context.environment.useMavenWrapper,
        buildOptions: {...context.template.buildOptions, editableCommand: context.command},
        artifacts,
      }
      await api.saveBuildHistory(historyRecord)

      if (!artifact) {
        const failed = finishRecord({
          ...(get().currentRecord as ReleaseRecord),
          artifacts,
          stages: markStage((get().currentRecord as ReleaseRecord).stages, 'artifact', 'failed', `未匹配到 ${artifactPattern}`),
        }, 'failed', '产物匹配', `构建成功，但没有找到符合 ${artifactPattern} 的产物。`)
        set({currentRecord: failed, records: sortRecords([failed, ...get().records]), running: false})
        await api.saveReleaseRecord(failed)
        activeContext = undefined
        return
      }

      const deploymentTaskId = await api.startDeployment({
        deploymentProfileId: deploymentProfile.id,
        serverId: context.template.targetServerId,
        localArtifactPath: artifact.path,
        buildTaskId: event.buildId,
      })
      activeContext = {...context, deploymentTaskId}
      await updateRecord(set, (record) => ({
        ...appendRecordLog(record, `产物已匹配：${artifact.fileName}，开始上传部署。`),
        artifactPath: artifact.path,
        artifacts,
        deploymentTaskId,
        status: 'deploying',
        stages: markStage(markStage(record.stages, 'artifact', 'success', artifact.fileName), 'deploy', 'running'),
      }))
    })().catch(async (error) => {
      const message = getErrorMessage(error)
      const current = get().currentRecord
      if (!current) return
      const failed = finishRecord({
        ...appendRecordLog(current, `构建后处理失败：${message}`),
        stages: markStage(current.stages, 'artifact', 'failed', message),
      }, 'failed', '产物匹配', message)
      set({currentRecord: failed, records: sortRecords([failed, ...get().records]), running: false})
      await api.saveReleaseRecord(failed)
      activeContext = undefined
    })
  },

  handleDeploymentLog: (event) => {
    if (!activeContext?.deploymentTaskId || event.taskId !== activeContext.deploymentTaskId) {
      return
    }
    void updateRecord(set, (record) => appendRecordLog(record, `[部署] ${event.line}`))
  },

  handleDeploymentUpdated: (task) => {
    if (!activeContext?.deploymentTaskId || task.id !== activeContext.deploymentTaskId) {
      return
    }
    set({currentDeploymentTask: task})
    void updateRecord(set, (record) => mergeDeploymentStages(record, task))
  },

  handleDeploymentFinished: (task) => {
    if (!activeContext?.deploymentTaskId || task.id !== activeContext.deploymentTaskId) {
      return
    }
    void (async () => {
      const current = get().currentRecord
      if (!current) {
        return
      }
      const merged = mergeDeploymentStages(current, task)
      const success = task.status === 'success'
      const status: ReleaseStatus = success ? 'success' : task.status === 'cancelled' ? 'cancelled' : 'failed'
      const failedStage = success ? undefined : task.stages.find((stage) => ['failed', 'timeout', 'cancelled'].includes(stage.status))?.label ?? '上传部署'
      const failureSummary = success ? undefined : task.log.at(-1) ?? '部署失败，请查看完整日志。'
      const finalRecord = finishRecord({
        ...appendRecordLog(merged, success ? '发布完成，健康检查通过。' : `发布未完成：${failureSummary}`),
        stages: success
          ? markStage(markStage(markStage(merged.stages, 'deploy', 'success'), 'health', 'success'), 'log', 'success', '可在发布详情查看完整链路日志。')
          : merged.stages,
      }, status, failedStage, failureSummary)
      set({
        currentRecord: finalRecord,
        currentDeploymentTask: task,
        records: sortRecords([finalRecord, ...get().records.filter((item) => item.id !== finalRecord.id)]),
        running: false,
      })
      await api.saveReleaseRecord(finalRecord)
      activeContext = undefined
    })()
  },
}))
