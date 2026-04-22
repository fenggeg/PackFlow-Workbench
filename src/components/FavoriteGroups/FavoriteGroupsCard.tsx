import {Button, Card, Empty, Input, List, Modal, Space, Typography} from 'antd'
import {SaveOutlined} from '@ant-design/icons'
import {useState} from 'react'
import {useAppStore} from '../../store/useAppStore'

const { Text } = Typography

export function FavoriteGroupsCard() {
  const project = useAppStore((state) => state.project)
  const templates = useAppStore((state) => state.templates)
  const applyTemplate = useAppStore((state) => state.applyTemplate)
  const saveTemplate = useAppStore((state) => state.saveTemplate)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')

  return (
    <Card
      title="常用组合"
      className="panel-card favorite-groups-card"
      size="small"
      extra={
        <Button
          size="small"
          type="text"
          icon={<SaveOutlined />}
          disabled={!project}
          onClick={() => setSaving(true)}
        />
      }
    >
      {templates.length === 0 ? (
        <Empty description="暂无常用组合" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <List
          size="small"
          dataSource={templates}
          renderItem={(template) => (
            <List.Item
              actions={[
                <Button key="apply" size="small" onClick={() => applyTemplate(template)}>
                  应用
                </Button>,
              ]}
            >
              <Space className="favorite-item">
                <Text strong ellipsis={{ tooltip: template.name }}>{template.name}</Text>
              </Space>
            </List.Item>
          )}
        />
      )}

      <Modal
        title="保存当前选择为常用组合"
        open={saving}
        okText="保存"
        cancelText="取消"
        onCancel={() => setSaving(false)}
        onOk={() => {
          if (name.trim()) {
            void saveTemplate(name.trim())
            setName('')
            setSaving(false)
          }
        }}
      >
        <Input
          placeholder="例如 网关联调"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Modal>
    </Card>
  )
}
