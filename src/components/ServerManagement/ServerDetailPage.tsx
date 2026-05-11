import {Button} from '@/components/ui/button'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs'
import {ArrowLeft, Server} from 'lucide-react'
import {useCallback, useEffect, useState} from 'react'
import {api} from '../../services/tauri-api'
import {type ServerDetailTab, useNavigationStore} from '../../store/navigationStore'
import type {ServerProfile} from '../../types/domain'
import {OverviewTab} from './tabs/OverviewTab'
import {RemoteTerminalTab} from './tabs/RemoteTerminalTab'
import {RemoteFilesTab} from './tabs/RemoteFilesTab'
import {RemoteLogsTab} from './tabs/RemoteLogsTab'
import {CommonCommandsTab} from './tabs/CommonCommandsTab'

interface ServerDetailPageProps {
  serverId: string
}

export function ServerDetailPage({ serverId }: ServerDetailPageProps) {
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
          <Button variant="outline" onClick={handleBack}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            返回列表
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">服务器不存在或已被删除。</p>
      </main>
    )
  }

  return (
    <main className="workspace-page">
      <div className="workspace-heading">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleBack}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            返回
          </Button>
          <Server className="h-5 w-5" />
          <h4 className="text-lg font-semibold m-0">
            {server?.name ?? '加载中...'}
          </h4>
          <span className="text-sm text-muted-foreground">
            {server?.host}:{server?.port}
          </span>
        </div>
      </div>

      <Tabs value={serverDetailTab} onValueChange={(key) => setServerDetailTab(key as ServerDetailTab)}>
        <TabsList>
          <TabsTrigger value="overview">概览</TabsTrigger>
          <TabsTrigger value="terminal">终端</TabsTrigger>
          <TabsTrigger value="files">文件</TabsTrigger>
          <TabsTrigger value="logs">日志</TabsTrigger>
          <TabsTrigger value="commands">命令</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          {server ? <OverviewTab server={server} onRefresh={loadServer} /> : null}
        </TabsContent>
        <TabsContent value="terminal">
          {server ? <RemoteTerminalTab server={server} onConnected={loadServer} /> : null}
        </TabsContent>
        <TabsContent value="files">
          {server ? <RemoteFilesTab server={server} /> : null}
        </TabsContent>
        <TabsContent value="logs">
          {server ? <RemoteLogsTab server={server} /> : null}
        </TabsContent>
        <TabsContent value="commands">
          {server ? <CommonCommandsTab server={server} /> : null}
        </TabsContent>
      </Tabs>
    </main>
  )
}