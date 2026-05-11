import {Button} from "@/components/ui/button"
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card"
import {Input} from "@/components/ui/input"
import {Textarea} from "@/components/ui/textarea"
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue,} from "@/components/ui/select"
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
import {Delete, Download, Edit, Eraser, File, Pause, Play, Plus, RefreshCw, Search,} from "lucide-react"
import {useCallback, useEffect, useRef, useState} from "react"
import {api} from "../../../services/tauri-api"
import type {LogSource, ServerProfile} from "../../../types/domain"

interface RemoteLogsTabProps {
  server: ServerProfile
}

const defaultHighlightRules = [
  { pattern: "ERROR", color: "#f44747" },
  { pattern: "Exception", color: "#f44747" },
  { pattern: "WARN", color: "#ffa500" },
  { pattern: "INFO", color: "#4ec9b0" },
  { pattern: "DEBUG", color: "#6a9955" },
  { pattern: "Caused by", color: "#c586c0" },
  { pattern: "Timeout", color: "#f44747" },
  { pattern: "Connection refused", color: "#f44747" },
  { pattern: "OutOfMemoryError", color: "#f44747" },
  { pattern: "NullPointerException", color: "#f44747" },
  { pattern: "failed", color: "#f44747" },
  { pattern: "success", color: "#4ec9b0" },
]

const getHighlightColor = (line: string): string | undefined => {
  for (const rule of defaultHighlightRules) {
    if (line.includes(rule.pattern)) {
      return rule.color
    }
  }
  return undefined
}

const createEmptyLogSource = (serverId: string): LogSource => ({
  id: "",
  serverId,
  name: "",
  path: "",
  encoding: "UTF-8",
  defaultTailLines: 500,
  enabled: true,
})

export function RemoteLogsTab({ server }: RemoteLogsTabProps) {
  const [logSources, setLogSources] = useState<LogSource[]>([])
  const [selectedPath, setSelectedPath] = useState<string>()
  const [logLines, setLogLines] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [tailing, setTailing] = useState(false)
  const [paused, setPaused] = useState(false)
  const [tailLines, setTailLines] = useState(500)
  const [searchKeyword, setSearchKeyword] = useState("")
  const [filterLevel, setFilterLevel] = useState<string>()
  const [sourceModalOpen, setSourceModalOpen] = useState(false)
  const [sourceSaving, setSourceSaving] = useState(false)
  const [sourceDraft, setSourceDraft] = useState<LogSource>(() => createEmptyLogSource(server.id))
  const outputRef = useRef<HTMLDivElement>(null)
  const tailIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pausedRef = useRef(false)

  const loadLogSources = useCallback(async () => {
    try {
      const data = await api.listLogSources(server.id)
      setLogSources(data)
    } catch (error) {
      console.error("加载日志源失败：", error)
    }
  }, [server.id])

  useEffect(() => {
    queueMicrotask(() => void loadLogSources())
  }, [loadLogSources])

  const selectedSource = logSources.find((source) => source.path === selectedPath)

  const openCreateSource = () => {
    setSourceDraft(createEmptyLogSource(server.id))
    setSourceModalOpen(true)
  }

  const openEditSource = () => {
    if (!selectedSource) {
      alert("请选择要编辑的日志源")
      return
    }
    setSourceDraft(selectedSource)
    setSourceModalOpen(true)
  }

  const handleSaveSource = async () => {
    const name = sourceDraft.name.trim()
    const path = sourceDraft.path.trim()
    if (!name || !path) {
      alert("请填写日志源名称和路径")
      return
    }
    setSourceSaving(true)
    try {
      const saved = await api.saveLogSource({
        ...sourceDraft,
        serverId: server.id,
        name,
        path,
        defaultTailLines: sourceDraft.defaultTailLines || 500,
      })
      console.log(sourceDraft.id ? "日志源已更新" : "日志源已新增")
      setSelectedPath(saved.path)
      setTailLines(saved.defaultTailLines)
      setSourceModalOpen(false)
      await loadLogSources()
    } catch (error) {
      console.error(`保存日志源失败：${error}`)
    } finally {
      setSourceSaving(false)
    }
  }

  const handleDeleteSource = async () => {
    if (!selectedSource) {
      alert("请选择要删除的日志源")
      return
    }
    try {
      await api.deleteLogSource(selectedSource.id)
      console.log("日志源已删除")
      if (selectedPath === selectedSource.path) {
        setSelectedPath(undefined)
      }
      await loadLogSources()
    } catch (error) {
      console.error(`删除日志源失败：${error}`)
    }
  }

  const scrollToBottom = useCallback(() => {
    if (outputRef.current && !paused) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [paused])

  const handleLoadLog = async () => {
    if (!selectedPath) {
      alert("请选择或输入日志路径")
      return
    }

    setLoading(true)
    setLogLines([])
    try {
      const lines = await api.readRemoteLogLines(server.id, selectedPath, tailLines)
      setLogLines(lines)
      setTimeout(scrollToBottom, 100)
    } catch (error) {
      console.error(`加载日志失败：${error}`)
    } finally {
      setLoading(false)
    }
  }

  const handleStartTail = () => {
    if (!selectedPath) {
      alert("请选择或输入日志路径")
      return
    }

    if (tailIntervalRef.current) {
      clearInterval(tailIntervalRef.current)
      tailIntervalRef.current = null
    }

    setTailing(true)
    setPaused(false)
    pausedRef.current = false

    tailIntervalRef.current = setInterval(async () => {
      if (pausedRef.current) return
      try {
        const lines = await api.readRemoteLogLines(server.id, selectedPath!, tailLines)
        setLogLines(lines)
        setTimeout(scrollToBottom, 100)
      } catch (error) {
        console.error("Tail 日志失败：", error)
      }
    }, 3000)
  }

  const handleStopTail = () => {
    setTailing(false)
    setPaused(false)
    pausedRef.current = false
    if (tailIntervalRef.current) {
      clearInterval(tailIntervalRef.current)
      tailIntervalRef.current = null
    }
  }

  const handleTogglePause = () => {
    const nextPaused = !pausedRef.current
    pausedRef.current = nextPaused
    setPaused(nextPaused)
  }

  const handleClear = () => {
    setLogLines([])
  }

  const handleDownload = () => {
    const content = logLines.join("\n")
    const blob = new Blob([content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${server.name}-${selectedPath?.split("/").pop() ?? "log"}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    return () => {
      if (tailIntervalRef.current) {
        clearInterval(tailIntervalRef.current)
      }
    }
  }, [])

  const filteredLines = logLines.filter((line) => {
    if (searchKeyword && !line.toLowerCase().includes(searchKeyword.toLowerCase())) {
      return false
    }
    if (filterLevel) {
      if (filterLevel === "ERROR" && !line.includes("ERROR") && !line.includes("Exception"))
        return false
      if (filterLevel === "WARN" && !line.includes("WARN") && !line.includes("ERROR"))
        return false
    }
    return true
  })

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="flex items-center gap-2">
          <File className="h-4 w-4" />
          <CardTitle className="text-lg">远程日志</CardTitle>
          {tailing && (
            <Badge className={paused ? "bg-yellow-500" : "bg-blue-500"}>
              {paused ? "已暂停" : "实时监听中"}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          {!tailing ? (
            <Button
              size="sm"
              onClick={handleStartTail}
              disabled={!selectedPath}
            >
              <Play className="mr-1 h-4 w-4" />
              实时 Tail
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleTogglePause}
              >
                {paused ? <Play className="mr-1 h-4 w-4" /> : <Pause className="mr-1 h-4 w-4" />}
                {paused ? "继续" : "暂停"}
              </Button>
              <Button variant="destructive" size="sm" onClick={handleStopTail}>
                停止
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleLoadLog()}
            disabled={loading}
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            读取
          </Button>
          <Button variant="outline" size="sm" onClick={handleClear}>
            <Eraser className="mr-1 h-4 w-4" />
            清空
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            disabled={logLines.length === 0}
          >
            <Download className="mr-1 h-4 w-4" />
            下载
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Select
              value={selectedPath}
              onValueChange={(value) => {
                setSelectedPath(value)
                const source = logSources.find((item) => item.path === value)
                if (source) {
                  setTailLines(source.defaultTailLines)
                }
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="选择日志源" />
              </SelectTrigger>
              <SelectContent>
                {logSources.map((ls) => (
                  <SelectItem
                    key={ls.path}
                    value={ls.path}
                    disabled={!ls.enabled}
                  >
                    {ls.name} ({ls.path})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={openCreateSource}>
              <Plus className="mr-1 h-4 w-4" />
              新增日志源
            </Button>
            <Button variant="outline" disabled={!selectedSource} onClick={openEditSource}>
              <Edit className="mr-1 h-4 w-4" />
              编辑
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={!selectedSource}>
                  <Delete className="mr-1 h-4 w-4" />
                  删除
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>确认删除</AlertDialogTitle>
                  <AlertDialogDescription>确定删除该日志源？</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void handleDeleteSource()}>
                    删除
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Input
              placeholder="或输入日志路径"
              className="w-[300px]"
              value={selectedPath}
              onChange={(e) => setSelectedPath(e.target.value)}
            />
            <Select
              value={String(tailLines)}
              onValueChange={(v) => setTailLines(Number(v))}
            >
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="100">100 行</SelectItem>
                <SelectItem value="500">500 行</SelectItem>
                <SelectItem value="1000">1000 行</SelectItem>
                <SelectItem value="5000">5000 行</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="relative w-[200px]">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索关键字"
                className="pl-8"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
              />
            </div>
            <Select
              value={filterLevel}
              onValueChange={(v) => setFilterLevel(v === "__all__" ? undefined : v)}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="日志级别" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">全部</SelectItem>
                <SelectItem value="ERROR">ERROR</SelectItem>
                <SelectItem value="WARN">WARN</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground flex items-center">
              {filteredLines.length} / {logLines.length} 行
            </span>
          </div>

          <div
            ref={outputRef}
            className="bg-[#1e1e1e] text-[#d4d4d4] p-3 font-mono text-[13px] leading-relaxed h-[400px] overflow-y-auto rounded"
          >
            {filteredLines.length === 0 ? (
              <div className="flex flex-col items-center justify-center pt-[100px] text-[#666]">
                <span>选择日志路径后点击"读取"或"实时 Tail"</span>
              </div>
            ) : (
              filteredLines.map((line, index) => (
                <div
                  key={index}
                  style={{
                    color: getHighlightColor(line) ?? "#d4d4d4",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                  }}
                >
                  {line}
                </div>
              ))
            )}
          </div>
        </div>

        <Dialog open={sourceModalOpen} onOpenChange={setSourceModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{sourceDraft.id ? "编辑日志源" : "新增日志源"}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="flex gap-1">
                <span className="flex items-center px-3 border rounded-l bg-muted text-sm">名称</span>
                <Input
                  className="rounded-l-none"
                  placeholder="例如 应用主日志"
                  value={sourceDraft.name}
                  onChange={(event) => setSourceDraft({ ...sourceDraft, name: event.target.value })}
                />
              </div>
              <div className="flex gap-1">
                <span className="flex items-center px-3 border rounded-l bg-muted text-sm">路径</span>
                <Input
                  className="rounded-l-none"
                  placeholder="例如 /home/my-project-test/logs/app.log"
                  value={sourceDraft.path}
                  onChange={(event) => setSourceDraft({ ...sourceDraft, path: event.target.value })}
                />
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <Select
                  value={sourceDraft.encoding}
                  onValueChange={(encoding) => setSourceDraft({ ...sourceDraft, encoding })}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UTF-8">UTF-8</SelectItem>
                    <SelectItem value="GBK">GBK</SelectItem>
                    <SelectItem value="auto">自动</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex gap-1 items-center">
                  <span className="flex items-center px-3 border rounded-l bg-muted text-sm h-9">默认行数</span>
                  <Input
                    type="number"
                    min={50}
                    max={5000}
                    className="w-[100px] rounded-l-none"
                    value={sourceDraft.defaultTailLines}
                    onChange={(event) => setSourceDraft({ ...sourceDraft, defaultTailLines: Number(event.target.value) || 500 })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={sourceDraft.enabled}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${sourceDraft.enabled ? "bg-primary" : "bg-input"}`}
                    onClick={() => setSourceDraft({ ...sourceDraft, enabled: !sourceDraft.enabled })}
                  >
                    <span
                      className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${sourceDraft.enabled ? "translate-x-4" : "translate-x-0"}`}
                    />
                  </button>
                  <span className="text-sm">启用</span>
                </div>
              </div>
              <Textarea
                rows={3}
                placeholder="备注"
                value={sourceDraft.remark ?? ""}
                onChange={(event) => setSourceDraft({ ...sourceDraft, remark: event.target.value || undefined })}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSourceModalOpen(false)}>取消</Button>
              <Button disabled={sourceSaving} onClick={() => void handleSaveSource()}>
                {sourceSaving ? "保存中..." : "保存"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}