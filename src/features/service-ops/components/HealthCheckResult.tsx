import {Button} from "@/components/ui/button"
import {AlertCircle, CheckCircle2} from "lucide-react"
import type {ServiceOperationTask} from "../../../types/domain"

interface HealthCheckResultProps {
  task?: ServiceOperationTask
  onViewLog?: () => void
  onRetry?: () => void
}

export function HealthCheckResult({ task, onViewLog, onRetry }: HealthCheckResultProps) {
  if (!task || task.type !== "health_check") {
    return null
  }

  const success = task.status === "success"
  const message = success ? "健康检查通过" : task.errorMessage ?? "健康检查失败"
  const description = task.outputLines.at(-1)

  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-md text-sm ${
        success
          ? "bg-green-500/10 text-green-700 border border-green-500/20"
          : "bg-red-500/10 text-red-700 border border-red-500/20"
      }`}
    >
      {success ? (
        <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
      ) : (
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="font-medium">{message}</div>
        {description && (
          <div className="mt-1 text-xs opacity-80">{description}</div>
        )}
        {!success && (
          <div className="flex gap-2 mt-2">
            <Button size="sm" variant="outline" onClick={onViewLog}>
              查看日志
            </Button>
            <Button size="sm" onClick={onRetry}>
              重试健康检查
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}