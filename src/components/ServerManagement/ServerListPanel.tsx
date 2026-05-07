import {Button, Card, Empty, Input, message, Popconfirm, Select, Space, Table, Tag, Tooltip, Typography,} from 'antd'
import {
  CloudServerOutlined,
  CodeOutlined,
  DeleteOutlined,
  EditOutlined,
  FileOutlined,
  FolderOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  StarFilled,
  StarOutlined,
} from '@ant-design/icons'
import {useCallback, useEffect, useMemo, useState} from 'react'
import {api} from '../../services/tauri-api'
import {useNavigationStore} from '../../store/navigationStore'
import {ServerEditorDrawer} from './ServerEditorDrawer'
import type {ServerProfile} from '../../types/domain'

const {Text} = Typography

const envTypeOptions = [
  {label: '开发', value: 'dev', color: 'blue'},
  {label: '测试', value: 'test', color: 'green'},
  {label: '预发', value: 'staging', color: 'orange'},
  {label: '生产', value: 'prod', color: 'red'},
  {label: '自定义', value: 'custom', color: 'default'},
]

const envTypeLabel = (type?: string) =>
  envTypeOptions.find((opt) => opt.value === type)?.label ?? type ?? ''

const envTypeColor = (type?: string) =>
  envTypeOptions.find((opt) => opt.value === type)?.color ?? 'default'

export function ServerListPanel() {
  const [servers, setServers] = useState<ServerProfile[]>([])
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [envFilter, setEnvFilter] = useState<string>()
  const [groupFilter, setGroupFilter] = useState<string>()
  const [testingId, setTestingId] = useState<string>()
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingServer, setEditingServer] = useState<ServerProfile | null>(null)
  const navigateToServerDetail = useNavigationStore((state) => state.navigateToServerDetail)

  const loadServers = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.listServerProfiles()
      setServers(data)
    } catch (error) {
      message.error(`加载服务器列表失败：${error}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => void loadServers())
  }, [loadServers])

  const groups = useMemo(() => {
    const groupSet = new Set(servers.map((s) => s.group).filter(Boolean))
    return Array.from(groupSet).map((g) => ({label: g!, value: g!}))
  }, [servers])

  const filteredServers = useMemo(() => {
    let result = servers

    if (keyword) {
      const kw = keyword.toLowerCase()
      result = result.filter((s) =>
        [s.name, s.host, s.remark, s.group, ...s.tags]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(kw))
      )
    }

    if (envFilter) {
      result = result.filter((s) => s.envType === envFilter)
    }

    if (groupFilter) {
      result = result.filter((s) => s.group === groupFilter)
    }

    return result
  }, [servers, keyword, envFilter, groupFilter])

  const handleCreate = () => {
    setEditingServer(null)
    setEditorOpen(true)
  }

  const handleEdit = (server: ServerProfile) => {
    setEditingServer(server)
    setEditorOpen(true)
  }

  const handleEditorClose = () => {
    setEditorOpen(false)
    setEditingServer(null)
  }

  const handleTestConnection = async (serverId: string) => {
    setTestingId(serverId)
    try {
      const result = await api.testServerConnection(serverId)
      message.success(result)
    } catch (error) {
      message.error(`连接测试失败：${error}`)
    } finally {
      setTestingId(undefined)
    }
  }

  const handleToggleFavorite = async (server: ServerProfile) => {
    try {
      await api.saveServerProfile({
        ...server,
        favorite: !server.favorite,
      })
      await loadServers()
    } catch (error) {
      message.error(`操作失败：${error}`)
    }
  }

  const handleDelete = async (serverId: string) => {
    try {
      await api.deleteServerProfile(serverId)
      message.success('删除成功')
      await loadServers()
    } catch (error) {
      message.error(`删除失败：${error}`)
    }
  }

  const columns = [
    {
      title: '',
      width: 40,
      render: (_: unknown, record: ServerProfile) => (
        <Button
          type="text"
          size="small"
          icon={record.favorite ? <StarFilled style={{color: '#faad14'}} /> : <StarOutlined />}
          onClick={() => void handleToggleFavorite(record)}
        />
      ),
    },
    {
      title: '服务器名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: ServerProfile) => (
        <Space>
          <CloudServerOutlined />
          <a onClick={() => navigateToServerDetail(record.id)}>{name}</a>
        </Space>
      ),
    },
    {
      title: '主机地址',
      key: 'host',
      render: (_: unknown, record: ServerProfile) => (
        <Text copyable>{record.host}:{record.port}</Text>
      ),
    },
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
    },
    {
      title: '环境',
      key: 'envType',
      render: (_: unknown, record: ServerProfile) =>
        record.envType ? <Tag color={envTypeColor(record.envType)}>{envTypeLabel(record.envType)}</Tag> : null,
    },
    {
      title: '分组',
      dataIndex: 'group',
      key: 'group',
      render: (group: string) => group ? <Tag>{group}</Tag> : null,
    },
    {
      title: '标签',
      key: 'tags',
      render: (_: unknown, record: ServerProfile) =>
        record.tags?.map((tag) => <Tag key={tag}>{tag}</Tag>),
    },
    {
      title: '操作',
      key: 'actions',
      width: 280,
      render: (_: unknown, record: ServerProfile) => (
        <Space size="small">
          <Tooltip title="终端">
            <Button
              size="small"
              icon={<CodeOutlined />}
              onClick={() => navigateToServerDetail(record.id, 'terminal')}
            />
          </Tooltip>
          <Tooltip title="文件">
            <Button
              size="small"
              icon={<FolderOutlined />}
              onClick={() => navigateToServerDetail(record.id, 'files')}
            />
          </Tooltip>
          <Tooltip title="日志">
            <Button
              size="small"
              icon={<FileOutlined />}
              onClick={() => navigateToServerDetail(record.id, 'logs')}
            />
          </Tooltip>
          <Button
            size="small"
            loading={testingId === record.id}
            onClick={() => void handleTestConnection(record.id)}
          >
            测试
          </Button>
          <Tooltip title="编辑">
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          <Popconfirm
            title="确定删除该服务器？"
            onConfirm={() => void handleDelete(record.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <>
    <Card
      className="panel-card"
      size="small"
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void loadServers()}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            新增服务器
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" size={12} style={{width: '100%'}}>
        <Space wrap>
          <Input
            placeholder="搜索名称、IP、标签、备注"
            prefix={<SearchOutlined />}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{width: 280}}
            allowClear
          />
          <Select
            placeholder="环境"
            value={envFilter}
            onChange={setEnvFilter}
            options={envTypeOptions}
            allowClear
            style={{width: 120}}
          />
          <Select
            placeholder="分组"
            value={groupFilter}
            onChange={setGroupFilter}
            options={groups}
            allowClear
            style={{width: 150}}
          />
        </Space>

        <Table
          dataSource={filteredServers}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={false}
          locale={{
            emptyText: <Empty description="暂无服务器配置" />,
          }}
        />
      </Space>
    </Card>
    <ServerEditorDrawer
      open={editorOpen}
      server={editingServer}
      onClose={handleEditorClose}
      onSaved={() => void loadServers()}
    />
    </>
  )
}
