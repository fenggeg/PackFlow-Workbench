import {useEffect, useState} from 'react'
import {Card, Row, Col} from 'antd'
import {useCommandStore} from '../../store/useCommandStore'
import {useWorkflowStore} from '../../store/useWorkflowStore'
import {TemplateManager} from './TemplateManager'
import {TemplateSelector} from './TemplateSelector'
import {VariableEditor} from './VariableEditor'
import {ExecutionLog} from './ExecutionLog'
import {ExecutionHistory} from './ExecutionHistory'

export function CommandCenterPanel() {
  const {
    templates,
    templatesLoading,
    loadTemplates,
    currentExecutionId,
    currentExecutionStatus,
    resetCurrentExecution,
  } = useCommandStore()

  const {serverProfiles, initialize: initWorkflow} = useWorkflowStore()
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>()
  const [templateVariables, setTemplateVariables] = useState<Record<string, string>>({})

  useEffect(() => {
    loadTemplates()
    initWorkflow()
    useCommandStore.getState().registerEvents()

    return () => {
      useCommandStore.getState().cleanupEventListeners()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{height: '100%', display: 'flex', flexDirection: 'column', gap: 16}}>
      {/* 顶部：模板管理和执行控制 */}
      <Row gutter={16} style={{flexShrink: 0}}>
        {/* 左侧：模板列表 */}
        <Col span={8}>
          <TemplateManager
            selectedTemplateId={selectedTemplateId}
            onSelectTemplate={setSelectedTemplateId}
          />
        </Col>
        
        {/* 右侧：执行控制 */}
        <Col span={16}>
          <Card size="small" style={{height: '100%'}}>
            <TemplateSelector
              templates={templates}
              loading={templatesLoading}
              serverProfiles={serverProfiles}
              currentExecutionId={currentExecutionId}
              executionStatus={currentExecutionStatus}
              selectedTemplateId={selectedTemplateId}
              onSelectTemplate={setSelectedTemplateId}
              onRefresh={loadTemplates}
              onReset={resetCurrentExecution}
              variables={templateVariables}
            />
          </Card>
        </Col>
      </Row>

      {/* 中部变量编辑区 */}
      <Card size="small" style={{flexShrink: 0}}>
        <VariableEditor
          selectedTemplateId={selectedTemplateId}
          onVariablesChange={setTemplateVariables}
        />
      </Card>

      {/* 下部日志和历史区 */}
      <Row gutter={16} style={{flex: 1, minHeight: 0}}>
        <Col span={16} style={{height: '100%'}}>
          <ExecutionLog />
        </Col>
        <Col span={8} style={{height: '100%'}}>
          <ExecutionHistory />
        </Col>
      </Row>
    </div>
  )
}
