import {Button, Card, Empty, Input, message, Modal, Popconfirm, Select, Space, Table, Tag, Typography,} from 'antd'
import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import {useCallback, useEffect, useState} from 'react'
import {api} from '../../../services/tauri-api'
import type {CommonCommand, ServerProfile} from '../../../types/domain'

const {Text} = Typography

interface CommonCommandsTabProps {
  server: ServerProfile
}

const riskLevelOptions = [
  {label: '安全', value: 'safe', color: 'green'},
  {label: '警告', value: 'warning', color: 'orange'},
  {label: '危险', value: 'danger', color: 'red'},
]

const riskLevelColor = (level: string) =>
  riskLevelOptions.find((opt) => opt.value === level)?.color ?? 'default'

const categoryOptions = [
  '系统巡检',
  'Java 应用',
  'Docker',
  'Nginx',
  '日志查看',
  '服务启停',
  '自定义脚本',
]

const dangerousPatterns = [
  'rm -rf',
  'reboot',
  'shutdown',
  'mkfs',
  'dd',
  'kill -9',
  'systemctl stop',
  'docker rm',
  'docker rmi',
]

const isDangerousCommand = (command: string) =>
  dangerousPatterns.some((pattern) => command.includes(pattern))

export function CommonCommandsTab({server}: CommonCommandsTabProps) {
  const [commands, setCommands] = useState<CommonCommand[]>([])
  const [loading, setLoading] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingCommand, setEditingCommand] = useState<CommonCommand | null>(null)
  const [formName, setFormName] = useState('')
  const [formCommand, setFormCommand] = useState('')
  const [formCategory, setFormCategory] = useState('')
  const [formRiskLevel, setFormRiskLevel] = useState<string>('safe')
  const [formDescription, setFormDescription] = useState('')
  const [executing, setExecuting] = useState<string>()

  const loadCommands = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.listCommonCommands(server.id)
      setCommands(data)
    } catch (error) {
      message.error(`加载常用命令失败：${error}`)
    } finally {
      setLoading(false)
    }
  }, [server.id])

  useEffect(() => {
    queueMicrotask(() => void loadCommands())
  }, [loadCommands])

  const handleOpenCreate = () => {
    setEditingCommand(null)
    setFormName('')
    setFormCommand('')
    setFormCategory('')
    setFormRiskLevel('safe')
    setFormDescription('')
    setEditorOpen(true)
  }

  const handleOpenEdit = (cmd: CommonCommand) => {
    setEditingCommand(cmd)
    setFormName(cmd.name)
    setFormCommand(cmd.command)
    setFormCategory(cmd.category)
    setFormRiskLevel(cmd.riskLevel)
    setFormDescription(cmd.description ?? '')
    setEditorOpen(true)
  }

  const handleSave = async () => {
    if (!formName.trim() || !formCommand.trim()) {
      message.warning('名称和命令不能为空')
      return
    }

    try {
      await api.saveCommonCommand({
        id: editingCommand?.id ?? '',
        name: formName,
        command: formCommand,
        category: formCategory,
        scope: 'server',
        serverId: server.id,
        riskLevel: formRiskLevel as CommonCommand['riskLevel'],
        description: formDescription || undefined,
      })
      message.success('保存成功')
      setEditorOpen(false)
      await loadCommands()
    } catch (error) {
      message.error(`保存失败：${error}`)
    }
  }

  const handleDelete = async (commandId: string) => {
    try {
      await api.deleteCommonCommand(commandId)
      message.success('删除成功')
      await loadCommands()
    } catch (error) {
      message.error(`删除失败：${error}`)
    }
  }

  const handleExecute = async (cmd: CommonCommand) => {
    if (isDangerousCommand(cmd.command)) {
      Modal.confirm({
        title: '危险命令确认',
        icon: <ExclamationCircleOutlined />,
        content: (
          <div>
            <p>该命令可能影响服务器或业务运行：</p>
            <Text code>{cmd.command}</Text>
            <p>确定要执行吗？</p>
          </div>
        ),
        okText: '执行',
        cancelText: '取消',
        okType: 'danger',
        onOk: async () => {
          await executeCommand(cmd)
        },
      })
    } else {
      await executeCommand(cmd)
    }
  }

  const executeCommand = async (cmd: CommonCommand) => {
    setExecuting(cmd.id)
    try {
      const result = await api.executeRemoteCommand(server.id, cmd.command)
      if (result.success) {
        message.success('执行成功')
        Modal.info({
          title: `执行结果：${cmd.name}`,
          width: 600,
          content: (
            <pre
              style={{
                maxHeight: '400px',
                overflow: 'auto',
                backgroundColor: '#f5f5f5',
                padding: '12px',
                borderRadius: '4px',
              }}
            >
              {result.output || '无输出'}
            </pre>
          ),
        })
      } else {
        message.error(`执行失败，退出码：${result.exitCode}`)
      }
    } catch (error) {
      message.error(`执行失败：${error}`)
    } finally {
      setExecuting(undefined)
    }
  }

  const handleCopy = (command: string) => {
    navigator.clipboard.writeText(command)
    message.success('已复制到剪贴板')
  }

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '命令',
      key: 'command',
      ellipsis: true,
      render: (_: unknown, record: CommonCommand) => (
        <Text code style={{maxWidth: 400}}>
          {record.command}
        </Text>
      ),
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      render: (category: string) => category ? <Tag>{category}</Tag> : null,
    },
    {
      title: '风险',
      key: 'riskLevel',
      render: (_: unknown, record: CommonCommand) => (
        <Tag color={riskLevelColor(record.riskLevel)}>
          {riskLevelOptions.find((opt) => opt.value === record.riskLevel)?.label ?? record.riskLevel}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (_: unknown, record: CommonCommand) => (
        <Space size="small">
          <Button
            size="small"
            type="primary"
            icon={<PlayCircleOutlined />}
            loading={executing === record.id}
            onClick={() => void handleExecute(record)}
          >
            执行
          </Button>
          <Button
            size="small"
            icon={<CopyOutlined />}
            onClick={() => handleCopy(record.command)}
          >
            复制
          </Button>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleOpenEdit(record)}
          />
          <Popconfirm
            title="确定删除？"
            onConfirm={() => void handleDelete(record.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Card
      title={
        <Space>
          <WarningOutlined />
          <span>常用命令</span>
        </Space>
      }
      size="small"
      extra={
        <Space>
          <Button size="small" icon={<ReloadOutlined />} onClick={() => void loadCommands()}>
            刷新
          </Button>
          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate}>
            新增命令
          </Button>
        </Space>
      }
    >
      <Table
        dataSource={commands}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={false}
        locale={{
          emptyText: <Empty description="暂无常用命令" />,
        }}
      />

      <Modal
        title={editingCommand ? '编辑命令' : '新增命令'}
        open={editorOpen}
        onOk={() => void handleSave()}
        onCancel={() => setEditorOpen(false)}
        width={600}
      >
        <Space direction="vertical" size={12} style={{width: '100%'}}>
          <div>
            <Text type="secondary">名称</Text>
            <Input
              placeholder="命令名称"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </div>
          <div>
            <Text type="secondary">命令</Text>
            <Input.TextArea
              placeholder="要执行的命令"
              value={formCommand}
              onChange={(e) => setFormCommand(e.target.value)}
              rows={3}
            />
          </div>
          <div>
            <Text type="secondary">分类</Text>
            <Select
              placeholder="选择或输入分类"
              value={formCategory || undefined}
              onChange={setFormCategory}
              options={categoryOptions.map((c) => ({label: c, value: c}))}
              allowClear
              style={{width: '100%'}}
            />
          </div>
          <div>
            <Text type="secondary">风险等级</Text>
            <Select
              value={formRiskLevel}
              onChange={setFormRiskLevel}
              options={riskLevelOptions.map((opt) => ({
                label: opt.label,
                value: opt.value,
              }))}
              style={{width: '100%'}}
            />
          </div>
          <div>
            <Text type="secondary">说明</Text>
            <Input
              placeholder="可选"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
            />
          </div>
        </Space>
      </Modal>
    </Card>
  )
}
