import {Button} from "@/components/ui/button"
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card"
import {Input} from "@/components/ui/input"
import {Textarea} from "@/components/ui/textarea"
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
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,} from "@/components/ui/dialog"
import {AlertTriangle, Copy, Edit, Play, Plus, RefreshCw, Trash2,} from "lucide-react"
import {useCallback, useEffect, useState} from "react"
import {api} from "../../../services/tauri-api"
import type {CommonCommand, ServerProfile} from "../../../types/domain"

interface CommonCommandsTabProps {
  server: ServerProfile
}

const riskLevelOptions = [
  { label: "安全", value: "safe", color: "bg-green-500" },
  { label: "警告", value: "warning", color: "bg-orange-500" },
  { label: "危险", value: "danger", color: "bg-red-500" },
]

const riskLevelColor = (level: string) =>
  riskLevelOptions.find((opt) => opt.value === level)?.color ?? "bg-gray-500"

const categoryOptions = [
  "系统巡检",
  "Java 应用",
  "Docker",
  "Nginx",
  "日志查看",
  "服务启停",
  "自定义脚本",
]

const dangerousPatterns = [
  "rm -rf",
  "reboot",
  "shutdown",
  "mkfs",
  "dd",
  "kill -9",
  "systemctl stop",
  "docker rm",
  "docker rmi",
]

const isDangerousCommand = (command: string) =>
  dangerousPatterns.some((pattern) => command.includes(pattern))

export function CommonCommandsTab({ server }: CommonCommandsTabProps) {
  const [commands, setCommands] = useState<CommonCommand[]>([])
  const [loading, setLoading] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingCommand, setEditingCommand] = useState<CommonCommand | null>(null)
  const [formName, setFormName] = useState("")
  const [formCommand, setFormCommand] = useState("")
  const [formCategory, setFormCategory] = useState("")
  const [formRiskLevel, setFormRiskLevel] = useState<string>("safe")
  const [formDescription, setFormDescription] = useState("")
  const [executing, setExecuting] = useState<string>()
  const [dangerDialogOpen, setDangerDialogOpen] = useState(false)
  const [pendingDangerCmd, setPendingDangerCmd] = useState<CommonCommand | null>(null)
  const [resultDialogOpen, setResultDialogOpen] = useState(false)
  const [resultOutput, setResultOutput] = useState("")
  const [resultTitle, setResultTitle] = useState("")

  const loadCommands = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.listCommonCommands(server.id)
      setCommands(data)
    } catch (error) {
      console.error(`加载常用命令失败：${error}`)
    } finally {
      setLoading(false)
    }
  }, [server.id])

  useEffect(() => {
    queueMicrotask(() => void loadCommands())
  }, [loadCommands])

  const handleOpenCreate = () => {
    setEditingCommand(null)
    setFormName("")
    setFormCommand("")
    setFormCategory("")
    setFormRiskLevel("safe")
    setFormDescription("")
    setEditorOpen(true)
  }

  const handleOpenEdit = (cmd: CommonCommand) => {
    setEditingCommand(cmd)
    setFormName(cmd.name)
    setFormCommand(cmd.command)
    setFormCategory(cmd.category)
    setFormRiskLevel(cmd.riskLevel)
    setFormDescription(cmd.description ?? "")
    setEditorOpen(true)
  }

  const handleSave = async () => {
    if (!formName.trim() || !formCommand.trim()) {
      alert("名称和命令不能为空")
      return
    }

    try {
      await api.saveCommonCommand({
        id: editingCommand?.id ?? "",
        name: formName,
        command: formCommand,
        category: formCategory,
        scope: "server",
        serverId: server.id,
        riskLevel: formRiskLevel as CommonCommand["riskLevel"],
        description: formDescription || undefined,
      })
      console.log("保存成功")
      setEditorOpen(false)
      await loadCommands()
    } catch (error) {
      console.error(`保存失败：${error}`)
    }
  }

  const handleDelete = async (commandId: string) => {
    try {
      await api.deleteCommonCommand(commandId)
      console.log("删除成功")
      await loadCommands()
    } catch (error) {
      console.error(`删除失败：${error}`)
    }
  }

  const executeCommand = async (cmd: CommonCommand) => {
    setExecuting(cmd.id)
    try {
      const result = await api.executeRemoteCommand(server.id, cmd.command)
      if (result.success) {
        console.log("执行成功")
        setResultTitle(`执行结果：${cmd.name}`)
        setResultOutput(result.output || "无输出")
        setResultDialogOpen(true)
      } else {
        console.error(`执行失败，退出码：${result.exitCode}`)
      }
    } catch (error) {
      console.error(`执行失败：${error}`)
    } finally {
      setExecuting(undefined)
    }
  }

  const handleExecute = (cmd: CommonCommand) => {
    if (isDangerousCommand(cmd.command)) {
      setPendingDangerCmd(cmd)
      setDangerDialogOpen(true)
    } else {
      void executeCommand(cmd)
    }
  }

  const handleCopy = (command: string) => {
    navigator.clipboard.writeText(command)
    console.log("已复制到剪贴板")
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          <CardTitle className="text-lg">常用命令</CardTitle>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadCommands()}>
            <RefreshCw className="mr-1 h-4 w-4" />
            刷新
          </Button>
          <Button size="sm" onClick={handleOpenCreate}>
            <Plus className="mr-1 h-4 w-4" />
            新增命令
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>命令</TableHead>
              <TableHead>分类</TableHead>
              <TableHead>风险</TableHead>
              <TableHead className="w-[200px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  加载中...
                </TableCell>
              </TableRow>
            ) : commands.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  暂无常用命令
                </TableCell>
              </TableRow>
            ) : (
              commands.map((record) => (
                <TableRow key={record.id}>
                  <TableCell>{record.name}</TableCell>
                  <TableCell>
                    <code className="max-w-[400px] truncate block bg-muted px-1 py-0.5 rounded text-sm">
                      {record.command}
                    </code>
                  </TableCell>
                  <TableCell>
                    {record.category ? <Badge variant="outline">{record.category}</Badge> : null}
                  </TableCell>
                  <TableCell>
                    <Badge className={riskLevelColor(record.riskLevel)}>
                      {riskLevelOptions.find((opt) => opt.value === record.riskLevel)?.label ?? record.riskLevel}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="default"
                        size="sm"
                        disabled={executing === record.id}
                        onClick={() => handleExecute(record)}
                      >
                        <Play className="mr-1 h-4 w-4" />
                        {executing === record.id ? "执行中..." : "执行"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopy(record.command)}
                      >
                        <Copy className="mr-1 h-4 w-4" />
                        复制
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenEdit(record)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>确认删除</AlertDialogTitle>
                            <AlertDialogDescription>确定删除？</AlertDialogDescription>
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
      </CardContent>

      {/* 命令编辑 Dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{editingCommand ? "编辑命令" : "新增命令"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-sm text-muted-foreground">名称</label>
              <Input
                placeholder="命令名称"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">命令</label>
              <Textarea
                placeholder="要执行的命令"
                value={formCommand}
                onChange={(e) => setFormCommand(e.target.value)}
                rows={3}
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">分类</label>
              <Select value={formCategory} onValueChange={(v) => setFormCategory(v === "__none__" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="选择或输入分类" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">无</SelectItem>
                  {categoryOptions.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">风险等级</label>
              <Select value={formRiskLevel} onValueChange={setFormRiskLevel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {riskLevelOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">说明</label>
              <Input
                placeholder="可选"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>取消</Button>
            <Button onClick={() => void handleSave()}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 危险命令确认 Dialog */}
      <AlertDialog open={dangerDialogOpen} onOpenChange={setDangerDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              危险命令确认
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>该命令可能影响服务器或业务运行：</p>
                <code className="block bg-muted px-2 py-1 rounded my-2 text-sm">
                  {pendingDangerCmd?.command}
                </code>
                <p>确定要执行吗？</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDangerCmd) void executeCommand(pendingDangerCmd)
                setPendingDangerCmd(null)
              }}
            >
              执行
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 执行结果 Dialog */}
      <Dialog open={resultDialogOpen} onOpenChange={setResultDialogOpen}>
        <DialogContent className="max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{resultTitle}</DialogTitle>
          </DialogHeader>
          <pre className="max-h-[400px] overflow-auto bg-muted p-3 rounded text-sm">
            {resultOutput}
          </pre>
        </DialogContent>
      </Dialog>
    </Card>
  )
}