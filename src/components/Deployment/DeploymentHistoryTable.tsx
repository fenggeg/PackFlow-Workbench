import {Button, Descriptions, Empty, Modal, Table, Tag} from 'antd'
import type {ColumnsType} from 'antd/es/table'
import {useMemo, useState} from 'react'
import {useWorkflowStore} from '../../store/useWorkflowStore'
import type {DeploymentTask} from '../../types/domain'

const statusColor: Record<DeploymentTask['status'], string> = {
  pending: 'default',
  uploading: 'processing',
  stopping: 'orange',
  starting: 'cyan',
  checking: 'blue',
  success: 'green',
  failed: 'red',
}

export function DeploymentHistoryTable() {
  const deploymentTasks = useWorkflowStore((state) => state.deploymentTasks)
  const deploymentLogsByTaskId = useWorkflowStore((state) => state.deploymentLogsByTaskId)
  const [openTask, setOpenTask] = useState<DeploymentTask>()

  const columns: ColumnsType<DeploymentTask> = useMemo(() => [
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 170,
      render: (value: string) => new Date(value).toLocaleString(),
    },
    {
      title: '部署配置',
      dataIndex: 'deploymentProfileName',
      width: 180,
      render: (value?: string) => value ?? '-',
    },
    {
      title: '服务器',
      dataIndex: 'serverName',
      width: 150,
      render: (value?: string) => value ?? '-',
    },
    {
      title: '产物',
      dataIndex: 'artifactName',
      width: 180,
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (value: DeploymentTask['status']) => <Tag color={statusColor[value]}>{value}</Tag>,
    },
    {
      title: '操作',
      width: 100,
      render: (_, record) => (
        <Button size="small" onClick={() => setOpenTask(record)}>
          详情
        </Button>
      ),
    },
  ], [])

  return (
    <>
      <Table
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={deploymentTasks}
        locale={{emptyText: <Empty description="暂无部署记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />}}
        pagination={{pageSize: 6}}
        scroll={{x: 820}}
      />
      <Modal
        title={openTask ? `部署详情 · ${openTask.deploymentProfileName ?? openTask.id}` : '部署详情'}
        open={Boolean(openTask)}
        footer={null}
        width={900}
        onCancel={() => setOpenTask(undefined)}
      >
        {openTask ? (
          <>
            <Descriptions size="small" bordered column={2}>
              <Descriptions.Item label="状态">
                <Tag color={statusColor[openTask.status]}>{openTask.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="服务器">
                {openTask.serverName ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="部署配置">
                {openTask.deploymentProfileName ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="模块">
                {openTask.moduleId}
              </Descriptions.Item>
              <Descriptions.Item label="产物" span={2}>
                {openTask.artifactPath}
              </Descriptions.Item>
            </Descriptions>
            <Table
              style={{marginTop: 16}}
              rowKey="key"
              size="small"
              pagination={false}
              dataSource={openTask.stages}
              columns={[
                {title: '阶段', dataIndex: 'label', width: 140},
                {
                  title: '状态',
                  dataIndex: 'status',
                  width: 100,
                  render: (value: string) => <Tag>{value}</Tag>,
                },
                {
                  title: '结果',
                  render: (_, stage) => stage.message ?? '-',
                },
              ]}
            />
            <div className="workflow-log-panel" style={{marginTop: 16}}>
              {(deploymentLogsByTaskId[openTask.id] ?? openTask.log ?? []).join('\n') || '暂无部署日志'}
            </div>
          </>
        ) : null}
      </Modal>
    </>
  )
}
