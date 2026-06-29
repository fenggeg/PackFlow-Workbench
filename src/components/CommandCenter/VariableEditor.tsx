import {useEffect, useCallback, useState} from 'react'
import {Form, Input, Select, Tag, Alert, Radio, Typography} from 'antd'
import {FolderOpenOutlined} from '@ant-design/icons'
import {useCommandStore} from '../../store/useCommandStore'
import {selectLocalFile, api} from '../../services/tauri-api'
import {useAppStore} from '../../store/useAppStore'
import type {BuildArtifact} from '../../types/domain'

const {Text} = Typography

interface VariableEditorProps {
  selectedTemplateId?: string
  onVariablesChange?: (variables: Record<string, string>) => void
}

export function VariableEditor({selectedTemplateId, onVariablesChange}: VariableEditorProps) {
  const {templates, presetVariables} = useCommandStore()
  const [form] = Form.useForm()
  const storeArtifacts = useAppStore((s) => s.artifacts)
  const history = useAppStore((s) => s.history)

  // 路径输入模式：manual=手动输入, file=文件选择器, artifact=选择产物
  const [pathInputModes, setPathInputModes] = useState<Record<string, 'manual' | 'file' | 'artifact'>>({})

  // 根据selectedTemplateId获取当前模板
  const currentTemplate = templates.find(t => t.id === selectedTemplateId)

  // 从产物管理中获取 jar 列表（去重、按最新排序、只保留实际存在的文件）
  const [artifacts, setArtifacts] = useState<BuildArtifact[]>([])
  const [artifactsLoading, setArtifactsLoading] = useState(false)

  const loadArtifacts = useCallback(async () => {
    setArtifactsLoading(true)
    try {
      // 合并当前产物 + 历史产物，去重，只保留 jar
      const seen = new Set<string>()
      const merged: BuildArtifact[] = []
      for (const a of [...storeArtifacts, ...history.flatMap(r => r.artifacts ?? [])]) {
        if (!seen.has(a.path) && a.extension === 'jar') {
          seen.add(a.path)
          merged.push(a)
        }
      }
      // 按修改时间降序排列
      merged.sort((a, b) => (b.modifiedAt ?? '').localeCompare(a.modifiedAt ?? ''))
      // 批量检查文件是否实际存在
      const existingPaths = new Set(await api.checkFilesExist(merged.map(a => a.path)))
      setArtifacts(merged.filter(a => existingPaths.has(a.path)))
    } finally {
      setArtifactsLoading(false)
    }
  }, [storeArtifacts, history])

  // 当模板有 artifact 来源的变量时，自动加载产物列表
  useEffect(() => {
    if (currentTemplate?.variables.some(v => v.variableSource === 'artifact')) {
      loadArtifacts()
    }
  }, [currentTemplate?.id, loadArtifacts])

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
  }, [currentTemplate?.id, presetVariables]) // eslint-disable-line react-hooks/exhaustive-deps

  // 表单值变化时通知父组件
  const handleValuesChange = useCallback((_changedValues: Partial<Record<string, string>>, allValues: Record<string, string>) => {
    onVariablesChange?.(allValues)
  }, [onVariablesChange])

  // 从模板步骤中提取路径占位符变量
  const extractPathVariablesFromSteps = useCallback(() => {
    if (!currentTemplate) return []
    const pathVars: string[] = []
    const regex = /\{\{([^}]+)\}\}/g

    for (const step of currentTemplate.steps) {
      // 检查 localPath
      if (step.localPath) {
        let match
        while ((match = regex.exec(step.localPath)) !== null) {
          const varKey = match[1]
          if ((varKey.endsWith('_localPath') || varKey.endsWith('_remotePath')) && !pathVars.includes(varKey)) {
            pathVars.push(varKey)
          }
        }
      }
      // 检查 remotePath
      if (step.remotePath) {
        regex.lastIndex = 0
        let match
        while ((match = regex.exec(step.remotePath)) !== null) {
          const varKey = match[1]
          if ((varKey.endsWith('_localPath') || varKey.endsWith('_remotePath')) && !pathVars.includes(varKey)) {
            pathVars.push(varKey)
          }
        }
      }
    }
    return pathVars
  }, [currentTemplate])

  // 获取所有变量键（包括模板定义的、预设的和步骤中的路径占位符）
  const allVariableKeys = [
    ...(currentTemplate?.variables.map(v => v.key) || []),
    ...Object.keys(presetVariables).filter(key =>
      !currentTemplate?.variables.some(v => v.key === key)
    ),
    ...extractPathVariablesFromSteps().filter(key =>
      !currentTemplate?.variables.some(v => v.key === key) &&
      !Object.keys(presetVariables).includes(key)
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
    if (variable?.label) return variable.label

    // 为路径占位符生成标签
    if (key.endsWith('_localPath')) {
      const stepName = key.replace('_localPath', '')
      return `${stepName} - 本地路径`
    }
    if (key.endsWith('_remotePath')) {
      const stepName = key.replace('_remotePath', '')
      return `${stepName} - 远程路径`
    }

    return key
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

  // 获取变量类型
  const getVariableType = (key: string) => {
    const variable = currentTemplate?.variables.find(v => v.key === key)
    return variable?.type || 'text'
  }

  // 获取变量下拉选项
  const getVariableOptions = (key: string) => {
    const variable = currentTemplate?.variables.find(v => v.key === key)
    return variable?.options || []
  }

  // 获取变量选项来源
  const getVariableSource = (key: string) => {
    const variable = currentTemplate?.variables.find(v => v.key === key)
    return variable?.variableSource || 'manual'
  }

  // 判断是否为路径变量
  const isPathVariable = (key: string) => {
    return key.endsWith('_localPath') || key.endsWith('_remotePath') || key === 'localPath' || key === 'remotePath'
  }

  // 获取路径输入模式（本地路径默认文件选择，远程路径默认手动输入）
  const getPathInputMode = (key: string) => {
    if (pathInputModes[key]) return pathInputModes[key]
    const isLocal = key.endsWith('_localPath') || key === 'localPath'
    return isLocal ? 'file' : 'manual'
  }

  // 设置路径输入模式
  const setPathInputMode = (key: string, mode: 'manual' | 'file' | 'artifact') => {
    setPathInputModes(prev => ({...prev, [key]: mode}))
    if (mode === 'artifact' && artifacts.length === 0) {
      loadArtifacts()
    }
  }

  // 处理文件选择
  const handleFileSelect = async (key: string) => {
    const path = await selectLocalFile('选择文件')
    if (path) {
      form.setFieldValue(key, path)
      const allValues = form.getFieldsValue()
      onVariablesChange?.(allValues)
    }
  }

  // 渲染变量标签
  const renderVariableLabel = (key: string) => {
    const isPath = isPathVariable(key)
    const isPreset = isPresetVariable(key)
    const label = getVariableLabel(key)

    return (
      <div className="cc-variable-label">
        <span>{label}</span>
        <Tag color="default" style={{fontSize: 11}}>{`{{${key}}}`}</Tag>
        {isPreset && <Tag color="green" style={{fontSize: 11}}>自动填充</Tag>}
        {isPath && <Tag color="orange" style={{fontSize: 11}}>路径</Tag>}
      </div>
    )
  }

  // 渲染路径变量的输入控件
  const renderPathVariableInput = (key: string) => {
    const mode = getPathInputMode(key)
    const isLocal = key.endsWith('_localPath') || key === 'localPath'

    // 远程路径：仅手动输入
    if (!isLocal) {
      return (
        <Input
          placeholder="/home/data/app.jar (Linux路径用/)"
          disabled={isPresetVariable(key)}
        />
      )
    }

    // 本地路径：手动输入 / 文件选择 / 构建产物
    return (
      <div>
        <div className="cc-path-mode-row">
          <Radio.Group
            size="small"
            value={mode}
            onChange={e => setPathInputMode(key, e.target.value)}
          >
            <Radio.Button value="manual">手动输入</Radio.Button>
            <Radio.Button value="file">文件选择</Radio.Button>
            <Radio.Button value="artifact">构建产物</Radio.Button>
          </Radio.Group>
        </div>

        {mode === 'manual' && (
          <Input
            placeholder="输入本地文件路径"
            disabled={isPresetVariable(key)}
          />
        )}

        {mode === 'file' && (
          <Input
            placeholder="点击右侧图标选择文件"
            disabled={isPresetVariable(key)}
            suffix={
              <FolderOpenOutlined
                style={{cursor: 'pointer', color: 'var(--pf-color-text-muted)'}}
                onClick={() => handleFileSelect(key)}
              />
            }
          />
        )}

        {mode === 'artifact' && (
          <Select
            placeholder="选择构建产物"
            style={{width: '100%'}}
            loading={artifactsLoading}
            disabled={isPresetVariable(key)}
            showSearch
            optionFilterProp="label"
            options={artifacts.map(a => ({
              label: `${a.fileName} (${(a.sizeBytes / 1024 / 1024).toFixed(1)} MB)`,
              value: a.path,
            }))}
            onChange={value => {
              form.setFieldValue(key, value)
              const allValues = form.getFieldsValue()
              onVariablesChange?.(allValues)
            }}
          />
        )}
      </div>
    )
  }

  return (
    <div>
      <Text strong style={{display: 'block', marginBottom: 12}}>模板变量</Text>
      <Form
        form={form}
        layout="vertical"
        className="cc-variable-grid"
        onValuesChange={handleValuesChange}
      >
        {allVariableKeys.map(key => {
          const varType = getVariableType(key)
          const varOptions = getVariableOptions(key)
          const varSource = getVariableSource(key)
          const isSelect = varType === 'select' && varOptions.length > 0
          const isArtifactSelect = isSelect && varSource === 'artifact'
          const isPath = isPathVariable(key)

          return (
            <Form.Item
              key={key}
              name={key}
              label={renderVariableLabel(key)}
              rules={isVariableRequired(key) ? [{required: true, message: `${getVariableLabel(key)}不能为空`}] : []}
              style={{marginBottom: 0}}
            >
              {isPath ? renderPathVariableInput(key) : isArtifactSelect ? (
                <Select
                  placeholder="选择构建产物"
                  disabled={isPresetVariable(key)}
                  loading={artifactsLoading}
                  showSearch
                  optionFilterProp="label"
                  options={artifacts.map(a => ({
                    label: `${a.fileName} (${(a.sizeBytes / 1024 / 1024).toFixed(1)} MB)`,
                    value: a.fileName,
                  }))}
                />
              ) : isSelect ? (
                <Select
                  placeholder={`选择${getVariableLabel(key)}`}
                  disabled={isPresetVariable(key)}
                  options={varOptions.map(opt => ({label: opt, value: opt}))}
                />
              ) : (
                <Input
                  placeholder={`输入${getVariableLabel(key)}`}
                  disabled={isPresetVariable(key)}
                />
              )}
            </Form.Item>
          )
        })}
      </Form>
    </div>
  )
}
