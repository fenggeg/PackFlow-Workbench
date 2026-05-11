import {Button} from "@/components/ui/button"
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card"
import {Input} from "@/components/ui/input"
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue,} from "@/components/ui/select"
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table"
import {Badge} from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {Tooltip, TooltipContent, TooltipTrigger,} from "@/components/ui/tooltip"
import {Cloud, Code, Edit, File, Folder, Plus, RefreshCw, Search, Star, Trash2,} from "lucide-react"
import {useCallback, useEffect, useMemo, useState} from "react"
import {api} from "../../services/tauri-api"
import {useNavigationStore} from "../../store/navigationStore"
import {ServerEditorDrawer} from "./ServerEditorDrawer"
import type {ServerPrivilegeMode, ServerProfile} from "../../types/domain"

const envTypeOptions = [
  { label: "开发", value: "dev", color: "bg-blue-500" },
  { label: "测试", value: "test", color: "bg-green-500" },
  { label: "预发", value: "staging", color: "bg-orange-500" },
  { label: "生产", value: "prod", color: "bg-red-500" },
  { label: "自定义", value: "custom", color: "bg-gray-500" },
]

const envTypeLabel = (type?: string) =>
  envTypeOptions.find((opt) => opt.value === type)?.label ?? type ?? ""

const envTypeColor = (type?: string) =>
  envTypeOptions.find((opt) => opt.value === type)?.color ?? "bg-gray-500"

const privilegeModeOptions: { label: string; value: ServerPrivilegeMode }[] = [
  { label: "不提权（普通账号直接执行）", value: "none" },
  { label: "sudo（用指定用户执行）", value: "sudo" },
  { label: "sudo -i（带登录环境执行）", value: "sudo_i" },
  { label: "su（切换到指定用户）", value: "su" },
  { label: "自定义命令包装（高级）", value: "custom" },
]

const privilegeModeLabel = (mode?: string) =>
  privilegeModeOptions.find((option) => option.value === mode)?.label ?? mode ?? "不提权"

const privilegeModeShortLabel = (mode?: string) => {
  switch (mode) {
    case "sudo": return "sudo"
    case "sudo_i": return "sudo -i"
    case "su": return "su"
    case "custom": return "自定义"
    default: return "不提权"
  }
}

export function ServerListPanel() {
  const [servers, setServers] = useState<ServerProfile[]>([])
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState("")
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
      console.error(`加载服务器列表失败：${error}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => void loadServers())
  }, [loadServers])

  const groups = useMemo(() => {
    const groupSet = new Set(servers.map((s) => s.group).filter(Boolean))
    return Array.from(groupSet).map((g) => ({ label: g!, value: g! }))
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
      console.log(result)
      await loadServers()
    } catch (error) {
      console.error(`连接测试失败：${error}`)
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
      console.error(`操作失败：${error}`)
    }
  }

  const handleDelete = async (serverId: string) => {
    try {
      await api.deleteServerProfile(serverId)
      console.log("删除成功")
      await loadServers()
    } catch (error) {
      console.error(`删除失败：${error}`)
    }
  }

  return (
    <>
      <Card className="panel-card">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-lg">服务器列表</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void loadServers()}>
              <RefreshCw className="mr-1 h-4 w-4" />
              刷新
            </Button>
            <Button size="sm" onClick={handleCreate}>
              <Plus className="mr-1 h-4 w-4" />
              新增服务器
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <div className="relative w-[280px]">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="搜索名称、IP、标签、备注"
                  className="pl-8"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                />
              </div>
              <Select value={envFilter} onValueChange={(v) => setEnvFilter(v === "__all__" ? undefined : v)}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="环境" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">全部环境</SelectItem>
                  {envTypeOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={groupFilter} onValueChange={(v) => setGroupFilter(v === "__all__" ? undefined : v)}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="分组" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">全部分组</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.value} value={g.value}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead>服务器名称</TableHead>
                  <TableHead>主机地址</TableHead>
                  <TableHead>用户名</TableHead>
                  <TableHead>连接与权限</TableHead>
                  <TableHead>环境</TableHead>
                  <TableHead>分组</TableHead>
                  <TableHead>标签</TableHead>
                  <TableHead className="w-[280px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      加载中...
                    </TableCell>
                  </TableRow>
                ) : filteredServers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      暂无服务器配置
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredServers.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleToggleFavorite(record)}
                        >
                          <Star
                            className={`h-4 w-4 ${record.favorite ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`}
                          />
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Cloud className="h-4 w-4" />
                          <a
                            className="text-primary hover:underline cursor-pointer"
                            onClick={() => navigateToServerDetail(record.id)}
                          >
                            {record.name}
                          </a>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm">{record.host}:{record.port}</span>
                      </TableCell>
                      <TableCell>{record.username}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant={record.authType === "private_key" ? "default" : "secondary"}>
                            {record.authType === "private_key" ? "私钥认证" : "密码认证"}
                          </Badge>
                          {record.passwordConfigured ? (
                            <Badge variant="outline" className="border-yellow-500 text-yellow-600">已保存登录密码</Badge>
                          ) : null}
                          {record.privilege?.mode && record.privilege.mode !== "none" ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className="border-purple-500 text-purple-600">
                                  {privilegeModeShortLabel(record.privilege.mode)}：{record.privilege.runAsUser}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>{privilegeModeLabel(record.privilege.mode)}</TooltipContent>
                            </Tooltip>
                          ) : (
                            <Badge variant="secondary">不提权</Badge>
                          )}
                          {record.privilege?.mode !== "none" && record.privilegePasswordConfigured ? (
                            <Badge variant="outline" className="border-yellow-500 text-yellow-600">已保存提权密码</Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        {record.envType ? (
                          <Badge className={envTypeColor(record.envType)}>{envTypeLabel(record.envType)}</Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {record.group ? <Badge variant="outline">{record.group}</Badge> : null}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {record.tags?.map((tag) => (
                            <Badge key={tag} variant="secondary">{tag}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigateToServerDetail(record.id, "terminal")}
                              >
                                <Code className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>终端</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigateToServerDetail(record.id, "files")}
                              >
                                <Folder className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>文件</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigateToServerDetail(record.id, "logs")}
                              >
                                <File className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>日志</TooltipContent>
                          </Tooltip>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={testingId === record.id}
                            onClick={() => void handleTestConnection(record.id)}
                          >
                            {testingId === record.id ? "测试中..." : "测试"}
                          </Button>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEdit(record)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>编辑</TooltipContent>
                          </Tooltip>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="destructive" size="sm">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>确认删除</AlertDialogTitle>
                                <AlertDialogDescription>确定删除该服务器？</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>取消</AlertDialogCancel>
                                <AlertDialogAction onClick={() => void handleDelete(record.id)}>
                                  删除
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
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