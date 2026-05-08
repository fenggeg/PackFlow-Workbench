import {Button, Card, Descriptions, message, Space, Tag, Typography} from 'antd'
import {CloudServerOutlined, CodeOutlined, FolderOutlined, ReloadOutlined,} from '@ant-design/icons'
import {useState} from 'react'
import {api} from '../../../services/tauri-api'
import {useNavigationStore} from '../../../store/navigationStore'
import type {ServerPrivilegeMode, ServerProfile} from '../../../types/domain'

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

const privilegeModeOptions: {label: string; value: ServerPrivilegeMode}[] = [
  {label: '不提权（普通账号直接执行）', value: 'none'},
  {label: 'sudo（用指定用户执行）', value: 'sudo'},
  {label: 'sudo -i（带登录环境执行）', value: 'sudo_i'},
  {label: 'su（切换到指定用户）', value: 'su'},
  {label: '自定义命令包装（高级）', value: 'custom'},
]

const privilegeModeLabel = (mode?: string) =>
  privilegeModeOptions.find((option) => option.value === mode)?.label ?? mode ?? '不提权'

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
          <Descriptions.Item label="提权方式">
            {server.privilege?.mode && server.privilege.mode !== 'none' ? (
              <Space size={6} wrap>
                <Tag color="purple">{privilegeModeLabel(server.privilege.mode)}</Tag>
                <Text type="secondary">执行用户：{server.privilege.runAsUser}</Text>
              </Space>
            ) : (
              <Tag>不提权</Tag>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="提权密码">
            {server.privilege?.mode && server.privilege.mode !== 'none'
              ? (
                <Space size={6} wrap>
                  <Tag>{server.privilege.passwordMode === 'login_password' ? '使用登录密码' : server.privilege.passwordMode === 'separate' ? '独立密码' : '不需要密码'}</Tag>
                  {server.privilegePasswordConfigured ? <Tag color="gold">已保存</Tag> : null}
                </Space>
              )
              : '未启用'}
          </Descriptions.Item>
          {server.privilege?.mode && server.privilege.mode !== 'none' ? (
            <>
              <Descriptions.Item label="上传暂存目录">{server.privilege.uploadTempDir}</Descriptions.Item>
              <Descriptions.Item label="执行 Shell">{server.privilege.shell}</Descriptions.Item>
            </>
          ) : null}
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
