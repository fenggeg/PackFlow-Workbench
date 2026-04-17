import { Button, Modal, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useState } from 'react'
import { api } from '../../services/tauri-api'
import { useAppStore } from '../../store/useAppStore'
import type { BuildHistoryRecord } from '../../types/domain'

const { Text } = Typography

const statusColor: Record<BuildHistoryRecord['status'], string> = {
  SUCCESS: 'green',
  FAILED: 'red',
  CANCELLED: 'gold',
}

const historyPath = (record: BuildHistoryRecord) => {
  if (!record.modulePath || record.modulePath.includes(',')) {
    return record.projectRoot
  }
  const normalizedModulePath = record.modulePath.replace(/^\.?[\\/]/, '')
  return `${record.projectRoot}\\${normalizedModulePath}`
}

export function HistoryTable() {
  const history = useAppStore((state) => state.history)
  const rerunHistory = useAppStore((state) => state.rerunHistory)
  const [expanded, setExpanded] = useState(false)

  const columns: ColumnsType<BuildHistoryRecord> = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 170,
      render: (value: string) => new Date(value).toLocaleString(),
    },
    {
      title: '模块',
      dataIndex: 'moduleArtifactId',
      width: 170,
      ellipsis: true,
      render: (_, record) => {
        const moduleLabel = record.moduleArtifactId ?? (record.modulePath || '全部项目')
        return (
          <Text ellipsis={{ tooltip: moduleLabel }}>
            {moduleLabel}
          </Text>
        )
      },
    },
    {
      title: '结果',
      dataIndex: 'status',
      width: 110,
      render: (value: BuildHistoryRecord['status']) => <Tag color={statusColor[value]}>{value}</Tag>,
    },
    {
      title: '耗时',
      dataIndex: 'durationMs',
      width: 90,
      render: (value: number) => `${Math.round(value / 1000)}s`,
    },
    {
      title: '操作',
      width: 150,
      render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => rerunHistory(record)}>
            回填
          </Button>
          <Button size="small" onClick={() => void api.openPathInExplorer(historyPath(record))}>
            打开
          </Button>
        </Space>
      ),
    },
  ]

  const table = (large = false) => (
    <Table
      rowKey="id"
      size={large ? 'middle' : 'small'}
      columns={columns}
      dataSource={history}
      pagination={{ pageSize: large ? 12 : 6 }}
      scroll={{ x: 720 }}
    />
  )

  return (
    <>
      <div className="table-toolbar">
        <Button size="small" onClick={() => setExpanded(true)}>放大</Button>
      </div>
      {table()}
      <Modal
        title="历史记录"
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
