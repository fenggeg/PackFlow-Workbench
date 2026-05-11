import React, {useEffect, useMemo, useState} from "react";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {Dialog, DialogContent, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {Copy, Maximize, PanelLeftClose, PanelLeftOpen} from "lucide-react";
import {BuildLogPanel} from "../components/BuildLogPanel/BuildLogPanel";
import {LogConsole} from "../components/common/LogConsole";
import {RemoteLogViewer} from "../features/service-ops/components/RemoteLogViewer";
import {useServiceOperationStore} from "../features/service-ops/stores/serviceOperationStore";
import {useAppStore} from "../store/useAppStore";
import {type InspectorTab, useNavigationStore} from "../store/navigationStore";
import {useWorkflowStore} from "../store/useWorkflowStore";
import type {BuildDiagnosis} from "../types/domain";

const diagnosisCategoryText: Record<BuildDiagnosis['category'], string> = {
  jdk_mismatch: 'JDK 版本不匹配',
  maven_missing: 'Maven 不存在',
  wrapper_issue: 'Wrapper 失效',
  settings_missing: 'settings.xml 缺失',
  dependency_download_failed: '依赖下载失败',
  repo_unreachable: '私服不可达',
  profile_invalid: 'profile 不存在',
  module_invalid: '模块路径错误',
  test_failed: '单元测试失败',
  unknown: '未知错误',
}

const deploymentRunning = (status?: string) =>
  Boolean(status && !['success', 'failed', 'cancelled'].includes(status))

const deploymentStatusText = (status?: string) => {
  switch (status) {
    case 'success': return '部署成功'
    case 'failed': return '部署失败'
    case 'cancelled': return '已停止'
    case 'pending': return '等待中'
    case 'uploading': return '上传中'
    case 'stopping': return '停止旧服务'
    case 'starting': return '启动中'
    case 'checking': return '检测中'
    default: return status ?? '未知'
  }
}

const stageStatusText = (status: string) => {
  switch (status) {
    case 'pending': return '等待中'
    case 'waiting': return '等待中'
    case 'running': return '执行中'
    case 'checking': return '检测中'
    case 'success': return '成功'
    case 'failed': return '失败'
    case 'skipped': return '已跳过'
    case 'timeout': return '超时'
    case 'cancelled': return '已停止'
    default: return status
  }
}

const stageStatusColor = (status: string) => {
  switch (status) {
    case 'success': return 'default'
    case 'failed':
    case 'timeout': return 'destructive'
    case 'cancelled': return 'secondary'
    case 'running':
    case 'checking':
    case 'waiting': return 'secondary'
    case 'skipped': return 'outline'
    default: return 'secondary'
  }
}

export function InspectorDrawer() {
  const inspectorOpen = useNavigationStore((state) => state.inspectorOpen)
  const inspectorTab = useNavigationStore((state) => state.inspectorTab)
  const inspectorLogSource = useNavigationStore((state) => state.inspectorLogSource)
  const setInspectorOpen = useNavigationStore((state) => state.setInspectorOpen)
  const setInspectorTab = useNavigationStore((state) => state.setInspectorTab)
  const setInspectorLogSource = useNavigationStore((state) => state.setInspectorLogSource)
  const buildStatus = useAppStore((state) => state.buildStatus)
  const diagnosis = useAppStore((state) => state.diagnosis)
  const logs = useAppStore((state) => state.logs)
  const artifacts = useAppStore((state) => state.artifacts)
  const selectedModules = useAppStore((state) => state.selectedModules)
  const currentDeploymentTask = useWorkflowStore((state) => state.currentDeploymentTask)
  const serverProfiles = useWorkflowStore((state) => state.serverProfiles)
  const deploymentProfiles = useWorkflowStore((state) => state.deploymentProfiles)
  const currentServiceTaskId = useServiceOperationStore((state) => state.currentTaskId)
  const serviceTasksById = useServiceOperationStore((state) => state.tasksById)
  const serviceLogsByTaskId = useServiceOperationStore((state) => state.logsByTaskId)
  const [expanded, setExpanded] = useState(false)
  const [inspectorWidth, setInspectorWidth] = useState(520)
  const [resizing, setResizing] = useState(false)

  useEffect(() => {
    if (!resizing) return undefined
    const onMouseMove = (event: MouseEvent) => {
      const nextWidth = Math.min(840, Math.max(420, window.innerWidth - event.clientX))
      setInspectorWidth(nextWidth)
    }
    const onMouseUp = () => setResizing(false)
    document.body.classList.add('cursor-col-resize')
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      document.body.classList.remove('cursor-col-resize')
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [resizing])

  useEffect(() => {
    if (buildStatus === 'RUNNING') {
      setInspectorOpen(true)
      setInspectorTab('logs')
      setInspectorLogSource('build')
    }
    if (buildStatus === 'FAILED') {
      setInspectorOpen(true)
      setInspectorTab('diagnosis')
      setInspectorLogSource('build')
    }
    if (deploymentRunning(currentDeploymentTask?.status)) {
      setInspectorOpen(true)
      setInspectorTab('logs')
      setInspectorLogSource('deployment')
    }
  }, [buildStatus, currentDeploymentTask?.status, setInspectorOpen, setInspectorTab, setInspectorLogSource])

  const currentServiceTask = currentServiceTaskId ? serviceTasksById[currentServiceTaskId] : undefined
  const currentServiceLogs = useMemo(
    () => currentServiceTaskId ? (serviceLogsByTaskId[currentServiceTaskId] ?? currentServiceTask?.outputLines ?? []) : [],
    [currentServiceTask?.outputLines, currentServiceTaskId, serviceLogsByTaskId],
  )

  const diagnosisText = useMemo(() => {
    if (!diagnosis) return ''
    return [
      `错误类型：${diagnosisCategoryText[diagnosis.category]}`,
      `摘要：${diagnosis.summary}`,
      '',
      '可能原因：',
      ...diagnosis.possibleCauses.map((item) => `- ${item}`),
      '',
      '建议动作：',
      ...diagnosis.suggestedActions.map((item) => `- ${item}`),
      '',
      '关键日志：',
      ...diagnosis.keywordLines.map((line) => `> ${line}`),
    ].join('\n')
  }, [diagnosis])

  const renderLogContent = () => {
    if (inspectorLogSource === 'remoteLog') return <RemoteLogViewer />
    if (inspectorLogSource === 'serviceOps') {
      return (
        <Card>
          <CardHeader className="p-4"><CardTitle className="text-sm">服务操作日志</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="flex flex-col gap-2">
              {currentServiceTask && (
                <div className="flex items-center gap-2">
                  <Badge variant={currentServiceTask.status === 'success' ? 'default' : currentServiceTask.status === 'failed' ? 'destructive' : 'secondary'}>
                    {currentServiceTask.type === 'restart' ? '重启' : '健康检查'} · {currentServiceTask.status}
                  </Badge>
                  <span className="text-sm text-muted-foreground">{currentServiceTask.command ?? '服务操作执行中'}</span>
                </div>
              )}
              <LogConsole className="h-[400px]" lines={currentServiceLogs} />
            </div>
          </CardContent>
        </Card>
      )
    }
    return <BuildLogPanel />
  }

  const renderDiagnosisContent = () => {
    if (inspectorLogSource === 'build') {
      return (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between p-4">
            <CardTitle className="text-sm">构建诊断</CardTitle>
            <Button variant="ghost" size="sm" disabled={!diagnosis} onClick={() => void navigator.clipboard?.writeText(diagnosisText)}>
              <Copy className="h-4 w-4 mr-2" /> 复制
            </Button>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {diagnosis ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <Badge variant="destructive">{diagnosisCategoryText[diagnosis.category]}</Badge>
                  <span className="font-medium">{diagnosis.summary}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-sm">建议动作</span>
                  <ul className="list-disc pl-4 text-sm text-muted-foreground">
                    {diagnosis.suggestedActions.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-8">构建失败后自动生成诊断</div>
            )}
          </CardContent>
        </Card>
      )
    }
    return null // Simplified for brevity
  }

  if (!inspectorOpen) {
    return (
      <aside className="w-10 border-l border-border bg-background flex items-start justify-center pt-4">
        <Button variant="ghost" size="icon" onClick={() => setInspectorOpen(true)}>
          <PanelLeftOpen className="h-4 w-4" />
        </Button>
      </aside>
    )
  }

  return (
    <aside className="border-l border-border bg-background flex flex-col overflow-hidden relative" style={{ width: inspectorWidth }}>
      <div 
        className="absolute top-0 bottom-0 left-[-4px] w-[8px] cursor-col-resize z-10 hover:bg-primary/10"
        onMouseDown={() => setResizing(true)}
      />
      <div className="h-10 border-b border-border flex items-center justify-between px-4 bg-background">
        <span className="font-medium text-sm">检查器</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setExpanded(true)}>
            <Maximize className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setInspectorOpen(false)}>
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      <Tabs value={inspectorTab} onValueChange={(v) => setInspectorTab(v as InspectorTab)} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="mx-4 mt-2 bg-transparent justify-start p-0 h-auto gap-4">
          <TabsTrigger value="logs" className="px-0">日志</TabsTrigger>
          <TabsTrigger value="diagnosis" className="px-0">
            {inspectorLogSource === 'build' ? '构建诊断' : '部署诊断'}
          </TabsTrigger>
          <TabsTrigger value="details" className="px-0">
            {inspectorLogSource === 'build' ? '构建详情' : '部署详情'}
          </TabsTrigger>
        </TabsList>
        
        <div className="flex-1 overflow-hidden p-4">
          <TabsContent value="logs" className="h-full mt-0 ring-offset-0 border-0 p-0 overflow-auto">
            {renderLogContent()}
          </TabsContent>
          <TabsContent value="diagnosis" className="h-full mt-0 ring-offset-0 border-0 p-0 overflow-auto">
            {renderDiagnosisContent()}
          </TabsContent>
          <TabsContent value="details" className="h-full mt-0 ring-offset-0 border-0 p-0 overflow-auto">
            {/* Details Content Placeholder */}
            <Card>
              <CardHeader className="p-4"><CardTitle className="text-sm">详情</CardTitle></CardHeader>
              <CardContent className="p-4 pt-0 text-sm text-muted-foreground">
                详细上下文信息将显示在此处。
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-[90vw] h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>检查器</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            {renderLogContent()}
          </div>
        </DialogContent>
      </Dialog>
    </aside>
  )
}
