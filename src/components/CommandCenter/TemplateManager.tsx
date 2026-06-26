import {useState, useCallback} from 'react'
import {Card, Button, Space, Tag, Modal, Empty, Tooltip, Typography, Spin, message} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CopyOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import type {CommandTemplate} from '../../types/domain'
import {useCommandStore} from '../../store/useCommandStore'
import {TemplateEditor} from './TemplateEditor'

const {Text} = Typography

interface TemplateManagerProps {
  selectedTemplateId?: string
  onSelectTemplate: (templateId: string | undefined) => void
}

export function TemplateManager({selectedTemplateId, onSelectTemplate}: TemplateManagerProps) {
  const {templates, templatesLoading, deleteTemplate, loadTemplates} = useCommandStore()
  const [showEditor, setShowEditor] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<CommandTemplate>()

  const handleEdit = useCallback((template: CommandTemplate) => {
    setEditingTemplate(template)
    setShowEditor(true)
  }, [])

  const handleCreate = useCallback(() => {
    setEditingTemplate(undefined)
    setShowEditor(true)
  }, [])

  const handleDelete = useCallback(async (templateId: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这个模板吗？删除后无法恢复。',
      okType: 'danger',
      onOk: async () => {
        try {
          await deleteTemplate(templateId)
          if (selectedTemplateId === templateId) {
            onSelectTemplate(undefined)
          }
          message.success('删除成功')
        } catch (error) {
          message.error(`删除失败: ${error}`)
        }
      },
    })
  }, [deleteTemplate, selectedTemplateId, onSelectTemplate])

  const handleDuplicate = useCallback(async (template: CommandTemplate, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setEditingTemplate({
      ...template,
      id: undefined as unknown as string,
      name: `${template.name} (副本)`,
    })
    setShowEditor(true)
  }, [])

  const handleEditorClose = useCallback(() => {
    setShowEditor(false)
    setEditingTemplate(undefined)
    loadTemplates()
  }, [loadTemplates])

  const getStepSummary = (template: CommandTemplate) => {
    const uploadCount = template.steps.filter(s => s.type === 'upload').length
    const commandCount = template.steps.filter(s => s.type === 'command').length
    const waitCount = template.steps.filter(s => s.type === 'wait').length
    const parts = []
    if (uploadCount > 0) parts.push(`${uploadCount}个上传`)
    if (commandCount > 0) parts.push(`${commandCount}个命令`)
    if (waitCount > 0) parts.push(`${waitCount}个等待`)
    return parts.join('、') || '无步骤'
  }

  return (
    <>
      <Card
        title="模板管理"
        size="small"
        extra={
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleCreate}>
            新建模板
          </Button>
        }
        style={{height: '100%'}}
        styles={{body: {overflowY: 'auto', maxHeight: 400, scrollbarGutter: 'stable'}}}
      >
        {templatesLoading ? (
          <div style={{textAlign: 'center', padding: 24}}><Spin size="small" /></div>
        ) : templates.length === 0 ? (
          <Empty
            description="暂无模板"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
              创建第一个模板
            </Button>
          </Empty>
        ) : (
          <div>
            {templates.map(template => {
              const isActive = selectedTemplateId === template.id
              return (
                <div
                  key={template.id}
                  className={`cc-template-item${isActive ? ' cc-template-item--active' : ''}`}
                  onClick={() => onSelectTemplate(template.id)}
                >
                  <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                    <div style={{flex: 1, minWidth: 0}}>
                      <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
                        <ThunderboltOutlined style={{color: isActive ? '#16a34a' : '#999'}} />
                        <Text strong={isActive} ellipsis>{template.name}</Text>
                        <Tag color="green" style={{visibility: isActive ? 'visible' : 'hidden', flexShrink: 0}}>已选中</Tag>
                      </div>
                      <div style={{marginTop: 2}}>
                        <Text type="secondary" style={{fontSize: 12}}>
                          {getStepSummary(template)}
                        </Text>
                        {template.description && (
                          <Text type="secondary" style={{fontSize: 12}} ellipsis> · {template.description}</Text>
                        )}
                      </div>
                    </div>
                    <Space size={0} style={{flexShrink: 0, marginLeft: 8}}>
                      <Tooltip title="编辑">
                        <Button
                          type="text"
                          size="small"
                          icon={<EditOutlined />}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleEdit(template)
                          }}
                        />
                      </Tooltip>
                      <Tooltip title="复制">
                        <Button
                          type="text"
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={(e) => handleDuplicate(template, e)}
                        />
                      </Tooltip>
                      <Tooltip title="删除">
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={(e) => handleDelete(template.id, e)}
                        />
                      </Tooltip>
                    </Space>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <TemplateEditor
        visible={showEditor}
        template={editingTemplate}
        onClose={handleEditorClose}
      />
    </>
  )
}
