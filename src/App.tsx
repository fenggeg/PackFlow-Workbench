import {useCallback, useEffect, useState} from 'react'
import {emit} from '@tauri-apps/api/event'
import {AppShell} from './app/AppShell'
import {SplashOverlay} from './SplashOverlay'
import {isTauriRuntime} from './services/tauri-api'
import {useAppStore} from './store/useAppStore'
import {useWorkflowStore} from './store/useWorkflowStore'
import {useEventSubscriptions} from './hooks/useEventSubscriptions'

function App() {
  const project = useAppStore((state) => state.project)
  const initialized = useAppStore((state) => state.initialized)
  const loadDependencyGraph = useWorkflowStore((state) => state.loadDependencyGraph)
  const clearDependencyGraph = useWorkflowStore((state) => state.clearDependencyGraph)
  const [showSplash, setShowSplash] = useState(true)

  useEventSubscriptions()

  useEffect(() => {
    if (project?.rootPath) {
      void loadDependencyGraph(project.rootPath)
    } else {
      clearDependencyGraph()
    }
  }, [clearDependencyGraph, loadDependencyGraph, project?.rootPath])

  const hideSplash = useCallback(() => {
    setShowSplash(false)
  }, [])

  useEffect(() => {
    if (!initialized) return

    if (isTauriRuntime()) {
      emit('app-ready').catch(() => {
        // Silently fail if not in Tauri context
      })
    }

    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(hideSplash)
    })
    return () => cancelAnimationFrame(raf)
  }, [hideSplash, initialized])

  return (
    <>
      <SplashOverlay visible={showSplash} />
      <AppShell />
    </>
  )
}

export default App
