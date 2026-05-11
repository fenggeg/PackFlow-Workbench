import React, {useState} from "react";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "@/components/ui/tooltip";
import {Copy, Play, RefreshCw, Save, Square} from "lucide-react";
import {useAppStore} from "../store/useAppStore";
import type {BuildStatus} from "../types/domain";

const statusText: Record<BuildStatus, string> = {
  IDLE: "待构建",
  RUNNING: "构建中",
  SUCCESS: "成功",
  FAILED: "失败",
  CANCELLED: "已停止",
};

const statusVariant: Record<BuildStatus, "default" | "secondary" | "destructive" | "outline"> = {
  IDLE: "secondary",
  RUNNING: "default",
  SUCCESS: "default",
  FAILED: "destructive",
  CANCELLED: "outline",
};

export function BottomActionBar() {
  const buildOptions = useAppStore((state) => state.buildOptions);
  const buildStatus = useAppStore((state) => state.buildStatus);
  const buildCancelling = useAppStore((state) => state.buildCancelling);
  const selectedModules = useAppStore((state) => state.selectedModules);
  const project = useAppStore((state) => state.project);
  const setEditableCommand = useAppStore((state) => state.setEditableCommand);
  const refreshCommandPreview = useAppStore((state) => state.refreshCommandPreview);
  const startBuild = useAppStore((state) => state.startBuild);
  const cancelBuild = useAppStore((state) => state.cancelBuild);
  const saveTemplate = useAppStore((state) => state.saveTemplate);
  const [commandOpen, setCommandOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");

  const running = buildStatus === "RUNNING";
  const commandReady = Boolean(buildOptions.projectRoot && buildOptions.editableCommand.trim());
  const targetLabel =
    selectedModules.length > 0
      ? selectedModules.length === 1
        ? selectedModules[0].artifactId
        : `${selectedModules.length} 个模块`
      : project
        ? "全部项目"
        : "未选择项目";
  const statusLabel = buildCancelling
    ? "停止中"
    : commandReady && buildStatus === "IDLE"
      ? "待执行"
      : statusText[buildStatus];

  return (
    <TooltipProvider delayDuration={0}>
      <footer className="h-16 border-t border-border bg-background flex items-center justify-between px-4 gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant={buildCancelling ? "outline" : commandReady && buildStatus === "IDLE" ? "secondary" : statusVariant[buildStatus]}>
            {statusLabel}
          </Badge>
          <span className="text-sm font-medium truncate">目标：{targetLabel}</span>
        </div>

        <button
          className="flex-1 text-xs text-left font-mono bg-muted/50 px-3 py-2 rounded-md truncate hover:bg-muted transition-colors border border-border"
          disabled={!buildOptions.editableCommand.trim()}
          onClick={() => setCommandOpen(true)}
          title={buildOptions.editableCommand}
        >
          {buildOptions.editableCommand || "选择项目后生成 Maven 命令"}
        </button>

        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" disabled={!buildOptions.editableCommand.trim()} onClick={() => void navigator.clipboard?.writeText(buildOptions.editableCommand)}>
                <Copy className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>复制命令</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => void refreshCommandPreview()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>重新生成命令</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" disabled={!buildOptions.projectRoot} onClick={() => setTemplateOpen(true)}>
                <Save className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>保存为模板</TooltipContent>
          </Tooltip>

          {running ? (
            <Button variant="destructive" disabled={buildCancelling} onClick={() => void cancelBuild()} className="gap-2">
              <Square className="h-4 w-4" /> 停止
            </Button>
          ) : (
            <Button disabled={!commandReady} onClick={() => void startBuild()} className="gap-2">
              <Play className="h-4 w-4" /> 开始构建
            </Button>
          )}
        </div>
      </footer>

      {/* Command Preview Dialog */}
      <Dialog open={commandOpen} onOpenChange={setCommandOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>完整命令预览</DialogTitle>
          </DialogHeader>
          <Textarea
            className="font-mono min-h-[100px]"
            value={buildOptions.editableCommand}
            onChange={(e) => setEditableCommand(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCommandOpen(false)}>关闭</Button>
            <Button onClick={() => setCommandOpen(false)}>保存修改</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template Dialog */}
      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>保存构建模板</DialogTitle>
          </DialogHeader>
          <Input 
            placeholder="模板名称" 
            value={templateName} 
            onChange={(e) => setTemplateName(e.target.value)} 
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateOpen(false)}>取消</Button>
            <Button onClick={() => {
              if (templateName.trim()) {
                void saveTemplate(templateName.trim());
                setTemplateName("");
                setTemplateOpen(false);
              }
            }}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
