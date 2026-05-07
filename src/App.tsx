import {useEffect} from 'react'
import {App as AntApp, ConfigProvider, theme} from 'antd'
import {AppShell} from './app/AppShell'
import {registerBuildEvents, registerDeploymentEvents, registerServiceOpsEvents} from './services/tauri-api'
import {useRemoteLogSessionStore} from './features/service-ops/stores/remoteLogSessionStore'
import {useServiceOperationStore} from './features/service-ops/stores/serviceOperationStore'
import {useAppStore} from './store/useAppStore'
import {useWorkflowStore} from './store/useWorkflowStore'
import {useReleaseStore} from './store/useReleaseStore'
import {useUploadProgressStore} from './store/useUploadProgressStore'
import {useDeploymentLogStore} from './store/useDeploymentLogStore'
import {UI_TOKENS} from './theme/uiTokens'
import './App.css'

function App() {
  const initialize = useAppStore((state) => state.initialize)
  const appendBuildLog = useAppStore((state) => state.appendBuildLog)
  const finishBuild = useAppStore((state) => state.finishBuild)
  const project = useAppStore((state) => state.project)
  const initializeWorkflow = useWorkflowStore((state) => state.initialize)
  const initializeRelease = useReleaseStore((state) => state.initialize)
  const initializeServiceOps = useServiceOperationStore((state) => state.initialize)
  const loadDependencyGraph = useWorkflowStore((state) => state.loadDependencyGraph)
  const clearDependencyGraph = useWorkflowStore((state) => state.clearDependencyGraph)
  const updateDeploymentTask = useWorkflowStore((state) => state.updateDeploymentTask)
  const finishDeploymentTask = useWorkflowStore((state) => state.finishDeploymentTask)
  const updateProbeStatuses = useWorkflowStore((state) => state.updateProbeStatuses)
  const updateUploadProgress = useUploadProgressStore((state) => state.updateProgress)
  const clearUploadProgress = useUploadProgressStore((state) => state.clearProgress)
  const appendDeploymentLog = useDeploymentLogStore((state) => state.appendLog)
  const appendReleaseBuildLog = useReleaseStore((state) => state.handleBuildLog)
  const finishReleaseBuild = useReleaseStore((state) => state.handleBuildFinished)
  const appendReleaseDeploymentLog = useReleaseStore((state) => state.handleDeploymentLog)
  const updateReleaseDeploymentTask = useReleaseStore((state) => state.handleDeploymentUpdated)
  const finishReleaseDeploymentTask = useReleaseStore((state) => state.handleDeploymentFinished)
  const startLogFlushTimer = useDeploymentLogStore((state) => state.startFlushTimer)
  const stopLogFlushTimer = useDeploymentLogStore((state) => state.stopFlushTimer)
  const appendServiceOperationLog = useServiceOperationStore((state) => state.appendOperationLog)
  const updateServiceOperationTask = useServiceOperationStore((state) => state.updateOperationTask)
  const finishServiceOperationTask = useServiceOperationStore((state) => state.finishOperationTask)
  const appendRemoteLogLine = useRemoteLogSessionStore((state) => state.appendLine)
  const updateRemoteLogSession = useRemoteLogSessionStore((state) => state.updateSession)

  useEffect(() => {
    initialize()
    void initializeWorkflow()
    void initializeRelease()
    void initializeServiceOps()
    startLogFlushTimer()

    let cleanupBuild: (() => void) | undefined
    let cleanupDeployment: (() => void) | undefined
    let cleanupServiceOps: (() => void) | undefined
    let disposed = false

    void registerBuildEvents(
      (event) => {
        appendBuildLog(event)
        appendReleaseBuildLog(event)
      },
      (event) => {
        finishBuild(event)
        finishReleaseBuild(event)
      },
    ).then((unlisten) => {
      if (disposed) {
        unlisten()
        return
      }
      cleanupBuild = unlisten
    })
    void registerDeploymentEvents(
      (event) => {
        appendDeploymentLog(event)
        appendReleaseDeploymentLog(event)
      },
      (event) => {
        updateDeploymentTask(event)
        updateReleaseDeploymentTask(event)
      },
      (event) => {
        finishDeploymentTask(event)
        finishReleaseDeploymentTask(event)
      },
      updateProbeStatuses,
      (event) => {
        updateUploadProgress(event.taskId, {
          taskId: event.taskId,
          stageKey: event.stageKey,
          percent: event.percent,
          uploadedBytes: event.uploadedBytes,
          totalBytes: event.totalBytes,
          speedBytesPerSecond: event.speedBytesPerSecond,
          message: event.message,
        })
        if (event.percent >= 100) {
          clearUploadProgress(event.taskId)
        }
      },
    ).then((unlisten) => {
      if (disposed) {
        unlisten()
        return
      }
      cleanupDeployment = unlisten
    })
    void registerServiceOpsEvents(
      appendServiceOperationLog,
      updateServiceOperationTask,
      finishServiceOperationTask,
      appendRemoteLogLine,
      updateRemoteLogSession,
    ).then((unlisten) => {
      if (disposed) {
        unlisten()
        return
      }
      cleanupServiceOps = unlisten
    })

    return () => {
      disposed = true
      cleanupBuild?.()
      cleanupDeployment?.()
      cleanupServiceOps?.()
      stopLogFlushTimer()
    }
  }, [
    appendBuildLog,
    appendDeploymentLog,
    appendReleaseBuildLog,
    appendReleaseDeploymentLog,
    appendRemoteLogLine,
    appendServiceOperationLog,
    clearUploadProgress,
    finishBuild,
    finishDeploymentTask,
    finishReleaseBuild,
    finishReleaseDeploymentTask,
    finishServiceOperationTask,
    initialize,
    initializeRelease,
    initializeServiceOps,
    initializeWorkflow,
    startLogFlushTimer,
    stopLogFlushTimer,
    updateDeploymentTask,
    updateReleaseDeploymentTask,
    updateProbeStatuses,
    updateRemoteLogSession,
    updateServiceOperationTask,
    updateUploadProgress,
  ])

  useEffect(() => {
    if (project?.rootPath) {
      void loadDependencyGraph(project.rootPath)
    } else {
      clearDependencyGraph()
    }
  }, [clearDependencyGraph, loadDependencyGraph, project?.rootPath])

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          borderRadius: UI_TOKENS.radius.sm,
          colorPrimary: UI_TOKENS.color.primary,
          colorInfo: UI_TOKENS.color.info,
          colorSuccess: UI_TOKENS.color.success,
          colorWarning: UI_TOKENS.color.warning,
          colorError: UI_TOKENS.color.danger,
          colorText: UI_TOKENS.color.text,
          colorTextSecondary: UI_TOKENS.color.textSecondary,
          colorBorder: UI_TOKENS.color.border,
          colorBgLayout: UI_TOKENS.color.bg,
          colorBgContainer: UI_TOKENS.color.surface,
          fontFamily: UI_TOKENS.fontFamily,
        },
        components: {
          Button: {
            borderRadius: UI_TOKENS.radius.sm,
            controlHeight: 34,
          },
          Card: {
            borderRadiusLG: UI_TOKENS.radius.md,
            boxShadowTertiary: UI_TOKENS.shadow.panel,
            headerFontSize: UI_TOKENS.fontSize.md,
          },
          Drawer: {
            borderRadiusLG: UI_TOKENS.radius.md,
          },
          Input: {
            borderRadius: UI_TOKENS.radius.sm,
          },
          Modal: {
            borderRadiusLG: UI_TOKENS.radius.lg,
          },
          Select: {
            borderRadius: UI_TOKENS.radius.sm,
          },
          Table: {
            headerBg: UI_TOKENS.color.surfaceMuted,
            headerColor: UI_TOKENS.color.textSecondary,
          },
          Tag: {
            borderRadiusSM: UI_TOKENS.radius.sm,
          },
        },
      }}
    >
      <AntApp>
        <AppShell />
      </AntApp>
    </ConfigProvider>
  )
}

export default App
