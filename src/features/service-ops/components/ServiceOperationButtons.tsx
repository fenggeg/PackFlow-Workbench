import {useState} from "react"
import {Button} from "@/components/ui/button"
import {Tooltip, TooltipContent, TooltipTrigger,} from "@/components/ui/tooltip"
import {FileText, Heart, Loader2, Power, Rocket, Settings,} from "lucide-react"
import type {DeploymentProfile, ServerProfile, ServiceRuntimeConfig,} from "../../../types/domain"
import {useNavigationStore} from "../../../store/navigationStore"
import {hasLogSource, hasRestartCommand,} from "../services/serviceRuntimeConfigService"
import {useRemoteLogSessionStore} from "../stores/remoteLogSessionStore"
import {useServiceOperationStore} from "../stores/serviceOperationStore"
import {RestartConfirmDialog} from "./RestartConfirmDialog"
import {ServiceRuntimeConfigEditor} from "./ServiceRuntimeConfigEditor"

interface ServiceOperationButtonsProps {
  profile: DeploymentProfile
  server: ServerProfile
  config: ServiceRuntimeConfig
  onConfigSaved?: (config: ServiceRuntimeConfig) => void
  onDeploy?: () => void
}

export function ServiceOperationButtons({
  profile,
  server,
  config,
  onConfigSaved,
  onDeploy,
}: ServiceOperationButtonsProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [working, setWorking] = useState(false)
  const saveRuntimeConfig = useServiceOperationStore(
    (state) => state.saveRuntimeConfig,
  )
  const startRestart = useServiceOperationStore(
    (state) => state.startRestart,
  )
  const startHealthCheck = useServiceOperationStore(
    (state) => state.startHealthCheck,
  )
  const openLogSession = useRemoteLogSessionStore(
    (state) => state.openSession,
  )
  const setInspectorOpen = useNavigationStore(
    (state) => state.setInspectorOpen,
  )
  const setInspectorTab = useNavigationStore(
    (state) => state.setInspectorTab,
  )
  const setInspectorLogSource = useNavigationStore(
    (state) => state.setInspectorLogSource,
  )

  const openInspector = (source: "serviceOps" | "remoteLog") => {
    setInspectorLogSource(source)
    setInspectorTab("logs")
    setInspectorOpen(true)
  }

  const saveConfig = async (nextConfig: ServiceRuntimeConfig) => {
    try {
      const saved = await saveRuntimeConfig(nextConfig)
      onConfigSaved?.(saved)
      setConfigOpen(false)
      console.log("服务运行配置已保存")
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
    }
  }

  const handleRestart = async () => {
    if (!hasRestartCommand(config)) {
      console.warn(
        "当前服务未配置重启命令，请先配置 restartCommand 或 stopCommand + startCommand。",
      )
      setConfigOpen(true)
      return
    }
    setConfirmOpen(true)
  }

  const confirmRestart = async () => {
    setWorking(true)
    try {
      await startRestart(config)
      setConfirmOpen(false)
      openInspector("serviceOps")
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
    } finally {
      setWorking(false)
    }
  }

  const handleOpenLog = async () => {
    if (!hasLogSource(config)) {
      console.warn(
        "当前服务未配置日志来源，请先配置日志路径、systemd、Docker 或自定义命令。",
      )
      setConfigOpen(true)
      return
    }
    setWorking(true)
    try {
      const saved = await saveRuntimeConfig(config)
      onConfigSaved?.(saved)
      await openLogSession(saved)
      openInspector("remoteLog")
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
    } finally {
      setWorking(false)
    }
  }

  const handleHealthCheck = async () => {
    setWorking(true)
    try {
      await startHealthCheck(config)
      openInspector("serviceOps")
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
    } finally {
      setWorking(false)
    }
  }

  const LoadingIcon = working ? Loader2 : undefined

  return (
    <>
      <div className="flex flex-wrap gap-1 service-operation-buttons">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              aria-label="重启服务"
              disabled={working}
              onClick={() => void handleRestart()}
            >
              {working ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Power className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>重启服务</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              aria-label="查看远程日志"
              disabled={working}
              onClick={() => void handleOpenLog()}
            >
              {working ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>查看远程日志</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              aria-label="健康检查"
              disabled={working}
              onClick={() => void handleHealthCheck()}
            >
              {working ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Heart className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>健康检查</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              aria-label="部署服务"
              onClick={onDeploy}
            >
              <Rocket className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>部署服务</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              aria-label="服务运行配置"
              onClick={() => setConfigOpen(true)}
            >
              <Settings className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>服务运行配置</TooltipContent>
        </Tooltip>
      </div>
      {confirmOpen ? (
        <RestartConfirmDialog
          open={confirmOpen}
          config={config}
          server={server}
          confirming={working}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => void confirmRestart()}
        />
      ) : null}
      {configOpen ? (
        <ServiceRuntimeConfigEditor
          open={configOpen}
          config={{ ...config, deploymentProfileId: profile.id }}
          onCancel={() => setConfigOpen(false)}
          onSave={(nextConfig) => void saveConfig(nextConfig)}
        />
      ) : null}
    </>
  )
}