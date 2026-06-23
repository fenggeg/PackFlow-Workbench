import {useState, useEffect} from 'react'
import {Modal, Form, Input, InputNumber, Button, Space, Card, Select, Switch, message} from 'antd'
import {PlusOutlined, DeleteOutlined, FolderOpenOutlined} from '@ant-design/icons'
import type {CommandTemplate, CommandStep, TemplateVariable, SaveCommandTemplatePayload} from '../../types/domain'
import {useCommandStore} from '../../store/useCommandStore'
import {selectLocalFile} from '../../services/tauri-api'

const {TextArea} = Input

interface TemplateEditorProps {
  visible: boolean
  template?: CommandTemplate
  onClose: () => void
}

export function TemplateEditor({visible, template, onClose}: TemplateEditorProps) {
  const [form] = Form.useForm()
  const [steps, setSteps] = useState<CommandStep[]>([])
  const [variables, setVariables] = useState<TemplateVariable[]>([])
  const {saveTemplate} = useCommandStore()

  useEffect(() => {
    if (visible) {
      if (template) {
        form.setFieldsValue({
          name: template.name,
          description: template.description,
        })
      } else {
        form.resetFields()
      }
    }
  }, [visible, template, form])

  useEffect(() => {
    if (visible && template) {
      // 使用 setTimeout 避免在 effect 中同步调用 setState
      const timer = setTimeout(() => {
        setSteps(template.steps || [])
        setVariables(template.variables || [])
      }, 0)
      return () => clearTimeout(timer)
    } else if (visible && !template) {
      const timer = setTimeout(() => {
        setSteps([])
        setVariables([])
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [visible, template])

  const handleAddStep = () => {
    const newStep: CommandStep = {
      id: `step_${Date.now()}`,
      type: 'command',
      name: `步骤 ${steps.length + 1}`,
      command: '',
      ignoreError: false,
      privileged: false,
    }
    setSteps([...steps, newStep])
  }

  const handleRemoveStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index))
  }

  const handleStepChange = (index: number, field: string, value: string | boolean | number | undefined) => {
    const newSteps = [...steps]
    newSteps[index] = {...newSteps[index], [field]: value}
    setSteps(newSteps)
  }

  const handleAddVariable = () => {
    const newVar: TemplateVariable = {
      key: `var_${variables.length + 1}`,
      label: `变量 ${variables.length + 1}`,
      required: false,
    }
    setVariables([...variables, newVar])
  }

  const handleRemoveVariable = (index: number) => {
    setVariables(variables.filter((_, i) => i !== index))
  }

  const handleVariableChange = (index: number, field: string, value: string | boolean | undefined) => {
    const newVars = [...variables]
    newVars[index] = {...newVars[index], [field]: value}
    setVariables(newVars)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      const payload: SaveCommandTemplatePayload = {
        id: template?.id,
        name: values.name,
        description: values.description,
        steps,
        variables,
      }
      await saveTemplate(payload)
      message.success(template ? '模板已更新' : '模板已创建')
      onClose()
    } catch (error) {
      if (error !== false) {
        message.error(`保存失败: ${error}`)
      }
    }
  }

  return (
    <Modal
      title={template ? '编辑模板' : '新建模板'}
      open={visible}
      onCancel={onClose}
      onOk={handleSubmit}
      width={800}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="name"
          label="模板名称"
          rules={[{required: true, message: '请输入模板名称'}]}
        >
          <Input placeholder="输入模板名称" />
        </Form.Item>

        <Form.Item
          name="description"
          label="描述"
        >
          <TextArea rows={2} placeholder="输入模板描述" />
        </Form.Item>

        <div style={{marginBottom: 16}}>
          <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 8}}>
            <span style={{fontWeight: 500}}>执行步骤</span>
            <Button icon={<PlusOutlined />} size="small" onClick={handleAddStep}>
              添加步骤
            </Button>
          </div>

          {steps.map((step, index) => (
            <Card key={step.id} size="small" style={{marginBottom: 8}}>
              <Space direction="vertical" style={{width: '100%'}}>
                <Space>
                  <Input
                    placeholder="步骤名称"
                    value={step.name}
                    onChange={e => handleStepChange(index, 'name', e.target.value)}
                    style={{width: 150}}
                  />
                  <Select
                    value={step.type}
                    onChange={value => handleStepChange(index, 'type', value)}
                    style={{width: 100}}
                    options={[
                      {label: '命令', value: 'command'},
                      {label: '上传', value: 'upload'},
                    ]}
                  />
                  <Switch
                    checked={step.ignoreError}
                    onChange={checked => handleStepChange(index, 'ignoreError', checked)}
                    checkedChildren="忽略错误"
                    unCheckedChildren="停止失败"
                  />
                  <Switch
                    checked={step.privileged}
                    onChange={checked => handleStepChange(index, 'privileged', checked)}
                    checkedChildren="提权"
                    unCheckedChildren="普通"
                  />
                  <Switch
                    checked={step.affectsStatus !== false}
                    onChange={checked => handleStepChange(index, 'affectsStatus', checked)}
                    checkedChildren="影响状态"
                    unCheckedChildren="不影响"
                    title="关闭后此步骤失败不影响整体执行状态"
                  />
                  {step.type === 'command' && (
                    <Space size={4}>
                      <span style={{fontSize: 12, color: '#666'}}>超时:</span>
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
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => handleRemoveStep(index)}
                  />
                </Space>

                {step.type === 'command' ? (
                  <TextArea
                    placeholder="输入要执行的命令，支持 {{variable}} 语法"
                    value={step.command}
                    onChange={e => handleStepChange(index, 'command', e.target.value)}
                    rows={2}
                  />
                ) : step.type === 'upload' ? (
                  <Space>
                    <Input
                      placeholder="本地路径"
                      value={step.localPath}
                      onChange={e => handleStepChange(index, 'localPath', e.target.value)}
                      style={{width: 250}}
                    />
                    <Button
                      icon={<FolderOpenOutlined />}
                      onClick={async () => {
                        const path = await selectLocalFile('选择上传文件')
                        if (path) {
                          handleStepChange(index, 'localPath', path)
                        }
                      }}
                    />
                    <Input
                      placeholder="/home/data/app.jar (Linux路径用/)"
                      value={step.remotePath}
                      onChange={e => {
                        // 自动将反斜杠转换为正斜杠
                        const normalizedPath = e.target.value.replace(/\\/g, '/')
                        handleStepChange(index, 'remotePath', normalizedPath)
                      }}
                      style={{width: 250}}
                    />
                  </Space>
                ) : step.type === 'wait' ? (
                  <Space>
                    <span>等待</span>
                    <Input
                      type="number"
                      min={1}
                      max={3600}
                      value={step.waitSeconds ?? 5}
                      onChange={e => handleStepChange(index, 'waitSeconds', parseInt(e.target.value) || 5)}
                      style={{width: 80}}
                    />
                    <span>秒</span>
                  </Space>
                ) : null}
                {step.type === 'upload' && (
                  <div style={{fontSize: 12, color: '#999', marginTop: 4}}>
                    提示：远程路径必须使用 Linux 格式（正斜杠 /），例如 /home/data/app.jar
                  </div>
                )}
              </Space>
            </Card>
          ))}
        </div>

        <div>
          <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 8}}>
            <span style={{fontWeight: 500}}>模板变量</span>
            <Button icon={<PlusOutlined />} size="small" onClick={handleAddVariable}>
              添加变量
            </Button>
          </div>

          {variables.map((variable, index) => (
            <Card key={index} size="small" style={{marginBottom: 8}}>
              <Space>
                <Input
                  placeholder="变量标识"
                  value={variable.key}
                  onChange={e => handleVariableChange(index, 'key', e.target.value)}
                  style={{width: 120}}
                />
                <Input
                  placeholder="显示名称"
                  value={variable.label}
                  onChange={e => handleVariableChange(index, 'label', e.target.value)}
                  style={{width: 120}}
                />
                <Input
                  placeholder="默认值"
                  value={variable.defaultValue}
                  onChange={e => handleVariableChange(index, 'defaultValue', e.target.value)}
                  style={{width: 150}}
                />
                <Switch
                  checked={variable.required}
                  onChange={checked => handleVariableChange(index, 'required', checked)}
                  checkedChildren="必填"
                  unCheckedChildren="可选"
                />
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleRemoveVariable(index)}
                />
              </Space>
            </Card>
          ))}
        </div>
      </Form>
    </Modal>
  )
}
