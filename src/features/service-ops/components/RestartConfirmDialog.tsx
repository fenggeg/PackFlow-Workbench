import {useMemo, useState} from "react"
import {Button} from "@/components/ui/button"
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,} from "@/components/ui/dialog"
import {Input} from "@/components/ui/input"
import {AlertCircle, AlertTriangle, Info} from "lucide-react"
import type {ServerProfile, ServiceRuntimeConfig,} from "../../../types/domain"
import {isHighRiskEnvironment, isPreRiskEnvironment,} from "../services/serviceRuntimeConfigService"

interface RestartConfirmDialogProps {
  open: boolean
  config?: ServiceRuntimeConfig
  server?: ServerProfile
  confirming?: boolean
  onCancel: () => void
  onConfirm: () => void
}

const commandText = (config?: ServiceRuntimeConfig) => {
  if (!config) return "-"
  if (config.restartCommand?.trim()) return config.restartCommand
  const commands = [config.stopCommand, config.startCommand]
    .map((command) => command?.trim())
    .filter((command): command is string => Boolean(command))
  return Array.from(new Set(commands)).join("\n")
}

const restartSummary = (config?: ServiceRuntimeConfig) => {
  if (!config) return "-"
  if (config.restartCommand?.trim()) {
    return "执行重启命令，随后采样启动日志并进行健康检查"
  }
  return "停止旧进程，等待 2 秒，启动服务，采样启动日志并进行健康检查"
}

export function RestartConfirmDialog({
  open,
  config,
  server,
  confirming,
  onCancel,
  onConfirm,
}: RestartConfirmDialogProps) {
  const [confirmText, setConfirmText] = useState("")
  const highRisk = isHighRiskEnvironment(config?.environmentId ?? "")
  const preRisk = isPreRiskEnvironment(config?.environmentId ?? "")
  const canConfirm = !highRisk || confirmText.trim() === config?.serviceName

  const title = highRisk ? "确认重启生产服务？" : "确认重启服务？"
  const riskMessage = useMemo(() => {
    if (highRisk)
      return "生产环境重启必须输入服务名确认，重启期间服务可能短暂不可用。"
    if (preRisk)
      return "预发环境重启风险较高，请确认当前服务和服务器无误。"
    return "重启期间服务可能短暂不可用。"
  }, [highRisk, preRisk])

  const alertStyles = highRisk
    ? "bg-red-500/10 text-red-700 border border-red-500/20"
    : preRisk
      ? "bg-yellow-500/10 text-yellow-700 border border-yellow-500/20"
      : "bg-blue-500/10 text-blue-700 border border-blue-500/20"

  const AlertIcon = highRisk ? AlertCircle : preRisk ? AlertTriangle : Info

  const serverDisplay = server
    ? `${server.name} · ${server.username}@${server.host}:${server.port}`
    : config?.serverId ?? "-"

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3.5">
          <div
            className={`flex items-start gap-2 p-3 rounded-md text-sm ${alertStyles}`}
          >
            <AlertIcon className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{riskMessage}</span>
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm border rounded-md p-3">
            <dt className="text-muted-foreground font-medium">服务</dt>
            <dd>{config?.serviceName ?? "-"}</dd>
            <dt className="text-muted-foreground font-medium">环境</dt>
            <dd>{config?.environmentId ?? "-"}</dd>
            <dt className="text-muted-foreground font-medium">服务器</dt>
            <dd>{serverDisplay}</dd>
            <dt className="text-muted-foreground font-medium">执行流程</dt>
            <dd>{restartSummary(config)}</dd>
          </dl>

          <details className="service-command-details">
            <summary className="text-sm cursor-pointer text-muted-foreground">
              查看完整命令（调试用）
            </summary>
            <code className="text-sm bg-muted px-1 py-0.5 rounded block mt-1 whitespace-pre-wrap service-command-code">
              {commandText(config)}
            </code>
          </details>

          {highRisk ? (
            <Input
              placeholder={`请输入服务名 ${config?.serviceName ?? ""} 确认重启`}
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
            />
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button
            variant={highRisk ? "destructive" : "default"}
            disabled={!canConfirm || confirming}
            onClick={onConfirm}
          >
            {confirming
              ? "重启中..."
              : highRisk
                ? "确认重启生产服务"
                : "确认重启"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}