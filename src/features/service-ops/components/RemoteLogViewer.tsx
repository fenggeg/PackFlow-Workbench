import {useEffect, useMemo, useRef, useState} from "react"
import {Badge} from "@/components/ui/badge"
import {Button} from "@/components/ui/button"
import {Dialog, DialogContent, DialogHeader, DialogTitle,} from "@/components/ui/dialog"
import {Input} from "@/components/ui/input"
import {Switch} from "@/components/ui/switch"
import {Tooltip, TooltipContent, TooltipTrigger,} from "@/components/ui/tooltip"
import {Copy, Eraser, Maximize2, Pause, Play, Square,} from "lucide-react"
import {LogConsole} from "../../../components/common/LogConsole"
import {useRemoteLogSessionStore} from "../stores/remoteLogSessionStore"

const classifyRemoteLine = (line: string) => {
  const upper = line.toUpperCase()
  if (upper.includes("ERROR") || upper.includes("EXCEPTION") || upper.includes("FAILED"))
    return "error"
  if (upper.includes("WARN")) return "warn"
  return ""
}

export function RemoteLogViewer() {
  const activeSessionId = useRemoteLogSessionStore(
    (state) => state.activeSessionId,
  )
  const sessionsById = useRemoteLogSessionStore(
    (state) => state.sessionsById,
  )
  const linesBySessionId = useRemoteLogSessionStore(
    (state) => state.linesBySessionId,
  )
  const autoScrollBySessionId = useRemoteLogSessionStore(
    (state) => state.autoScrollBySessionId,
  )
  const stopSession = useRemoteLogSessionStore(
    (state) => state.stopSession,
  )
  const clearSessionLines = useRemoteLogSessionStore(
    (state) => state.clearSessionLines,
  )
  const setAutoScroll = useRemoteLogSessionStore(
    (state) => state.setAutoScroll,
  )
  const [keyword, setKeyword] = useState("")
  const [errorOnly, setErrorOnly] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const session = activeSessionId ? sessionsById[activeSessionId] : undefined
  const lines = useMemo(
    () =>
      activeSessionId
        ? (linesBySessionId[activeSessionId] ?? [])
        : [],
    [activeSessionId, linesBySessionId],
  )
  const autoScroll = activeSessionId
    ? (autoScrollBySessionId[activeSessionId] ?? true)
    : true
  const filteredLines = useMemo(() => {
    const lowerKeyword = keyword.trim().toLowerCase()
    return lines.filter((line) => {
      if (errorOnly && classifyRemoteLine(line) !== "error") return false
      if (!lowerKeyword) return true
      return line.toLowerCase().includes(lowerKeyword)
    })
  }, [errorOnly, keyword, lines])

  useEffect(() => {
    if (!autoScroll) return
    const node = panelRef.current
    if (node) {
      node.scrollTop = node.scrollHeight
    }
  }, [autoScroll, filteredLines.length])

  if (!session || !activeSessionId) {
    return (
      <div className="service-log-empty flex items-center justify-center py-8">
        <span className="text-sm text-muted-foreground">
          尚未打开远程日志会话
        </span>
      </div>
    )
  }

  const copyLines = () =>
    void navigator.clipboard?.writeText(filteredLines.join("\n"))

  const statusVariant =
    session.status === "streaming"
      ? "default"
      : session.status === "failed"
        ? "destructive"
        : "secondary"
  const statusLabel =
    session.status === "connecting"
      ? "连接中"
      : session.status === "streaming"
        ? "实时 tail"
        : session.status === "failed"
          ? "失败"
          : "已停止"

  return (
    <div className="flex flex-col gap-2.5 w-full">
      <div className="flex flex-wrap items-center gap-2 service-log-toolbar">
        <Badge variant={statusVariant}>{statusLabel}</Badge>
        <Input
          size="sm"
          placeholder="搜索日志"
          className="w-[180px]"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <div className="flex items-center gap-1.5">
          <Switch
            checked={autoScroll}
            onCheckedChange={(checked) =>
              setAutoScroll(activeSessionId, checked)
            }
          />
          <span className="text-xs text-muted-foreground">
            {autoScroll ? (
              <Play className="h-3.5 w-3.5" />
            ) : (
              <Pause className="h-3.5 w-3.5" />
            )}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Switch
            checked={errorOnly}
            onCheckedChange={(checked) => setErrorOnly(checked)}
          />
          <span className="text-xs text-muted-foreground">
            {errorOnly ? "ERROR" : "全部"}
          </span>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              disabled={filteredLines.length === 0}
              onClick={copyLines}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>复制当前视图</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              onClick={() => clearSessionLines(activeSessionId)}
            >
              <Eraser className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>清空当前视图</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="destructive"
              disabled={
                session.status !== "streaming" &&
                session.status !== "connecting"
              }
              onClick={() => void stopSession(activeSessionId)}
            >
              <Square className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>停止 tail</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setExpanded(true)}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>全屏查看</TooltipContent>
        </Tooltip>
      </div>
      <LogConsole
        ref={panelRef}
        className="log-panel service-remote-log-panel"
        lines={filteredLines}
        classifyLine={classifyRemoteLine}
        emptyTitle="暂无远程日志"
        keyPrefix="remote-log"
      />
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-[92vw] w-[92vw]">
          <DialogHeader>
            <DialogTitle>远程服务日志</DialogTitle>
          </DialogHeader>
          <LogConsole
            className="log-panel log-panel-large"
            lines={filteredLines}
            classifyLine={classifyRemoteLine}
            emptyTitle="暂无远程日志"
            keyPrefix="remote-log-full"
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}