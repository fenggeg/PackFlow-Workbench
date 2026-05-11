import {Badge} from "@/components/ui/badge"
import {History} from "lucide-react"
import type {ServiceOperationHistory} from "../../../types/domain"

const operationLabel = (type: ServiceOperationHistory["operationType"]) => {
  switch (type) {
    case "restart":
      return "重启"
    case "view_log":
      return "查看日志"
    case "health_check":
      return "健康检查"
    case "start":
      return "启动"
    case "stop":
      return "停止"
    case "status_check":
      return "状态检查"
    default:
      return type
  }
}

export function ServiceOperationHistoryList({
  items,
}: {
  items: ServiceOperationHistory[]
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <History className="h-8 w-8 mb-2 opacity-40" />
        <span className="text-sm">暂无服务操作历史</span>
      </div>
    )
  }

  return (
    <ul className="divide-y divide-border rounded-md border">
      {items.slice(0, 8).map((item) => (
        <li key={item.id} className="flex items-start justify-between gap-3 px-3 py-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge
                variant={item.result === "success" ? "default" : "destructive"}
              >
                {operationLabel(item.operationType)}
              </Badge>
              <span className="text-sm font-medium">{item.serviceName}</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {item.environmentName} · {item.serverHost} ·{" "}
              {new Date(item.startedAt).toLocaleString()}
            </span>
          </div>
          {item.errorMessage ? (
            <span
              className="text-xs text-destructive truncate max-w-[200px]"
              title={item.errorMessage}
            >
              {item.errorMessage}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  )
}