import {Button, Descriptions, Empty, Modal, Space, Table, Tag, Typography} from 'antd'
import type {ColumnsType} from 'antd/es/table'
import {useMemo, useState} from 'react'
import {useWorkflowStore} from '../../store/useWorkflowStore'
import type {TaskPipelineRun} from '../../types/domain'

const {Text} = Typography

const statusColor: Record<TaskPipelineRun['status'], string> = {
  running: 'processing',
  success: 'green',
  failed: 'red',
}

export function TaskPipelineHistoryTable() {
  const taskPipelineRuns = useWorkflowStore((state) => state.taskPipelineRuns)
  const taskPipelineLogsByRunId = useWorkflowStore((state) => state.taskPipelineLogsByRunId)
  const [openRun, setOpenRun] = useState<TaskPipelineRun>()

  const columns: ColumnsType<TaskPipelineRun> = useMemo(() => [
    {
      title: '时间',
      dataIndex: 'startedAt',
      width: 170,
      render: (value: string) => new Date(value).toLocaleString(),
    },
    {
      title: '任务链',
      dataIndex: 'pipelineName',
      width: 180,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (value: TaskPipelineRun['status']) => <Tag color={statusColor[value]}>{value}</Tag>,
    },
    {
      title: '耗时',
      dataIndex: 'totalDurationMs',
      width: 100,
      render: (value: number) => `${Math.max(1, Math.round(value / 1000))}s`,
    },
    {
      title: '步骤',
      width: 260,
      render: (_, record) => {
        const successCount = record.steps.filter((step) => step.status === 'success').length
        const failedStep = record.steps.find((step) => step.status === 'failed')
        return (
          <Text type={failedStep ? 'danger' : 'secondary'}>
            {successCount}/{record.steps.length} 完成
            {failedStep ? ` · 失败于 ${failedStep.label}` : ''}
          </Text>
        )
      },
    },
    {
      title: '操作',
      width: 120,
      render: (_, record) => (
        <Button size="small" onClick={() => setOpenRun(record)}>
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
        dataSource={taskPipelineRuns}
        locale={{emptyText: <Empty description="暂无任务执行记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />}}
        pagination={{pageSize: 6}}
        scroll={{x: 760}}
      />
      <Modal
        title={openRun ? `任务链执行详情 · ${openRun.pipelineName}` : '任务链执行详情'}
        open={Boolean(openRun)}
        footer={null}
        width={860}
        onCancel={() => setOpenRun(undefined)}
      >
        {openRun ? (
          <Space direction="vertical" size={16} style={{width: '100%'}}>
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="状态">
                <Tag color={statusColor[openRun.status]}>{openRun.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="耗时">
                {Math.max(1, Math.round(openRun.totalDurationMs / 1000))}s
              </Descriptions.Item>
              <Descriptions.Item label="开始时间">
                {new Date(openRun.startedAt).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="模块范围">
                {openRun.moduleIds.length > 0 ? openRun.moduleIds.join(', ') : '全部项目'}
              </Descriptions.Item>
            </Descriptions>
            <Table
              rowKey="stepId"
              size="small"
              pagination={false}
              dataSource={openRun.steps}
              columns={[
                {title: '步骤', dataIndex: 'label', width: 160},
                {title: '类型', dataIndex: 'type', width: 120},
                {
                  title: '状态',
                  dataIndex: 'status',
                  width: 100,
                  render: (value: string) => <Tag>{value}</Tag>,
                },
                {
                  title: '结果',
                  render: (_, step) => step.message ?? (step.output[0] ?? '-'),
                },
              ]}
            />
            <div className="workflow-log-panel">
              {(taskPipelineLogsByRunId[openRun.id] ?? []).join('\n') || '暂无执行日志'}
            </div>
          </Space>
        ) : null}
      </Modal>
    </>
  )
}
