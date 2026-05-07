import {Button, Space, Tabs, Typography} from 'antd'
import {ArrowLeftOutlined, CloudServerOutlined} from '@ant-design/icons'
import {useCallback, useEffect, useState} from 'react'
import {api} from '../../services/tauri-api'
import {type ServerDetailTab, useNavigationStore} from '../../store/navigationStore'
import type {ServerProfile} from '../../types/domain'
import {OverviewTab} from './tabs/OverviewTab'
import {RemoteTerminalTab} from './tabs/RemoteTerminalTab'
import {RemoteFilesTab} from './tabs/RemoteFilesTab'
import {RemoteLogsTab} from './tabs/RemoteLogsTab'
import {CommonCommandsTab} from './tabs/CommonCommandsTab'

const {Title, Text} = Typography

interface ServerDetailPageProps {
  serverId: string
}

export function ServerDetailPage({serverId}: ServerDetailPageProps) {
  const [server, setServer] = useState<ServerProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const serverDetailTab = useNavigationStore((state) => state.serverDetailTab)
  const setServerDetailTab = useNavigationStore((state) => state.setServerDetailTab)
  const setSelectedServerId = useNavigationStore((state) => state.setSelectedServerId)

  const loadServer = useCallback(async () => {
    setLoading(true)
    try {
      const servers = await api.listServerProfiles()
      const found = servers.find((s) => s.id === serverId)
      setServer(found ?? null)
    } catch (error) {
      console.error('加载服务器详情失败：', error)
    } finally {
      setLoading(false)
    }
  }, [serverId])

  useEffect(() => {
    queueMicrotask(() => void loadServer())
  }, [loadServer])

  const handleBack = () => {
    setSelectedServerId(undefined)
  }

  if (!server && !loading) {
    return (
      <main className="workspace-page">
        <div className="workspace-heading">
          <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>
            返回列表
          </Button>
        </div>
        <Text type="secondary">服务器不存在或已被删除。</Text>
      </main>
    )
  }

  return (
    <main className="workspace-page">
      <div className="workspace-heading">
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>
            返回
          </Button>
          <CloudServerOutlined />
          <Title level={4} style={{margin: 0}}>
            {server?.name ?? '加载中...'}
          </Title>
          <Text type="secondary">
            {server?.host}:{server?.port}
          </Text>
        </Space>
      </div>

      <Tabs
        activeKey={serverDetailTab}
        onChange={(key) => setServerDetailTab(key as ServerDetailTab)}
        items={[
          {
            key: 'overview',
            label: '概览',
            children: server ? <OverviewTab server={server} onRefresh={loadServer} /> : null,
          },
          {
            key: 'terminal',
            label: '终端',
            children: server ? <RemoteTerminalTab server={server} onConnected={loadServer} /> : null,
          },
          {
            key: 'files',
            label: '文件',
            children: server ? <RemoteFilesTab server={server} /> : null,
          },
          {
            key: 'logs',
            label: '日志',
            children: server ? <RemoteLogsTab server={server} /> : null,
          },
          {
            key: 'commands',
            label: '命令',
            children: server ? <CommonCommandsTab server={server} /> : null,
          },
        ]}
      />
    </main>
  )
}
