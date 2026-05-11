import {Button} from "@/components/ui/button"
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card"
import {Input} from "@/components/ui/input"
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue,} from "@/components/ui/select"
import {Badge} from "@/components/ui/badge"
import {Tooltip, TooltipContent, TooltipTrigger,} from "@/components/ui/tooltip"
import {Dialog, DialogContent, DialogHeader, DialogTitle,} from "@/components/ui/dialog"
import {AlertCircle, Check, FileText, FolderOpen, Info, Rocket, Settings,} from "lucide-react"
import {useMemo, useState} from "react"
import {deriveRuntimeConfig} from "../../features/service-ops/services/serviceRuntimeConfigService"
import {useRemoteLogSessionStore} from "../../features/service-ops/stores/remoteLogSessionStore"
import {useServiceOperationStore} from "../../features/service-ops/stores/serviceOperationStore"
import {api} from "../../services/tauri-api"
import {
  belongsToProject,
  findDeployableArtifacts,
  flattenModules,
  normalizeProjectRoot,
  pickDefaultTestServer,
} from "../../services/deploymentTopologyService"
import {useAppStore} from "../../store/useAppStore"
import {useNavigationStore} from "../../store/navigationStore"
import {useWorkflowStore} from "../../store/useWorkflowStore"

const deploymentFinished = (status?: string) =>
  Boolean(status && ["success", "failed", "cancelled"].includes(status))

export function BuildNextActionsPanel() {
  const project = useAppStore((state) => state.project)
  const buildStatus = useAppStore((state) => state.buildStatus)
  const artifacts = useAppStore((state) => state.artifacts)
  const currentBuildId = useAppStore((state) => state.currentBuildId)
  const deploymentProfiles = useWorkflowStore((state) => state.deploymentProfiles)
  const serverProfiles = useWorkflowStore((state) => state.serverProfiles)
  const currentDeploymentTask = useWorkflowStore((state) => state.currentDeploymentTask)
  const startDeployment = useWorkflowStore((state) => state.startDeployment)
  const saveRuntimeConfig = useServiceOperationStore((state) => state.saveRuntimeConfig)
  const openLogSession = useRemoteLogSessionStore((state) => state.openSession)
  const setInspectorOpen = useNavigationStore((state) => state.setInspectorOpen)
  const setInspectorTab = useNavigationStore((state) => state.setInspectorTab)
  const setInspectorLogSource = useNavigationStore((state) => state.setInspectorLogSource)
  const [selectedDeploymentProfileId, setSelectedDeploymentProfileId] = useState<string>()
  const [selectedServerId, setSelectedServerId] = useState<string>()
  const [selectedArtifactPath, setSelectedArtifactPath] = useState<string>()
  const [serverPickerOpen, setServerPickerOpen] = useState(false)
  const [serverPickerKeyword, setServerPickerKeyword] = useState("")

  const modules = useMemo(() => flattenModules(project?.modules ?? []), [project?.modules])
  const mappedProfiles = useMemo(
    () => deploymentProfiles.filter((profile) =>
      belongsToProject(profile, project?.rootPath) &&
      artifacts.some((artifact) => findDeployableArtifacts([artifact], profile, modules).length > 0)),
    [artifacts, deploymentProfiles, modules, project?.rootPath],
  )
  const effectiveDeploymentProfileId = mappedProfiles.some((profile) => profile.id === selectedDeploymentProfileId)
    ? selectedDeploymentProfileId
    : mappedProfiles[0]?.id
  const selectedProfile = mappedProfiles.find((profile) => profile.id === effectiveDeploymentProfileId)
  const visibleDeploymentTask = currentDeploymentTask
    && normalizeProjectRoot(currentDeploymentTask.projectRoot) === normalizeProjectRoot(project?.rootPath)
    ? currentDeploymentTask
    : undefined
  const artifactOptions = useMemo(
    () => selectedProfile
      ? findDeployableArtifacts(artifacts, selectedProfile, modules).map((artifact) => ({
          label: `${artifact.fileName}${artifact.modulePath ? ` · ${artifact.modulePath}` : ""}`,
          value: artifact.path,
        }))
      : [],
    [artifacts, modules, selectedProfile],
  )
  const deploymentRunning = Boolean(visibleDeploymentTask && !deploymentFinished(visibleDeploymentTask.status))
  const hasServiceMapping = mappedProfiles.length > 0
  const defaultTestServer = useMemo(() => pickDefaultTestServer(serverProfiles), [serverProfiles])
  const effectiveServerId = serverProfiles.some((server) => server.id === selectedServerId)
    ? selectedServerId
    : defaultTestServer?.id
  const effectiveServer = serverProfiles.find((server) => server.id === effectiveServerId)
  const filteredServers = useMemo(() => {
    const keyword = serverPickerKeyword.trim().toLowerCase()
    if (!keyword) {
      return serverProfiles
    }
    return serverProfiles.filter((server) =>
      [server.name, server.group, server.host, server.username, String(server.port)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword)))
  }, [serverPickerKeyword, serverProfiles])
  const effectiveArtifactPath = artifactOptions.some((artifact) => artifact.value === selectedArtifactPath)
    ? selectedArtifactPath
    : artifactOptions[0]?.value

  const handleViewServiceLog = async () => {
    if (!selectedProfile || !effectiveServer) {
      return
    }
    try {
      const config = deriveRuntimeConfig(selectedProfile, effectiveServer)
      const saved = await saveRuntimeConfig(config)
      await openLogSession(saved)
      setInspectorLogSource("remoteLog")
      setInspectorTab("logs")
      setInspectorOpen(true)
      console.log("已打开服务日志会话")
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
    }
  }

  if (buildStatus !== "SUCCESS") {
    return null
  }

  return (
    <Card className="panel-card next-action-panel">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">下一步操作</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          {artifacts.length === 0 ? (
            <div className="flex items-center gap-2 rounded border border-yellow-200 bg-yellow-50 p-3 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">
              <AlertCircle className="h-4 w-4" />
              <span>构建成功，但未发现 jar/war 产物</span>
            </div>
          ) : null}

          {hasServiceMapping ? (
            <div className="next-action-deploy">
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className="bg-green-500">已有发布映射</Badge>
                  <span className="font-semibold text-sm">可直接部署到测试环境</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Select
                    value={effectiveDeploymentProfileId}
                    onValueChange={(value) => {
                      setSelectedDeploymentProfileId(value)
                      setSelectedArtifactPath(undefined)
                    }}
                  >
                    <SelectTrigger className="min-w-[220px]">
                      <SelectValue placeholder="发布映射" />
                    </SelectTrigger>
                    <SelectContent>
                      {mappedProfiles.map((profile) => (
                        <SelectItem key={profile.id} value={profile.id}>
                          {profile.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="deployment-server-select flex flex-col gap-1">
                    <Button variant="outline" onClick={() => setServerPickerOpen(true)}>
                      {effectiveServer
                        ? `${effectiveServer.name}（${effectiveServer.username}@${effectiveServer.host}:${effectiveServer.port}）`
                        : "选择测试服务器"}
                    </Button>
                    <span className="text-xs text-muted-foreground">当前仅支持单服务器部署</span>
                  </div>
                  <Select
                    value={effectiveArtifactPath}
                    onValueChange={setSelectedArtifactPath}
                  >
                    <SelectTrigger className="min-w-[260px]">
                      <SelectValue placeholder="构建产物" />
                    </SelectTrigger>
                    <SelectContent>
                      {artifactOptions.length === 0 ? (
                        <SelectItem value="__none__" disabled>当前映射没有匹配产物</SelectItem>
                      ) : (
                        artifactOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <Button
                    disabled={!effectiveDeploymentProfileId || !effectiveServerId || !effectiveArtifactPath || deploymentRunning}
                    onClick={() => {
                      if (effectiveDeploymentProfileId && effectiveServerId && effectiveArtifactPath) {
                        void startDeployment(
                          effectiveDeploymentProfileId,
                          effectiveServerId,
                          effectiveArtifactPath,
                          currentBuildId,
                        )
                      }
                    }}
                  >
                    <Rocket className="mr-1 h-4 w-4" />
                    部署到测试
                  </Button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="查看关联服务日志"
                        disabled={!selectedProfile || !effectiveServer}
                        onClick={() => void handleViewServiceLog()}
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>查看关联服务日志</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded border border-blue-200 bg-blue-50 p-3 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
              <Settings className="h-4 w-4 mt-0.5" />
              <div>
                <p className="font-medium">未找到当前产物的后端发布映射</p>
                <p className="text-sm mt-1">请在部署中心的"发布映射"中绑定模块、产物规则、服务名称和部署配置。</p>
              </div>
            </div>
          )}

          {artifacts.length > 0 ? (
            <div className="rounded border">
              {artifacts.slice(0, 4).map((artifact) => (
                <div
                  key={artifact.path}
                  className="flex items-center justify-between border-b last:border-b-0 px-3 py-2"
                >
                  <div className="flex flex-col">
                    <span className="font-semibold text-sm truncate" title={artifact.fileName}>
                      {artifact.fileName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {artifact.modulePath || "根项目"} · {(artifact.sizeBytes / 1024 / 1024).toFixed(2)} MB
                    </span>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void api.openPathInExplorer(artifact.path)}
                      >
                        <FolderOpen className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>定位产物</TooltipContent>
                  </Tooltip>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Info className="h-8 w-8 mb-2" />
              <span>暂无可操作产物</span>
            </div>
          )}
        </div>

        <Dialog open={serverPickerOpen} onOpenChange={setServerPickerOpen}>
          <DialogContent className="max-w-[720px]">
            <DialogHeader>
              <DialogTitle>选择测试服务器</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <Input
                placeholder="搜索服务器名称、分组、主机、用户名或端口"
                value={serverPickerKeyword}
                onChange={(event) => setServerPickerKeyword(event.target.value)}
              />
              <div className="rounded border max-h-[400px] overflow-y-auto">
                {filteredServers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">没有匹配的服务器</div>
                ) : (
                  filteredServers.map((server) => (
                    <div
                      key={server.id}
                      className={`flex items-center justify-between border-b last:border-b-0 px-3 py-2 ${server.id === effectiveServerId ? "bg-accent" : ""}`}
                    >
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{server.name}</span>
                          <Badge variant="outline">{server.group || "默认环境"}</Badge>
                          <Badge variant="outline">{server.authType === "password" ? "密码" : "私钥"}</Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {server.username}@{server.host}:{server.port}
                        </span>
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant={server.id === effectiveServerId ? "default" : "outline"}
                            size="sm"
                            onClick={() => {
                              setSelectedServerId(server.id)
                              setServerPickerOpen(false)
                            }}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {server.id === effectiveServerId ? "已选择" : "选择服务器"}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  ))
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}