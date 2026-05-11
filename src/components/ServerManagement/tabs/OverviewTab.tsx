import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle,} from '@/components/ui/card'
import {Code, Folder, RefreshCw, Server} from 'lucide-react'
import {useState} from 'react'
import {api} from '../../../services/tauri-api'
import {useNavigationStore} from '../../../store/navigationStore'
import type {ServerPrivilegeMode, ServerProfile} from '../../../types/domain'

const envTypeOptions = [
  { label: '开发', value: 'dev', className: 'bg-blue-500 text-white' },
  { label: '测试', value: 'test', className: 'bg-green-500 text-white' },
  { label: '预发', value: 'staging', className: 'bg-orange-500 text-white' },
  { label: '生产', value: 'prod', className: 'bg-red-500 text-white' },
  { label: '自定义', value: 'custom', className: 'bg-secondary text-secondary-foreground' },
]

const envTypeLabel = (type?: string) =>
  envTypeOptions.find((opt) => opt.value === type)?.label ?? type ?? '未设置'

const envTypeClass = (type?: string) =>
  envTypeOptions.find((opt) => opt.value === type)?.className ?? 'bg-secondary text-secondary-foreground'

const privilegeModeOptions: { label: string; value: ServerPrivilegeMode }[] = [
  { label: '不提权（普通账号直接执行）', value: 'none' },
  { label: 'sudo（用指定用户执行）', value: 'sudo' },
  { label: 'sudo -i（带登录环境执行）', value: 'sudo_i' },
  { label: 'su（切换到指定用户）', value: 'su' },
  { label: '自定义命令包装（高级）', value: 'custom' },
]

const privilegeModeLabel = (mode?: string) =>
  privilegeModeOptions.find((option) => option.value === mode)?.label ?? mode ?? '不提权'

interface OverviewTabProps {
  server: ServerProfile
  onRefresh: () => Promise<void>
}

export function OverviewTab({ server, onRefresh }: OverviewTabProps) {
  const [testing, setTesting] = useState(false)
  const setServerDetailTab = useNavigationStore((state) => state.setServerDetailTab)

  const handleTestConnection = async () => {
    setTesting(true)
    try {
      const result = await api.testServerConnection(server.id)
      alert(result)
      await onRefresh()
    } catch (error) {
      alert(`连接测试失败：${error}`)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 w-full">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">基础信息</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs mb-1">服务器名称</dt>
              <dd>{server.name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs mb-1">主机地址</dt>
              <dd className="flex items-center gap-2">
                {server.host}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-xs"
                  onClick={() => void navigator.clipboard?.writeText(server.host)}
                >
                  复制
                </Button>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs mb-1">SSH 端口</dt>
              <dd>{server.port}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs mb-1">用户名</dt>
              <dd>{server.username}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs mb-1">认证方式</dt>
              <dd>{server.authType === 'password' ? '密码' : '私钥'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs mb-1">提权方式</dt>
              <dd>
                {server.privilege?.mode && server.privilege.mode !== 'none' ? (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge className="bg-purple-500 text-white">{privilegeModeLabel(server.privilege.mode)}</Badge>
                    <span className="text-sm text-muted-foreground">执行用户：{server.privilege.runAsUser}</span>
                  </div>
                ) : (
                  <Badge variant="secondary">不提权</Badge>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs mb-1">提权密码</dt>
              <dd>
                {server.privilege?.mode && server.privilege.mode !== 'none' ? (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="secondary">
                      {server.privilege.passwordMode === 'login_password' ? '使用登录密码' : server.privilege.passwordMode === 'separate' ? '独立密码' : '不需要密码'}
                    </Badge>
                    {server.privilegePasswordConfigured ? <Badge className="bg-amber-500 text-white">已保存</Badge> : null}
                  </div>
                ) : (
                  '未启用'
                )}
              </dd>
            </div>
            {server.privilege?.mode && server.privilege.mode !== 'none' ? (
              <>
                <div>
                  <dt className="text-muted-foreground text-xs mb-1">上传暂存目录</dt>
                  <dd>{server.privilege.uploadTempDir}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs mb-1">执行 Shell</dt>
                  <dd>{server.privilege.shell}</dd>
                </div>
              </>
            ) : null}
            <div>
              <dt className="text-muted-foreground text-xs mb-1">环境</dt>
              <dd>
                <Badge className={envTypeClass(server.envType)}>{envTypeLabel(server.envType)}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs mb-1">分组</dt>
              <dd>{server.group ?? '未分组'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs mb-1">标签</dt>
              <dd>
                {server.tags?.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {server.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}
                  </div>
                ) : (
                  '无'
                )}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-muted-foreground text-xs mb-1">备注</dt>
              <dd>{server.remark ?? '无'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs mb-1">最近连接</dt>
              <dd>{server.lastConnectedAt ? new Date(server.lastConnectedAt).toLocaleString() : '未连接过'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs mb-1">创建时间</dt>
              <dd>{server.createdAt ? new Date(server.createdAt).toLocaleString() : '-'}</dd>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">快捷操作</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setServerDetailTab('terminal')}>
              <Code className="mr-1.5 h-4 w-4" />
              打开终端
            </Button>
            <Button variant="outline" onClick={() => setServerDetailTab('files')}>
              <Folder className="mr-1.5 h-4 w-4" />
              文件管理
            </Button>
            <Button variant="outline" disabled={testing} onClick={() => void handleTestConnection()}>
              <Server className="mr-1.5 h-4 w-4" />
              测试连接
            </Button>
            <Button variant="outline" onClick={() => void onRefresh()}>
              <RefreshCw className="mr-1.5 h-4 w-4" />
              刷新信息
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}