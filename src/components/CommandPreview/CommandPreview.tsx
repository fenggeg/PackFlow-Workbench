import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Textarea} from '@/components/ui/textarea'
import {Tooltip, TooltipContent, TooltipTrigger,} from '@/components/ui/tooltip'
import {Copy, FolderOpen, Play, RefreshCw, Save, Square} from 'lucide-react'
import {useState} from 'react'
import {api} from '../../services/tauri-api'
import {useAppStore} from '../../store/useAppStore'
import type {BuildStatus} from '../../types/domain'

const statusText: Record<BuildStatus, string> = {
  IDLE: '未开始',
  RUNNING: '执行中',
  SUCCESS: '成功',
  FAILED: '失败',
  CANCELLED: '已取消',
}

const statusBadgeClass: Record<BuildStatus, string> = {
  IDLE: 'bg-secondary text-secondary-foreground',
  RUNNING: 'bg-blue-500 text-white animate-pulse',
  SUCCESS: 'bg-green-500 text-white',
  FAILED: 'bg-destructive text-destructive-foreground',
  CANCELLED: 'bg-amber-500 text-white',
}

const formatSize = (size: number) => {
  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)} MB`
  }
  if (size >= 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }
  return `${size} B`
}

export function CommandPreview() {
  const buildOptions = useAppStore((state) => state.buildOptions)
  const buildStatus = useAppStore((state) => state.buildStatus)
  const buildCancelling = useAppStore((state) => state.buildCancelling)
  const artifacts = useAppStore((state) => state.artifacts)
  const durationMs = useAppStore((state) => state.durationMs)
  const project = useAppStore((state) => state.project)
  const selectedModules = useAppStore((state) => state.selectedModules)
  const setEditableCommand = useAppStore((state) => state.setEditableCommand)
  const refreshCommandPreview = useAppStore((state) => state.refreshCommandPreview)
  const startBuild = useAppStore((state) => state.startBuild)
  const cancelBuild = useAppStore((state) => state.cancelBuild)
  const saveTemplate = useAppStore((state) => state.saveTemplate)
  const [templateName, setTemplateName] = useState('')
  const [templateOpen, setTemplateOpen] = useState(false)

  const running = buildStatus === 'RUNNING'
  const durationText = durationMs ? `${(durationMs / 1000).toFixed(1)} 秒` : '暂无'
  const commandReady = Boolean(buildOptions.projectRoot && buildOptions.editableCommand.trim())
  const displayStatus = buildStatus === 'IDLE' && commandReady ? 'READY' : buildStatus
  const statusLabel = buildCancelling
    ? '停止中'
    : displayStatus === 'READY'
      ? '待执行'
      : statusText[buildStatus]
  const moduleSummary = selectedModules.length > 0
    ? selectedModules.length === 1
      ? selectedModules[0].artifactId
      : `${selectedModules.length} 个模块`
    : project
      ? '全部项目'
      : '未选择'

  const badgeClass = buildCancelling
    ? 'bg-amber-500 text-white'
    : displayStatus === 'READY'
      ? 'bg-blue-500 text-white'
      : statusBadgeClass[buildStatus]

  return (
    <div className="command-dock">
      <div className="command-dock-main">
        <div className="command-dock-status">
          <Badge className={badgeClass}>
            {statusLabel}
          </Badge>
          <span className="text-sm text-muted-foreground truncate" title={moduleSummary}>
            目标：{moduleSummary}
          </span>
          <span className="text-sm text-muted-foreground">耗时：{durationText}</span>
        </div>
        <div className="command-actions">
          <Button
            disabled={!buildOptions.projectRoot || !buildOptions.editableCommand.trim() || running}
            onClick={() => void startBuild()}
          >
            <Play className="mr-1.5 h-4 w-4" />
            开始打包
          </Button>
          <Button
            variant="destructive"
            disabled={!running || buildCancelling}
            onClick={() => void cancelBuild()}
          >
            <Square className="mr-1.5 h-4 w-4" />
            停止
          </Button>
          <Button variant="outline" size="icon" onClick={() => void refreshCommandPreview()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            disabled={!buildOptions.editableCommand.trim()}
            onClick={() => void navigator.clipboard?.writeText(buildOptions.editableCommand)}
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" disabled={!buildOptions.projectRoot} onClick={() => setTemplateOpen(true)}>
            <Save className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <Textarea
        className="command-textarea command-dock-command resize-none min-h-[3rem] max-h-[5rem]"
        value={buildOptions.editableCommand}
        onChange={(event) => setEditableCommand(event.target.value)}
      />
      {(buildStatus === 'SUCCESS' || artifacts.length > 0) ? (
        <div className="artifact-section artifact-section-compact">
          <span className="text-sm text-muted-foreground">
            {artifacts.length > 0 ? `构建产物 · ${artifacts.length} 个 jar/war` : '未扫描到 jar/war 产物'}
          </span>
          {artifacts.length > 0 ? (
            <div className="flex flex-col gap-1">
              {artifacts.slice(0, 2).map((artifact) => (
                <div key={artifact.path} className="flex items-center justify-between py-1">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-sm font-medium truncate" title={artifact.path}>
                      {artifact.fileName}
                    </span>
                    <span className="text-xs text-muted-foreground artifact-meta">
                      {formatSize(artifact.sizeBytes)}
                      {artifact.modulePath ? ` · ${artifact.modulePath}` : ''}
                    </span>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => void api.openPathInExplorer(artifact.path)}
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>定位产物</TooltipContent>
                  </Tooltip>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>保存常用模板</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="模板名称"
            value={templateName}
            onChange={(event) => setTemplateName(event.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateOpen(false)}>
              取消
            </Button>
            <Button onClick={() => {
              if (templateName.trim()) {
                void saveTemplate(templateName.trim())
                setTemplateName('')
                setTemplateOpen(false)
              }
            }}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
