import {FullscreenOutlined} from '@ant-design/icons'
import {Button, Modal, Popconfirm, Space, Table, Tooltip} from 'antd'
import type {ColumnsType} from 'antd/es/table'
import {useState} from 'react'
import {useAppStore} from '../../store/useAppStore'
import type {BuildTemplate} from '../../types/domain'

export function TemplatePanel() {
  const templates = useAppStore((state) => state.templates)
  const applyTemplate = useAppStore((state) => state.applyTemplate)
  const deleteTemplate = useAppStore((state) => state.deleteTemplate)
  const [expanded, setExpanded] = useState(false)

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

  const table = (large = false) => (
    <Table
      rowKey="id"
      size={large ? 'middle' : 'small'}
      columns={columns}
      dataSource={templates}
      pagination={{ pageSize: large ? 12 : 6 }}
      scroll={{ x: 680 }}
    />
  )

  return (
    <>
      <div className="table-toolbar">
        <Tooltip title="放大查看">
          <Button
            aria-label="放大查看模板"
            icon={<FullscreenOutlined />}
            size="small"
            onClick={() => setExpanded(true)}
          />
        </Tooltip>
      </div>
      {table()}
      <Modal
        title="模板"
        open={expanded}
        footer={null}
        width="88vw"
        onCancel={() => setExpanded(false)}
      >
        {table(true)}
      </Modal>
    </>
  )
}
