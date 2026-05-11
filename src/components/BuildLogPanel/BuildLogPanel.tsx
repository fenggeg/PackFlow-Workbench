import {Button} from "@/components/ui/button"
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card"
import {Input} from "@/components/ui/input"
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue,} from "@/components/ui/select"
import {Badge} from "@/components/ui/badge"
import {Tooltip, TooltipContent, TooltipTrigger,} from "@/components/ui/tooltip"
import {Dialog, DialogContent, DialogHeader, DialogTitle,} from "@/components/ui/dialog"
import {Copy, Delete, Download, Maximize2, Pause, Play,} from "lucide-react"
import {useEffect, useMemo, useRef, useState} from "react"
import {LogConsole} from "../common/LogConsole"
import {useAppStore} from "../../store/useAppStore"
import {useDeploymentLogStore} from "../../store/useDeploymentLogStore"
import {useNavigationStore} from "../../store/navigationStore"
import {useWorkflowStore} from "../../store/useWorkflowStore"
import type {BuildDiagnosis, BuildLogEvent, BuildStatus} from "../../types/domain"

type LogSource = "build" | "deployment"
type LogFilter = "all" | "error" | "warn" | "success"
const EMPTY_DEPLOYMENT_LOGS: string[] = []

const statusText: Record<BuildStatus, string> = {
  IDLE: "未开始",
  RUNNING: "构建中",
  SUCCESS: "构建成功",
  FAILED: "构建失败",
  CANCELLED: "已停止",
}

const statusBadgeClass: Record<BuildStatus, string> = {
  IDLE: "bg-gray-500",
  RUNNING: "bg-blue-500",
  SUCCESS: "bg-green-500",
  FAILED: "bg-red-500",
  CANCELLED: "bg-yellow-500",
}

const diagnosisCategoryText: Record<BuildDiagnosis["category"], string> = {
  jdk_mismatch: "JDK 版本不匹配",
  maven_missing: "Maven 不存在",
  wrapper_issue: "Wrapper 失效",
  settings_missing: "settings.xml 缺失",
  dependency_download_failed: "依赖下载失败",
  repo_unreachable: "私服不可达",
  profile_invalid: "profile 不存在",
  module_invalid: "模块路径错误",
  test_failed: "单元测试失败",
  unknown: "未知错误",
}

const classifyBuildLog = (event: BuildLogEvent) => {
  const line = event.line.toLowerCase()
  if (line.includes("build success")) {
    return "success"
  }
  if (
    line.includes("[error]") ||
    line.includes("build failure") ||
    line.includes("could not resolve dependencies") ||
    line.includes("java_home is not defined correctly") ||
    line.includes("non-resolvable parent pom")
  ) {
    return "error"
  }
  if (line.includes("[warning]")) {
    return "warn"
  }
  return ""
}

const classifyLine = (line: string) => {
  const lower = line.toLowerCase()
  if (lower.includes("build success") || lower.includes("exit code 0") || lower.includes("部署完成")) {
    return "success"
  }
  if (lower.includes("[error]") || lower.includes("build failure") || lower.includes("命令执行失败") || lower.includes("部署失败") || lower.includes("timeout") || lower.includes("failed")) {
    return "error"
  }
  if (lower.includes("[warning]") || lower.includes("warn")) {
    return "warn"
  }
  return ""
}

const deploymentStatusLabel = (status: string) => {
  switch (status) {
    case "success": return "部署成功"
    case "failed": return "部署失败"
    case "cancelled": return "已停止"
    case "pending": return "等待中"
    case "uploading": return "上传中"
    case "stopping": return "停止旧服务"
    case "starting": return "启动中"
    case "checking": return "检测中"
    default: return status
  }
}

export function BuildLogPanel() {
  // Build logs
  const logs = useAppStore((state) => state.logs)
  const diagnosis = useAppStore((state) => state.diagnosis)
  const buildStatus = useAppStore((state) => state.buildStatus)
  const buildCancelling = useAppStore((state) => state.buildCancelling)
  const buildStartedAt = useAppStore((state) => state.startedAt)
  const cancelBuild = useAppStore((state) => state.cancelBuild)
  const clearBuildLogs = useAppStore((state) => state.clearBuildLogs)

  // Deployment logs
  const currentDeploymentTask = useWorkflowStore((state) => state.currentDeploymentTask)
  const deploymentTaskId = currentDeploymentTask?.id
  const deploymentLogs = useDeploymentLogStore(
    (state) => state.logsByTaskId[deploymentTaskId ?? ""] ?? EMPTY_DEPLOYMENT_LOGS,
  )
  const clearDeploymentLogs = useDeploymentLogStore((state) => state.clearLogs)

  const panelRef = useRef<HTMLDivElement>(null)
  const modalPanelRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [keyword, setKeyword] = useState("")
  const [logFilter, setLogFilter] = useState<LogFilter>("all")
  const [autoScroll, setAutoScroll] = useState(true)
  const activeSource = useNavigationStore((state) => state.inspectorLogSource)
  const setActiveSource = useNavigationStore((state) => state.setInspectorLogSource)

  const isDeploymentRunning = currentDeploymentTask != null && !["success", "failed", "cancelled"].includes(currentDeploymentTask.status)

  // Alias for local readability
  const setActiveSourceLocal = (source: LogSource) => setActiveSource(source)

  const lastLaunchRef = useRef<{
    buildStartedAt?: number
    deploymentTaskId?: string
  }>({})

  useEffect(() => {
    const previous = lastLaunchRef.current
    let nextSource: LogSource | undefined

    if (buildStartedAt && buildStatus === "RUNNING" && buildStartedAt !== previous.buildStartedAt) {
      nextSource = "build"
    }
    if (deploymentTaskId && isDeploymentRunning && deploymentTaskId !== previous.deploymentTaskId) {
      nextSource = "deployment"
    }

    lastLaunchRef.current = {
      buildStartedAt,
      deploymentTaskId,
    }

    if (nextSource) {
      setActiveSource(nextSource)
    }
  }, [
    buildStartedAt,
    buildStatus,
    deploymentTaskId,
    isDeploymentRunning,
    setActiveSource,
  ])

  const currentLogCount = activeSource === "build" ? logs.length : deploymentLogs.length

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && panelRef.current) {
      panelRef.current.scrollTop = panelRef.current.scrollHeight
    }
    if (autoScroll && modalPanelRef.current) {
      modalPanelRef.current.scrollTop = modalPanelRef.current.scrollHeight
    }
  }, [autoScroll, currentLogCount])

  // Filter by keyword
  const keywordValue = keyword.trim().toLowerCase()
  const visibleBuildLogs = useMemo(() => logs.filter((event) => {
    if (logFilter !== "all" && classifyBuildLog(event) !== logFilter) return false
    if (keywordValue && !event.line.toLowerCase().includes(keywordValue)) return false
    return true
  }), [keywordValue, logFilter, logs])

  const visibleDeploymentLogs = useMemo(() => deploymentLogs.filter((line) => {
    if (logFilter !== "all" && classifyLine(line) !== logFilter) return false
    if (keywordValue && !line.toLowerCase().includes(keywordValue)) return false
    return true
  }), [deploymentLogs, keywordValue, logFilter])

  const visibleBuildLogLines = useMemo(
    () => visibleBuildLogs.map((event) => event.line),
    [visibleBuildLogs],
  )

  const copyLogs = () => {
    let text = ""
    if (activeSource === "build") {
      text = logs.map((event) => event.line).join("\n")
    } else {
      text = deploymentLogs.join("\n")
    }
    void navigator.clipboard?.writeText(text)
  }

  const downloadLogs = () => {
    const text = activeSource === "build"
      ? logs.map((event) => event.line).join("\n")
      : deploymentLogs.join("\n")
    if (!text) return
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = activeSource === "build" ? "build-log.txt" : "deployment-log.txt"
    a.click()
    URL.revokeObjectURL(url)
  }

  const clearLogs = () => {
    if (activeSource === "build") {
      clearBuildLogs()
    } else if (deploymentTaskId) {
      clearDeploymentLogs(deploymentTaskId)
    }
  }

  // Build status tag for header
  const renderStatusTag = () => {
    if (activeSource === "build") {
      return <Badge className={statusBadgeClass[buildStatus]}>{statusText[buildStatus]}</Badge>
    }
    if (activeSource === "deployment" && currentDeploymentTask) {
      const isRunning = !["success", "failed", "cancelled"].includes(currentDeploymentTask.status)
      const colorClass = currentDeploymentTask.status === "success" ? "bg-green-500" : currentDeploymentTask.status === "cancelled" ? "bg-yellow-500" : isRunning ? "bg-blue-500" : "bg-red-500"
      const label = `${currentDeploymentTask.artifactName} · ${deploymentStatusLabel(currentDeploymentTask.status)}`
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge className={`${colorClass} log-status-tag`}>
              <span>{label}</span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      )
    }
    return null
  }

  const copyDiagnosis = () => {
    if (!diagnosis) {
      return
    }
    const content = [
      `错误类型：${diagnosisCategoryText[diagnosis.category]}`,
      `摘要：${diagnosis.summary}`,
      "",
      "可能原因：",
      ...diagnosis.possibleCauses.map((item) => `- ${item}`),
      "",
      "建议动作：",
      ...diagnosis.suggestedActions.map((item) => `- ${item}`),
      "",
      "关键日志：",
      ...diagnosis.keywordLines.map((item) => `> ${item}`),
    ].join("\n")
    void navigator.clipboard?.writeText(content)
  }

  return (
    <div className="flex flex-col gap-3">
      <Card className="panel-card log-panel-card">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-lg">日志输出</CardTitle>
          <div className="flex flex-wrap gap-1 log-card-extra">
            {renderStatusTag()}
            {activeSource === "build" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={buildStatus !== "RUNNING" || buildCancelling}
                    onClick={() => void cancelBuild()}
                  >
                    <Pause className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>停止构建</TooltipContent>
              </Tooltip>
            )}
            {activeSource === "build" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={clearLogs}>
                    <Delete className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>清空日志</TooltipContent>
              </Tooltip>
            )}
            {activeSource === "deployment" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" disabled={!deploymentTaskId} onClick={clearLogs}>
                    <Delete className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>清空当前部署日志</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={currentLogCount === 0}
                  onClick={copyLogs}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>复制日志</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={currentLogCount === 0}
                  onClick={downloadLogs}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>下载日志</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={autoScroll ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setAutoScroll((value) => !value)}
                >
                  <Play className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{autoScroll ? "关闭自动滚动" : "开启自动滚动"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label="放大查看日志"
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpanded(true)}
                >
                  <Maximize2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>放大查看</TooltipContent>
            </Tooltip>
          </div>
        </CardHeader>
        <CardContent>
          {/* Source tabs */}
          <div className="flex gap-1 mb-2">
            <Button
              variant={activeSource === "build" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveSourceLocal("build")}
            >
              构建
            </Button>
            <Button
              variant={activeSource === "deployment" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveSourceLocal("deployment")}
            >
              部署
            </Button>
          </div>
          <div className="flex gap-1 mb-2">
            <Select
              value={logFilter}
              onValueChange={(v) => setLogFilter(v as LogFilter)}
            >
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="error">错误</SelectItem>
                <SelectItem value="warn">告警</SelectItem>
                <SelectItem value="success">成功</SelectItem>
              </SelectContent>
            </Select>
            <Input
              className="log-search"
              placeholder="搜索日志关键词"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </div>
          {activeSource === "build" ? (
            <LogConsole
              ref={panelRef}
              lines={visibleBuildLogLines}
              classifyLine={classifyLine}
              emptyTitle="准备开始构建"
              emptyDescription="请选择模块并点击开始打包。"
              keyPrefix="build-log"
            />
          ) : (
            <LogConsole
              ref={panelRef}
              lines={visibleDeploymentLogs}
              classifyLine={classifyLine}
              emptyTitle="暂无部署日志"
              emptyDescription="执行部署后日志将在此实时展示。"
              keyPrefix="deployment-log"
            />
          )}
          <Dialog open={expanded} onOpenChange={setExpanded}>
            <DialogContent className="w-[88vw] max-w-[88vw]">
              <DialogHeader>
                <DialogTitle>日志输出 · {activeSource === "build" ? "构建" : "部署"}</DialogTitle>
              </DialogHeader>
              {activeSource === "build" ? (
                <LogConsole
                  ref={modalPanelRef}
                  className="log-panel log-panel-large"
                  lines={visibleBuildLogLines}
                  classifyLine={classifyLine}
                  emptyTitle="准备开始构建"
                  emptyDescription="请选择模块并点击开始打包。"
                  keyPrefix="build-log-modal"
                />
              ) : (
                <LogConsole
                  ref={modalPanelRef}
                  className="log-panel log-panel-large"
                  lines={visibleDeploymentLogs}
                  classifyLine={classifyLine}
                  emptyTitle="暂无部署日志"
                  emptyDescription="执行部署后日志将在此实时展示。"
                  keyPrefix="deployment-log-modal"
                />
              )}
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      {activeSource === "build" && diagnosis && (
        <Card className="panel-card diagnosis-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="text-lg">诊断面板</CardTitle>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={copyDiagnosis}>
                  <Copy className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>复制诊断结果</TooltipContent>
            </Tooltip>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="bg-red-500">{diagnosisCategoryText[diagnosis.category]}</Badge>
                <span className="font-semibold text-sm">{diagnosis.summary}</span>
              </div>
              <div className="diagnosis-grid grid grid-cols-2 gap-4">
                <div>
                  <span className="font-semibold text-sm">可能原因</span>
                  <ul className="mt-1 list-disc list-inside text-sm text-muted-foreground">
                    {diagnosis.possibleCauses.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <span className="font-semibold text-sm">建议动作</span>
                  <ul className="mt-1 list-disc list-inside text-sm text-muted-foreground">
                    {diagnosis.suggestedActions.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div>
                <span className="font-semibold text-sm">高价值关键字行</span>
                <div className="diagnosis-keyword-lines mt-1">
                  {diagnosis.keywordLines.slice(0, 6).map((line, index) => (
                    <pre key={`${diagnosis.id}-${index}`} className="bg-muted p-2 rounded text-sm overflow-x-auto mb-1">
                      {line}
                    </pre>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}