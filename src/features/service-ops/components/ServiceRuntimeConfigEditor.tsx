import {Button} from "@/components/ui/button"
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from "@/components/ui/dialog"
import {Input} from "@/components/ui/input"
import {Textarea} from "@/components/ui/textarea"
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select"
import {useState} from 'react'
import type {LogSourceType, ServiceRuntimeConfig} from '../../../types/domain'

interface ServiceRuntimeConfigEditorProps {
  open: boolean
  config?: ServiceRuntimeConfig
  onCancel: () => void
  onSave: (config: ServiceRuntimeConfig) => void
}

const logSourceOptions: {label: string; value: LogSourceType}[] = [
  {label: '文件日志', value: 'file'},
  {label: 'systemd', value: 'systemd'},
  {label: 'Docker', value: 'docker'},
  {label: '自定义命令', value: 'custom'},
]

export function ServiceRuntimeConfigEditor({
  open,
  config,
  onCancel,
  onSave,
}: ServiceRuntimeConfigEditorProps) {
  const [draft, setDraft] = useState<ServiceRuntimeConfig | undefined>(config)

  if (!draft) {
    return null
  }

  const logSource = draft.logSource ?? {type: 'file' as const, tailLines: 300}

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel() }}>
      <DialogContent className="max-w-[780px]">
        <DialogHeader>
          <DialogTitle>服务运行配置 · {draft.serviceName}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3.5 w-full">
          <span className="text-muted-foreground text-sm">服务：{draft.serviceName} · 环境：{draft.environmentId}</span>
          <div className="border border-blue-500/50 bg-blue-500/10 rounded-md p-3 text-sm">
            <p className="font-medium">通常不需要手写重启命令</p>
            <p className="text-muted-foreground">默认会复用部署配置中的停止、启动和健康检查流程。只有服务使用 systemd、Docker 或自定义脚本时，再展开高级命令覆盖。</p>
          </div>
          <details className="service-command-details">
            <summary>高级命令覆盖</summary>
            <div className="flex flex-col gap-2.5 mt-2.5">
              <Textarea
                rows={2}
                placeholder="restartCommand，例如 sh restart.sh"
                value={draft.restartCommand ?? ''}
                onChange={(event) => setDraft({...draft, restartCommand: event.target.value || undefined})}
              />
              <Textarea
                rows={2}
                placeholder="stopCommand，没有 restartCommand 时使用"
                value={draft.stopCommand ?? ''}
                onChange={(event) => setDraft({...draft, stopCommand: event.target.value || undefined})}
              />
              <Textarea
                rows={2}
                placeholder="startCommand，没有 restartCommand 时使用"
                value={draft.startCommand ?? ''}
                onChange={(event) => setDraft({...draft, startCommand: event.target.value || undefined})}
              />
            </div>
          </details>
          <Input
            placeholder="healthCheckUrl，例如 http://127.0.0.1:8080/actuator/health"
            value={draft.healthCheckUrl ?? ''}
            onChange={(event) => setDraft({...draft, healthCheckUrl: event.target.value || undefined})}
          />
          <Input
            placeholder="workDir，例如 /opt/apps/business-service"
            value={draft.workDir ?? ''}
            onChange={(event) => setDraft({...draft, workDir: event.target.value || undefined})}
          />
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={logSource.type} onValueChange={(value) => setDraft({...draft, logSource: {...logSource, type: value as LogSourceType}})}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {logSourceOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground">tail</span>
              <Input
                type="number"
                className="w-[100px]"
                min={50}
                max={5000}
                value={logSource.tailLines}
                onChange={(event) => setDraft({...draft, logSource: {...logSource, tailLines: Number(event.target.value) || 300}})}
              />
            </div>
          </div>
          {logSource.type === 'file' ? (
            <Input
              placeholder="日志文件路径，例如 /opt/apps/business/logs/app.log"
              value={logSource.logPath ?? ''}
              onChange={(event) => setDraft({...draft, logSource: {...logSource, logPath: event.target.value || undefined}})}
            />
          ) : null}
          {logSource.type === 'systemd' ? (
            <Input
              placeholder="systemd Unit，例如 business-service"
              value={logSource.systemdUnit ?? ''}
              onChange={(event) => setDraft({...draft, logSource: {...logSource, systemdUnit: event.target.value || undefined}})}
            />
          ) : null}
          {logSource.type === 'docker' ? (
            <Input
              placeholder="Docker 容器名称"
              value={logSource.dockerContainerName ?? ''}
              onChange={(event) => setDraft({...draft, logSource: {...logSource, dockerContainerName: event.target.value || undefined}})}
            />
          ) : null}
          {logSource.type === 'custom' ? (
            <Textarea
              rows={3}
              placeholder="自定义日志命令，例如 tail -n 300 -f /opt/apps/business/logs/app.log"
              value={logSource.customCommand ?? ''}
              onChange={(event) => setDraft({...draft, logSource: {...logSource, customCommand: event.target.value || undefined}})}
            />
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>取消</Button>
          <Button onClick={() => onSave(draft)}>保存配置</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}