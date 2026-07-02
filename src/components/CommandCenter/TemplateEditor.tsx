import {useState, useEffect} from 'react'
import {Drawer, Form, Input, InputNumber, Button, Space, Card, Select, Switch, Typography, message, Radio} from 'antd'
import {PlusOutlined, DeleteOutlined, FolderOpenOutlined, InsertRowAboveOutlined} from '@ant-design/icons'
import type {CommandTemplate, CommandStep, TemplateVariable, SaveCommandTemplatePayload} from '../../types/domain'
import {useCommandStore} from '../../store/useCommandStore'
import {selectLocalFile} from '../../services/tauri-api'

const {TextArea} = Input
const {Text} = Typography

interface TemplateEditorProps {
  visible: boolean
  template?: CommandTemplate
  onClose: () => void
}

export function TemplateEditor({visible, template, onClose}: TemplateEditorProps) {
  const [form] = Form.useForm()
  const [steps, setSteps] = useState<CommandStep[]>([])
  const [variables, setVariables] = useState<TemplateVariable[]>([])
  const [saving, setSaving] = useState(false)
  const {saveTemplate} = useCommandStore()

  // 跟踪每个上传步骤的路径模式：fixed=固定路径, variable=使用变量
  const [pathModes, setPathModes] = useState<Record<string, {local: 'fixed' | 'variable', remote: 'fixed' | 'variable'}>>({})

  // 跟踪下拉选项的原始文本（避免实时过滤导致无法在末尾回车换行）
  const [rawOptionsText, setRawOptionsText] = useState<Record<number, string>>({})

  useEffect(() => {
    if (visible) {
      form.resetFields()
      if (template) {
        form.setFieldsValue({
          name: template.name,
          description: template.description,
        })
      }
      // 使用 setTimeout 避免在 effect 中同步调用 setState
      const timer = setTimeout(() => {
        const vars = template?.variables || []
        const templateSteps = template?.steps || []
        setSteps(templateSteps)
        setVariables(vars)
        const initialPathModes: Record<string, {local: 'fixed' | 'variable', remote: 'fixed' | 'variable'}> = {}
        for (const s of templateSteps) {
          if (s.type === 'upload') {
            initialPathModes[s.id] = {
              local: s.localPathMode || 'fixed',
              remote: s.remotePathMode || 'fixed',
            }
          }
        }
        setPathModes(initialPathModes)
        const rawTexts: Record<number, string> = {}
        vars.forEach((v, i) => {
          if (v.type === 'select' && v.options?.length) {
            rawTexts[i] = v.options.join('\n')
          }
        })
        setRawOptionsText(rawTexts)
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [visible, template, form])

  const handleAddStep = () => {
    const newStep: CommandStep = {
      id: `step_${crypto.randomUUID()}`,
      type: 'command',
      name: `步骤 ${steps.length + 1}`,
      command: '',
      ignoreError: false,
      privileged: false,
    }
    setSteps([...steps, newStep])
  }

  const handleInsertStep = (index: number) => {
    const newStep: CommandStep = {
      id: `step_${crypto.randomUUID()}`,
      type: 'command',
      name: `步骤 ${index + 1}`,
      command: '',
      ignoreError: false,
      privileged: false,
    }
    const newSteps = [...steps]
    newSteps.splice(index, 0, newStep)
    setSteps(newSteps)
  }

  const handleRemoveStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index))
  }

  const handleStepChange = (index: number, field: string, value: string | boolean | number | undefined) => {
    const newSteps = [...steps]
    newSteps[index] = {...newSteps[index], [field]: value}
    setSteps(newSteps)
  }

  // 生成基于步骤名的变量key
  const generateVarKey = (step: CommandStep, pathType: 'local' | 'remote') => {
    const stepName = step.name || `步骤${steps.indexOf(step) + 1}`
    const cleanName = stepName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')
    return `${cleanName}_${pathType === 'local' ? 'localPath' : 'remotePath'}`
  }

  // 处理路径模式变化
  const handlePathModeChange = (stepIndex: number, pathType: 'local' | 'remote', mode: 'fixed' | 'variable') => {
    const step = steps[stepIndex]
    if (!step) return

    setPathModes(prev => ({
      ...prev,
      [step.id]: {
        ...prev[step.id],
        [pathType]: mode,
      },
    }))

    if (mode === 'variable') {
      const varKey = generateVarKey(step, pathType)
      handleStepChange(stepIndex, pathType === 'local' ? 'localPath' : 'remotePath', `{{${varKey}}}`)
    } else {
      handleStepChange(stepIndex, pathType === 'local' ? 'localPath' : 'remotePath', '')
    }
    handleStepChange(stepIndex, pathType === 'local' ? 'localPathMode' : 'remotePathMode', mode)
  }

  const handleAddVariable = () => {
    const newVar: TemplateVariable = {
      key: `var_${variables.length + 1}`,
      label: `变量 ${variables.length + 1}`,
      required: false,
      type: 'text',
      options: [],
    }
    setVariables([...variables, newVar])
  }

  const handleRemoveVariable = (index: number) => {
    setVariables(variables.filter((_, i) => i !== index))
  }

  const handleVariableChange = (index: number, field: string, value: string | boolean | string[] | undefined) => {
    const newVars = [...variables]
    newVars[index] = {...newVars[index], [field]: value}
    setVariables(newVars)
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      // 保存前刷新所有下拉选项的原始文本
      const flushedVars = variables.map((v, i) => {
        if (v.type === 'select' && rawOptionsText[i] !== undefined) {
          const options = rawOptionsText[i].split('\n').map(s => s.trim()).filter(Boolean)
          return {...v, options}
        }
        return v
      })
      const payload: SaveCommandTemplatePayload = {
        id: template?.id,
        name: values.name,
        description: values.description,
        steps,
        variables: flushedVars,
      }
      await saveTemplate(payload)
      message.success(template ? '模板已更新' : '模板已创建')
      onClose()
    } catch (error) {
      if (error !== false) {
        message.error(`保存失败: ${error}`)
      }
    } finally {
      setSaving(false)
    }
  }

  const stepTypeLabel = (type: string) => {
    switch (type) {
      case 'command': return '命令'
      case 'upload': return '上传'
      case 'wait': return '等待'
      default: return type
    }
  }

  return (
    <Drawer
      title={template ? `编辑模板：${template.name}` : '新建模板'}
      open={visible}
      onClose={onClose}
      width={640}
      destroyOnClose
      extra={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" onClick={handleSave} loading={saving}>
            保存
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="name"
          label="模板名称"
          rules={[{required: true, message: '请输入模板名称'}]}
        >
          <Input placeholder="输入模板名称" />
        </Form.Item>

        <Form.Item name="description" label="描述">
          <TextArea rows={2} placeholder="输入模板描述（可选）" />
        </Form.Item>

        {/* ── 执行步骤 ──────────────────────────── */}
        <div style={{marginBottom: 24}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12}}>
            <Text strong>执行步骤</Text>
            <Button icon={<PlusOutlined />} size="small" onClick={handleAddStep}>
              添加步骤
            </Button>
          </div>

          {steps.length === 0 && (
            <Text type="secondary" style={{fontSize: 13}}>
              暂无步骤，点击「添加步骤」开始配置。
            </Text>
          )}

          {steps.map((step, index) => (
            <Card
              key={step.id}
              size="small"
              className="cc-step-card"
              title={
                <div className="cc-step-header">
                  <span className="cc-step-index">{index + 1}</span>
                  <Text strong>{step.name || `步骤 ${index + 1}`}</Text>
                  <Text type="secondary" style={{fontSize: 12}}>({stepTypeLabel(step.type)})</Text>
                </div>
              }
              extra={
                <Space size={4}>
                  <Button
                    type="text"
                    size="small"
                    icon={<InsertRowAboveOutlined />}
                    onClick={() => handleInsertStep(index)}
                    title="在此步骤前插入"
                  />
                  <Button
                    type="text"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() => handleRemoveStep(index)}
                  />
                </Space>
              }
            >
              <div className="cc-step-meta">
                <Input
                  placeholder="步骤名称"
                  value={step.name}
                  onChange={e => handleStepChange(index, 'name', e.target.value)}
                />
                <Select
                  value={step.type}
                  onChange={value => handleStepChange(index, 'type', value)}
                  options={[
                    {label: '命令', value: 'command'},
                    {label: '上传', value: 'upload'},
                  ]}
                />
              </div>

              <div className="cc-step-options" style={{marginTop: 10}}>
                <Switch
                  size="small"
                  checked={step.ignoreError}
                  onChange={checked => handleStepChange(index, 'ignoreError', checked)}
                  checkedChildren="忽略错误"
                  unCheckedChildren="停止失败"
                />
                <Switch
                  size="small"
                  checked={step.privileged}
                  onChange={checked => handleStepChange(index, 'privileged', checked)}
                  checkedChildren="提权"
                  unCheckedChildren="普通"
                />
                <Switch
                  size="small"
                  checked={step.affectsStatus !== false}
                  onChange={checked => handleStepChange(index, 'affectsStatus', checked)}
                  checkedChildren="影响状态"
                  unCheckedChildren="不影响"
                />
                {step.type === 'command' && (
                  <Space size={4}>
                    <Text type="secondary" style={{fontSize: 12}}>超时:</Text>
                    <InputNumber
                      size="small"
                      min={0}
                      max={3600}
                      value={step.timeoutSeconds}
                      onChange={(value: number | null) => handleStepChange(index, 'timeoutSeconds', value || undefined)}
                      placeholder="不限"
                      style={{width: 70}}
                      addonAfter="秒"
                    />
                  </Space>
                )}
              </div>

              {step.type === 'command' && (
                <TextArea
                  placeholder="输入要执行的命令，支持 {{variable}} 语法"
                  value={step.command}
                  onChange={e => handleStepChange(index, 'command', e.target.value)}
                  rows={3}
                  className="command-textarea"
                  style={{marginTop: 10}}
                />
              )}

              {step.type === 'upload' && (
                <div style={{marginTop: 10}}>
                  <Form.Item label="本地路径" style={{marginBottom: 8}}>
                    <Space.Compact style={{width: '100%'}}>
                      <Select
                        value={pathModes[step.id]?.local || 'fixed'}
                        onChange={value => handlePathModeChange(index, 'local', value)}
                        style={{width: 110}}
                        options={[
                          {label: '固定路径', value: 'fixed'},
                          {label: '使用变量', value: 'variable'},
                        ]}
                      />
                      {(pathModes[step.id]?.local || 'fixed') === 'fixed' ? (
                        <Input
                          placeholder="本地文件路径"
                          value={step.localPath}
                          onChange={e => handleStepChange(index, 'localPath', e.target.value)}
                          suffix={
                            <FolderOpenOutlined
                              style={{cursor: 'pointer', color: 'var(--pf-color-text-muted)'}}
                              onClick={async () => {
                                const path = await selectLocalFile('选择上传文件')
                                if (path) handleStepChange(index, 'localPath', path)
                              }}
                            />
                          }
                        />
                      ) : (
                        <Input
                          value={generateVarKey(step, 'local')}
                          disabled
                          style={{color: 'var(--pf-color-primary)'}}
                        />
                      )}
                    </Space.Compact>
                  </Form.Item>

                  <Form.Item label="远程路径" style={{marginBottom: 0}}>
                    <Space.Compact style={{width: '100%'}}>
                      <Select
                        value={pathModes[step.id]?.remote || 'fixed'}
                        onChange={value => handlePathModeChange(index, 'remote', value)}
                        style={{width: 110}}
                        options={[
                          {label: '固定路径', value: 'fixed'},
                          {label: '使用变量', value: 'variable'},
                        ]}
                      />
                      {(pathModes[step.id]?.remote || 'fixed') === 'fixed' ? (
                        <Input
                          placeholder="/home/data/app.jar"
                          value={step.remotePath}
                          onChange={e => {
                            const normalizedPath = e.target.value.replace(/\\/g, '/')
                            handleStepChange(index, 'remotePath', normalizedPath)
                          }}
                        />
                      ) : (
                        <Input
                          value={generateVarKey(step, 'remote')}
                          disabled
                          style={{color: 'var(--pf-color-primary)'}}
                        />
                      )}
                    </Space.Compact>
                    <div className="cc-step-hint">远程路径必须使用 Linux 格式（正斜杠 /）。选择「使用变量」可在执行时传入路径。</div>
                  </Form.Item>
                </div>
              )}
            </Card>
          ))}
        </div>

        {/* ── 模板变量 ──────────────────────────── */}
        <div>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12}}>
            <Text strong>模板变量</Text>
            <Button icon={<PlusOutlined />} size="small" onClick={handleAddVariable}>
              添加变量
            </Button>
          </div>

          {variables.length === 0 && (
            <Text type="secondary" style={{fontSize: 13}}>
              暂无变量，点击「添加变量」定义模板参数。
            </Text>
          )}

          {variables.map((variable, index) => (
            <Card
              key={index}
              size="small"
              className="cc-step-card"
              title={
                <div className="cc-step-header">
                  <Text strong>{variable.label || variable.key || `变量 ${index + 1}`}</Text>
                  {variable.required && <Text type="danger" style={{fontSize: 12}}>必填</Text>}
                </div>
              }
              extra={
                <Button
                  type="text"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={() => handleRemoveVariable(index)}
                />
              }
            >
              <div className="cc-step-meta">
                <Input
                  placeholder="变量标识 (key)"
                  value={variable.key}
                  onChange={e => handleVariableChange(index, 'key', e.target.value)}
                />
                <Input
                  placeholder="显示名称"
                  value={variable.label}
                  onChange={e => handleVariableChange(index, 'label', e.target.value)}
                />
              </div>

              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8}}>
                <Select
                  value={variable.type || 'text'}
                  onChange={value => handleVariableChange(index, 'type', value)}
                  options={[
                    {label: '文本输入', value: 'text'},
                    {label: '下拉选择', value: 'select'},
                  ]}
                />
                <Input
                  placeholder="默认值"
                  value={variable.defaultValue}
                  onChange={e => handleVariableChange(index, 'defaultValue', e.target.value)}
                />
              </div>

              <div style={{marginTop: 8}}>
                <Switch
                  size="small"
                  checked={variable.required}
                  onChange={checked => handleVariableChange(index, 'required', checked)}
                  checkedChildren="必填"
                  unCheckedChildren="可选"
                />
              </div>

              {(variable.type || 'text') === 'select' && (
                <div style={{marginTop: 8}}>
                  <Radio.Group
                    size="small"
                    value={variable.variableSource || 'manual'}
                    onChange={(e: any) => handleVariableChange(index, 'variableSource', e.target.value)}
                  >
                    <Radio.Button value="manual">手动输入</Radio.Button>
                    <Radio.Button value="artifact">从构建产物加载</Radio.Button>
                  </Radio.Group>

                  {(!variable.variableSource || variable.variableSource === 'manual') ? (
                    <>
                      <Text type="secondary" style={{fontSize: 12, display: 'block', marginBottom: 4, marginTop: 8}}>
                        下拉选项（每行一个）：
                      </Text>
                      <TextArea
                        placeholder={'选项1\n选项2\n选项3'}
                        value={rawOptionsText[index] ?? (variable.options || []).join('\n')}
                        onChange={e => {
                          // 实时更新原始文本，保留换行
                          setRawOptionsText(prev => ({...prev, [index]: e.target.value}))
                        }}
                        onBlur={() => {
                          // 失焦时解析为数组并同步到变量数据
                          const raw = rawOptionsText[index] ?? ''
                          const options = raw.split('\n').map(s => s.trim()).filter(Boolean)
                          handleVariableChange(index, 'options', options as unknown as string)
                        }}
                        autoSize={{minRows: 2, maxRows: 6}}
                      />
                    </>
                  ) : (
                    <div style={{marginTop: 8, padding: '8px 12px', background: '#f0fdf4', borderRadius: 6, fontSize: 13, color: '#166534'}}>
                      <FolderOpenOutlined style={{marginRight: 6}} />
                      运行时将自动加载当前项目的 JAR 构建产物作为下拉选项
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      </Form>
    </Drawer>
  )
}
