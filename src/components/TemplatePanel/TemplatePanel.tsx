import { Button, Popconfirm, Space, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useAppStore } from '../../store/useAppStore'
import type { BuildTemplate } from '../../types/domain'

export function TemplatePanel() {
  const templates = useAppStore((state) => state.templates)
  const applyTemplate = useAppStore((state) => state.applyTemplate)
  const deleteTemplate = useAppStore((state) => state.deleteTemplate)

  const columns: ColumnsType<BuildTemplate> = [
    {
      title: '名称',
      dataIndex: 'name',
      width: 160,
    },
    {
      title: '模块',
      dataIndex: 'modulePath',
      render: (value: string) => value || '全部项目',
    },
    {
      title: 'Goals',
      dataIndex: 'goals',
      width: 140,
      render: (value: string[]) => value.join(' '),
    },
    {
      title: '操作',
      width: 160,
      render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => applyTemplate(record)}>
            应用
          </Button>
          <Popconfirm
            title="删除模板？"
            okText="删除"
            cancelText="取消"
            onConfirm={() => void deleteTemplate(record.id)}
          >
            <Button size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Table
      rowKey="id"
      size="small"
      columns={columns}
      dataSource={templates}
      pagination={{ pageSize: 6 }}
      scroll={{ x: 680 }}
    />
  )
}
