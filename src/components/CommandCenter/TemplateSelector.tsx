import {useState, useCallback} from 'react'
import {Select, Button, Space, Tag, message} from 'antd'
import {
  ReloadOutlined,
  PlayCircleOutlined,
  StopOutlined,
} from '@ant-design/icons'
import type {CommandTemplate, ServerProfile, StartCommandExecutionPayload} from '../../types/domain'
import {useCommandStore} from '../../store/useCommandStore'

interface TemplateSelectorProps {
  templates: CommandTemplate[]
  loading: boolean
  serverProfiles: ServerProfile[]
  currentExecutionId: string | null
  executionStatus: string
  selectedTemplateId?: string
  onSelectTemplate: (templateId: string | undefined) => void
  onRefresh: () => void
  onReset: () => void
}

export function TemplateSelector({
  templates,
  loading,
  serverProfiles,
  currentExecutionId,
  executionStatus,
  selectedTemplateId,
  onSelectTemplate,
  onRefresh,
  onReset,
}: TemplateSelectorProps) {
  const [selectedServerId, setSelectedServerId] = useState<string>()

  const {
    startExecution,
    cancelExecution,
  } = useCommandStore()

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId)

  const handleStart = useCallback(async () => {
    if (!selectedTemplateId || !selectedServerId) {
      message.warning('请选择模板和服务器')
      return
    }

    try {
      const payload: StartCommandExecutionPayload = {
        templateId: selectedTemplateId,
        serverId: selectedServerId,
        variables: {},
      }
      await startExecution(payload)
      message.success('执行已开始')
    } catch (error) {
      message.error(`执行失败: ${error}`)
    }
  }, [selectedTemplateId, selectedServerId, startExecution])

  const handleCancel = useCallback(async () => {
    if (!currentExecutionId) return

    try {
      await cancelExecution(currentExecutionId)
      message.info('已请求取消执行')
    } catch (error) {
      message.error(`取消失败: ${error}`)
    }
  }, [currentExecutionId, cancelExecution])

  const isRunning = executionStatus === 'running'

  return (
    <div>
      <div style={{marginBottom: 12}}>
        <div style={{marginBottom: 8, fontWeight: 500}}>执行配置</div>
        
        {/* 模板选择 */}
        <div style={{marginBottom: 12}}>
          <div style={{marginBottom: 4, fontSize: 12, color: '#666'}}>选择模板</div>
          <Select
            placeholder="选择命令模板"
            style={{width: '100%'}}
            loading={loading}
            value={selectedTemplateId}
            onChange={onSelectTemplate}
            options={templates.map(t => ({
              label: t.name,
              value: t.id,
            }))}
          />
          {selectedTemplate && (
            <div style={{marginTop: 4}}>
              <Space size={4} wrap>
                {selectedTemplate.steps.map(step => (
                  <Tag key={step.id} color={step.type === 'upload' ? 'blue' : step.type === 'wait' ? 'orange' : 'green'}>
                    {step.type === 'upload' ? '上传' : step.type === 'wait' ? '等待' : '命令'}
                  </Tag>
                ))}
              </Space>
            </div>
          )}
        </div>

        {/* 服务器选择 */}
        <div style={{marginBottom: 12}}>
          <div style={{marginBottom: 4, fontSize: 12, color: '#666'}}>目标服务器</div>
          <Select
            showSearch
            placeholder="搜索或选择目标服务器"
            style={{width: '100%'}}
            value={selectedServerId}
            onChange={setSelectedServerId}
            filterOption={(input, option) =>
              (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
            options={serverProfiles.map(s => ({
              label: `${s.name} (${s.username}@${s.host}:${s.port})`,
              value: s.id,
            }))}
          />
        </div>
      </div>

      {/* 操作按钮 */}
      <Space>
        <Button
          icon={<ReloadOutlined />}
          onClick={onRefresh}
          title="刷新模板列表"
        />

        {isRunning ? (
          <Button
            type="primary"
            danger
            icon={<StopOutlined />}
            onClick={handleCancel}
          >
            停止执行
          </Button>
        ) : (
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            disabled={!selectedTemplateId || !selectedServerId}
            onClick={handleStart}
          >
            开始执行
          </Button>
        )}

        {currentExecutionId && !isRunning && (
          <Button onClick={onReset}>
            重置
          </Button>
        )}
      </Space>
    </div>
  )
}
