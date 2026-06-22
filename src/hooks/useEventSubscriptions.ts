import {useEffect} from 'react'
import {registerBuildEvents, registerServiceOpsEvents} from '../services/tauri-api'
import {useRemoteLogSessionStore} from '../features/service-ops/stores/remoteLogSessionStore'
import {useServiceOperationStore} from '../features/service-ops/stores/serviceOperationStore'
import {useAppStore} from '../store/useAppStore'
import {useWorkflowStore} from '../store/useWorkflowStore'

export function useEventSubscriptions() {
  const appendBuildLog = useAppStore((state) => state.appendBuildLog)
  const finishBuild = useAppStore((state) => state.finishBuild)
  const initialize = useAppStore((state) => state.initialize)
  const initializeWorkflow = useWorkflowStore((state) => state.initialize)
  const initializeServiceOps = useServiceOperationStore((state) => state.initialize)
  const appendServiceOperationLog = useServiceOperationStore((state) => state.appendOperationLog)
  const updateServiceOperationTask = useServiceOperationStore((state) => state.updateOperationTask)
  const finishServiceOperationTask = useServiceOperationStore((state) => state.finishOperationTask)
  const appendRemoteLogLine = useRemoteLogSessionStore((state) => state.appendLine)
  const updateRemoteLogSession = useRemoteLogSessionStore((state) => state.updateSession)

  useEffect(() => {
    initialize()
    void initializeWorkflow()
    void initializeServiceOps()

    let cleanupBuild: (() => void) | undefined
    let cleanupServiceOps: (() => void) | undefined
    let disposed = false

    void registerBuildEvents(
      (event) => {
        appendBuildLog(event)
      },
      (event) => {
        finishBuild(event)
      },
    ).then((unlisten) => {
      if (disposed) {
        unlisten()
        return
      }
      cleanupBuild = unlisten
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
      cleanupServiceOps?.()
    }
  }, [
    appendBuildLog,
    appendRemoteLogLine,
    appendServiceOperationLog,
    finishBuild,
    finishServiceOperationTask,
    initialize,
    initializeServiceOps,
    initializeWorkflow,
    updateRemoteLogSession,
    updateServiceOperationTask,
  ])
}
