import {
    Alert,
    Button,
    Card,
    Checkbox,
    Empty,
    Input,
    List,
    Popconfirm,
    Select,
    Space,
    Switch,
    Tag,
    Typography,
} from 'antd'
import {DeleteOutlined, PlayCircleOutlined, PlusOutlined, SaveOutlined,} from '@ant-design/icons'
import {useMemo, useState} from 'react'
import {useAppStore} from '../../store/useAppStore'
import {useWorkflowStore} from '../../store/useWorkflowStore'
import type {MavenModule, TaskPipeline, TaskStep, TaskStepType} from '../../types/domain'

const {Text, Title} = Typography

const flattenModules = (modules: MavenModule[]): MavenModule[] =>
  modules.flatMap((module) => [module, ...flattenModules(module.children ?? [])])

const splitArgs = (value: string) =>
  value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)

const createStep = (type: TaskStepType): TaskStep => ({
  id: crypto.randomUUID(),
  type,
  label: {
    maven_goal: 'Maven 构建',
    shell_command: 'Shell 命令',
    open_directory: '打开目录',
    notify: '通知',
  }[type],
  enabled: true,
  payload: {
    maven_goal: {
      goals: ['clean', 'package'],
      profiles: [],
      properties: {},
      alsoMake: true,
      skipTests: true,
      customArgs: [],
    },
    shell_command: {
      command: '',
      workingDirectory: '',
    },
    open_directory: {
      location: 'module_target',
      path: '',
    },
    notify: {
      title: '任务完成',
      message: '任务链已执行完成。',
    },
  }[type],
})

const createPipeline = (moduleIds: string[] = []): TaskPipeline => ({
  id: crypto.randomUUID(),
  name: '',
  moduleIds,
  steps: [createStep('maven_goal')],
})

export function TaskPipelinePanel() {
  const project = useAppStore((state) => state.project)
  const selectedModuleIds = useAppStore((state) => state.selectedModuleIds)
  const error = useWorkflowStore((state) => state.error)
  const taskPipelines = useWorkflowStore((state) => state.taskPipelines)
  const currentTaskPipelineRun = useWorkflowStore((state) => state.currentTaskPipelineRun)
  const saveTaskPipeline = useWorkflowStore((state) => state.saveTaskPipeline)
  const deleteTaskPipeline = useWorkflowStore((state) => state.deleteTaskPipeline)
  const startTaskPipeline = useWorkflowStore((state) => state.startTaskPipeline)
  const [editingPipeline, setEditingPipeline] = useState<TaskPipeline>(() => createPipeline())

  const moduleOptions = useMemo(
    () => flattenModules(project?.modules ?? []).map((module) => ({
      label: `${module.artifactId}${module.relativePath ? ` · ${module.relativePath}` : ''}`,
      value: module.id,
    })),
    [project?.modules],
  )

  const updateStep = (stepId: string, updater: (step: TaskStep) => TaskStep) => {
    setEditingPipeline((state) => ({
      ...state,
      steps: state.steps.map((step) => (step.id === stepId ? updater(step) : step)),
    }))
  }

  const selectPipeline = (pipelineId: string) => {
    const pipeline = taskPipelines.find((item) => item.id === pipelineId)
    if (pipeline) {
      setEditingPipeline({
        ...pipeline,
        steps: pipeline.steps.map((step) => ({
          ...step,
          payload: {...step.payload},
        })),
      })
    }
  }

  return (
    <Card title="任务编排" className="panel-card" size="small">
      <Space direction="vertical" size={16} style={{width: '100%'}}>
        <Space wrap>
          <Select
            placeholder="加载已有任务模板"
            style={{minWidth: 260}}
            value={taskPipelines.some((item) => item.id === editingPipeline.id) ? editingPipeline.id : undefined}
            options={taskPipelines.map((item) => ({label: item.name, value: item.id}))}
            onChange={selectPipeline}
          />
          <Button onClick={() => setEditingPipeline(createPipeline(selectedModuleIds))}>
            新建任务链
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            disabled={!editingPipeline.name.trim()}
            onClick={() => void saveTaskPipeline(editingPipeline)}
          >
            保存模板
          </Button>
          <Button
            type="primary"
            ghost
            icon={<PlayCircleOutlined />}
            disabled={!editingPipeline.name.trim() || editingPipeline.steps.length === 0}
            onClick={() => void startTaskPipeline(editingPipeline)}
          >
            执行任务链
          </Button>
          {taskPipelines.some((item) => item.id === editingPipeline.id) ? (
            <Popconfirm
              title="删除当前任务模板？"
              okText="删除"
              cancelText="取消"
              onConfirm={() => void deleteTaskPipeline(editingPipeline.id)}
            >
              <Button danger icon={<DeleteOutlined />}>删除模板</Button>
            </Popconfirm>
          ) : null}
        </Space>

        {error ? <Alert type="error" showIcon message={error} /> : null}

        <Input
          addonBefore="任务链名称"
          placeholder="例如：联调前构建 + 打开产物目录"
          value={editingPipeline.name}
          onChange={(event) => setEditingPipeline((state) => ({...state, name: event.target.value}))}
        />

        <div className="option-block">
          <Text strong>绑定模块范围</Text>
          <Select
            mode="multiple"
            allowClear
            placeholder="为空时表示整个项目"
            value={editingPipeline.moduleIds}
            options={moduleOptions}
            onChange={(value) => setEditingPipeline((state) => ({...state, moduleIds: value}))}
          />
        </div>

        <Space wrap>
          <Button icon={<PlusOutlined />} onClick={() => setEditingPipeline((state) => ({...state, steps: [...state.steps, createStep('maven_goal')]}))}>
            Maven Goal
          </Button>
          <Button icon={<PlusOutlined />} onClick={() => setEditingPipeline((state) => ({...state, steps: [...state.steps, createStep('shell_command')]}))}>
            Shell Command
          </Button>
          <Button icon={<PlusOutlined />} onClick={() => setEditingPipeline((state) => ({...state, steps: [...state.steps, createStep('open_directory')]}))}>
            打开目录
          </Button>
          <Button icon={<PlusOutlined />} onClick={() => setEditingPipeline((state) => ({...state, steps: [...state.steps, createStep('notify')]}))}>
            通知
          </Button>
        </Space>

        {editingPipeline.steps.length === 0 ? (
          <Empty description="先添加至少一个步骤" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <List
            dataSource={editingPipeline.steps}
            renderItem={(step, index) => (
              <List.Item
                className="workflow-step-item"
                actions={[
                  <Switch
                    key="enabled"
                    checked={step.enabled}
                    onChange={(checked) => updateStep(step.id, (item) => ({...item, enabled: checked}))}
                  />,
                  <Button
                    key="delete"
                    danger
                    type="text"
                    icon={<DeleteOutlined />}
                    onClick={() =>
                      setEditingPipeline((state) => ({
                        ...state,
                        steps: state.steps.filter((item) => item.id !== step.id),
                      }))}
                  />,
                ]}
              >
                <Space direction="vertical" size={10} style={{width: '100%'}}>
                  <Space wrap>
                    <Tag color="blue">步骤 {index + 1}</Tag>
                    <Select<TaskStepType>
                      value={step.type}
                      style={{width: 170}}
                      options={[
                        {label: 'Maven Goal', value: 'maven_goal'},
                        {label: 'Shell Command', value: 'shell_command'},
                        {label: '打开目录', value: 'open_directory'},
                        {label: '通知', value: 'notify'},
                      ]}
                      onChange={(value) => updateStep(step.id, () => createStep(value))}
                    />
                    <Input
                      placeholder="步骤名称"
                      style={{minWidth: 220}}
                      value={step.label}
                      onChange={(event) => updateStep(step.id, (item) => ({...item, label: event.target.value}))}
                    />
                  </Space>

                  {step.type === 'maven_goal' ? (
                    <Space direction="vertical" size={8} style={{width: '100%'}}>
                      <Checkbox.Group
                        value={Array.isArray(step.payload.goals) ? step.payload.goals as string[] : []}
                        options={[
                          {label: 'clean', value: 'clean'},
                          {label: 'package', value: 'package'},
                          {label: 'install', value: 'install'},
                          {label: 'verify', value: 'verify'},
                        ]}
                        onChange={(value) =>
                          updateStep(step.id, (item) => ({
                            ...item,
                            payload: {...item.payload, goals: value.map(String)},
                          }))}
                      />
                      <Input
                        addonBefore="Profiles"
                        placeholder="dev,test"
                        value={Array.isArray(step.payload.profiles) ? (step.payload.profiles as string[]).join(',') : ''}
                        onChange={(event) =>
                          updateStep(step.id, (item) => ({
                            ...item,
                            payload: {...item.payload, profiles: splitArgs(event.target.value)},
                          }))}
                      />
                      <Input
                        addonBefore="参数"
                        placeholder="-DskipITs -U"
                        value={Array.isArray(step.payload.customArgs) ? (step.payload.customArgs as string[]).join(' ') : ''}
                        onChange={(event) =>
                          updateStep(step.id, (item) => ({
                            ...item,
                            payload: {...item.payload, customArgs: splitArgs(event.target.value)},
                          }))}
                      />
                      <Space wrap>
                        <Checkbox
                          checked={Boolean(step.payload.alsoMake ?? true)}
                          onChange={(event) =>
                            updateStep(step.id, (item) => ({
                              ...item,
                              payload: {...item.payload, alsoMake: event.target.checked},
                            }))}
                        >
                          联动依赖模块
                        </Checkbox>
                        <Checkbox
                          checked={Boolean(step.payload.skipTests ?? true)}
                          onChange={(event) =>
                            updateStep(step.id, (item) => ({
                              ...item,
                              payload: {...item.payload, skipTests: event.target.checked},
                            }))}
                        >
                          跳过测试
                        </Checkbox>
                      </Space>
                    </Space>
                  ) : null}

                  {step.type === 'shell_command' ? (
                    <Space direction="vertical" size={8} style={{width: '100%'}}>
                      <Input.TextArea
                        autoSize={{minRows: 2, maxRows: 4}}
                        placeholder="例如：dir target"
                        value={String(step.payload.command ?? '')}
                        onChange={(event) =>
                          updateStep(step.id, (item) => ({
                            ...item,
                            payload: {...item.payload, command: event.target.value},
                          }))}
                      />
                      <Input
                        placeholder="工作目录，可留空使用项目根目录"
                        value={String(step.payload.workingDirectory ?? '')}
                        onChange={(event) =>
                          updateStep(step.id, (item) => ({
                            ...item,
                            payload: {...item.payload, workingDirectory: event.target.value},
                          }))}
                      />
                    </Space>
                  ) : null}

                  {step.type === 'open_directory' ? (
                    <Space direction="vertical" size={8} style={{width: '100%'}}>
                      <Select
                        value={String(step.payload.location ?? 'module_target')}
                        options={[
                          {label: '项目根目录', value: 'project_root'},
                          {label: '模块根目录', value: 'module_root'},
                          {label: '模块 target 目录', value: 'module_target'},
                          {label: '自定义路径', value: 'custom'},
                        ]}
                        onChange={(value) =>
                          updateStep(step.id, (item) => ({
                            ...item,
                            payload: {...item.payload, location: value},
                          }))}
                      />
                      {step.payload.location === 'custom' ? (
                        <Input
                          placeholder="自定义相对路径或绝对路径"
                          value={String(step.payload.path ?? '')}
                          onChange={(event) =>
                            updateStep(step.id, (item) => ({
                              ...item,
                              payload: {...item.payload, path: event.target.value},
                            }))}
                        />
                      ) : null}
                    </Space>
                  ) : null}

                  {step.type === 'notify' ? (
                    <Space direction="vertical" size={8} style={{width: '100%'}}>
                      <Input
                        placeholder="通知标题"
                        value={String(step.payload.title ?? '')}
                        onChange={(event) =>
                          updateStep(step.id, (item) => ({
                            ...item,
                            payload: {...item.payload, title: event.target.value},
                          }))}
                      />
                      <Input.TextArea
                        autoSize={{minRows: 2, maxRows: 4}}
                        placeholder="通知内容"
                        value={String(step.payload.message ?? '')}
                        onChange={(event) =>
                          updateStep(step.id, (item) => ({
                            ...item,
                            payload: {...item.payload, message: event.target.value},
                          }))}
                      />
                    </Space>
                  ) : null}
                </Space>
              </List.Item>
            )}
          />
        )}

        {currentTaskPipelineRun ? (
          <Card size="small" className="workflow-run-card">
            <Title level={5} style={{marginTop: 0}}>最近执行</Title>
            <Space wrap>
              <Tag color={currentTaskPipelineRun.status === 'success' ? 'green' : currentTaskPipelineRun.status === 'failed' ? 'red' : 'processing'}>
                {currentTaskPipelineRun.status}
              </Tag>
              <Text>{currentTaskPipelineRun.pipelineName}</Text>
              <Text type="secondary">
                {currentTaskPipelineRun.steps.filter((step) => step.status === 'success').length}/{currentTaskPipelineRun.steps.length} 步完成
              </Text>
            </Space>
          </Card>
        ) : null}
      </Space>
    </Card>
  )
}
