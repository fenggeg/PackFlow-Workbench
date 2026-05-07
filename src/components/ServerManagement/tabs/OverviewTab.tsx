import {Button, Card, Descriptions, message, Space, Tag, Typography} from 'antd'
import {CloudServerOutlined, CodeOutlined, FolderOutlined, ReloadOutlined,} from '@ant-design/icons'
import {useState} from 'react'
import {api} from '../../../services/tauri-api'
import {useNavigationStore} from '../../../store/navigationStore'
import type {ServerProfile} from '../../../types/domain'

const {Text} = Typography

const envTypeOptions = [
  {label: '开发', value: 'dev', color: 'blue'},
  {label: '测试', value: 'test', color: 'green'},
  {label: '预发', value: 'staging', color: 'orange'},
  {label: '生产', value: 'prod', color: 'red'},
  {label: '自定义', value: 'custom', color: 'default'},
]

const envTypeLabel = (type?: string) =>
  envTypeOptions.find((opt) => opt.value === type)?.label ?? type ?? '未设置'

const envTypeColor = (type?: string) =>
  envTypeOptions.find((opt) => opt.value === type)?.color ?? 'default'

interface OverviewTabProps {
  server: ServerProfile
  onRefresh: () => Promise<void>
}

export function OverviewTab({server, onRefresh}: OverviewTabProps) {
  const [testing, setTesting] = useState(false)
  const setServerDetailTab = useNavigationStore((state) => state.setServerDetailTab)

  const handleTestConnection = async () => {
    setTesting(true)
    try {
      const result = await api.testServerConnection(server.id)
      message.success(result)
      await onRefresh()
    } catch (error) {
      message.error(`连接测试失败：${error}`)
    } finally {
      setTesting(false)
    }
  }

  return (
    <Space direction="vertical" size={16} style={{width: '100%'}}>
      <Card title="基础信息" size="small">
        <Descriptions column={2} size="small">
          <Descriptions.Item label="服务器名称">{server.name}</Descriptions.Item>
          <Descriptions.Item label="主机地址">
            <Text copyable>{server.host}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="SSH 端口">{server.port}</Descriptions.Item>
          <Descriptions.Item label="用户名">{server.username}</Descriptions.Item>
          <Descriptions.Item label="认证方式">
            {server.authType === 'password' ? '密码' : '私钥'}
          </Descriptions.Item>
          <Descriptions.Item label="环境">
            <Tag color={envTypeColor(server.envType)}>{envTypeLabel(server.envType)}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="分组">{server.group ?? '未分组'}</Descriptions.Item>
          <Descriptions.Item label="标签">
            {server.tags?.length > 0
              ? server.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)
              : '无'}
          </Descriptions.Item>
          <Descriptions.Item label="备注" span={2}>
            {server.remark ?? '无'}
          </Descriptions.Item>
          <Descriptions.Item label="最近连接">
            {server.lastConnectedAt
              ? new Date(server.lastConnectedAt).toLocaleString()
              : '未连接过'}
          </Descriptions.Item>
          <Descriptions.Item label="创建时间">
            {server.createdAt ? new Date(server.createdAt).toLocaleString() : '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="快捷操作" size="small">
        <Space wrap>
          <Button
            type="primary"
            icon={<CodeOutlined />}
            onClick={() => setServerDetailTab('terminal')}
          >
            打开终端
          </Button>
          <Button
            icon={<FolderOutlined />}
            onClick={() => setServerDetailTab('files')}
          >
            文件管理
          </Button>
          <Button
            icon={<CloudServerOutlined />}
            loading={testing}
            onClick={() => void handleTestConnection()}
          >
            测试连接
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => void onRefresh()}
          >
            刷新信息
          </Button>
        </Space>
      </Card>
    </Space>
  )
}
