import {useEffect, useCallback} from 'react'
import {Form, Input, Space, Tag, Alert} from 'antd'
import {useCommandStore} from '../../store/useCommandStore'


interface VariableEditorProps {
  selectedTemplateId?: string
  onVariablesChange?: (variables: Record<string, string>) => void
}

export function VariableEditor({selectedTemplateId, onVariablesChange}: VariableEditorProps) {
  const {templates, presetVariables} = useCommandStore()
  const [form] = Form.useForm()

  // 根据selectedTemplateId获取当前模板
  const currentTemplate = templates.find(t => t.id === selectedTemplateId)

  // 初始化表单值，包含预设变量
  useEffect(() => {
    if (currentTemplate) {
      const initialValues: Record<string, string> = {}
      currentTemplate.variables.forEach(v => {
        initialValues[v.key] = presetVariables[v.key] || v.defaultValue || ''
      })
      // 添加预设变量（即使模板没有定义）
      Object.entries(presetVariables).forEach(([key, value]) => {
        if (!initialValues[key]) {
          initialValues[key] = value
        }
      })
      form.setFieldsValue(initialValues)
      // 通知父组件变量值
      onVariablesChange?.(initialValues)
    }
  }, [currentTemplate?.id, presetVariables]) // 移除form依赖，使用currentTemplate?.id

  // 表单值变化时通知父组件
  const handleValuesChange = useCallback((_changedValues: Record<string, string>, allValues: Record<string, string>) => {
    onVariablesChange?.(allValues)
  }, [onVariablesChange])

  // 获取所有变量键（包括模板定义的和预设的）
  const allVariableKeys = [
    ...(currentTemplate?.variables.map(v => v.key) || []),
    ...Object.keys(presetVariables).filter(key => 
      !currentTemplate?.variables.some(v => v.key === key)
    ),
  ]

  if (allVariableKeys.length === 0) {
    return (
      <Alert
        message="无变量"
        description="当前模板没有定义变量，可以直接执行。"
        type="info"
        showIcon
      />
    )
  }

  // 获取变量标签
  const getVariableLabel = (key: string) => {
    const variable = currentTemplate?.variables.find(v => v.key === key)
    return variable?.label || key
  }

  // 获取变量是否必填
  const isVariableRequired = (key: string) => {
    const variable = currentTemplate?.variables.find(v => v.key === key)
    return variable?.required || false
  }

  // 判断是否为预设变量
  const isPresetVariable = (key: string) => {
    return key in presetVariables && !currentTemplate?.variables.some(v => v.key === key)
  }

  return (
    <div>
      <div style={{marginBottom: 8, fontWeight: 500}}>模板变量</div>
      <Form
        form={form}
        layout="inline"
        style={{flexWrap: 'wrap', gap: 8}}
        onValuesChange={handleValuesChange}
      >
        {allVariableKeys.map(key => (
          <Form.Item
            key={key}
            name={key}
            label={
              <Space>
                <span>{getVariableLabel(key)}</span>
                <Tag color="blue">{`{{${key}}}`}</Tag>
                {isPresetVariable(key) && <Tag color="green">自动填充</Tag>}
              </Space>
            }
            rules={isVariableRequired(key) ? [{required: true, message: `${getVariableLabel(key)}不能为空`}] : []}
          >
            <Input
              placeholder={`输入${getVariableLabel(key)}`}
              style={{width: 250}}
              disabled={isPresetVariable(key)}
            />
          </Form.Item>
        ))}
      </Form>
    </div>
  )
}
