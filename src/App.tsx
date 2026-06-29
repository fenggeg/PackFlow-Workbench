import {useCallback, useEffect, useState} from 'react'
import {App as AntApp, ConfigProvider, theme} from 'antd'
import {emit} from '@tauri-apps/api/event'
import {AppShell} from './app/AppShell'
import {SplashOverlay} from './SplashOverlay'
import {isTauriRuntime} from './services/tauri-api'
import {useAppStore} from './store/useAppStore'
import {useWorkflowStore} from './store/useWorkflowStore'
import {useEventSubscriptions} from './hooks/useEventSubscriptions'
import {UI_TOKENS} from './theme/uiTokens'
import './App.css'

function App() {
  const project = useAppStore((state) => state.project)
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
    // Signal Rust to close native splash window and show main window
    if (isTauriRuntime()) {
      emit('app-ready').catch(() => {
        // Silently fail if not in Tauri context
      })
    }

    // Wait one frame after React commits to let the browser paint the shell
    // behind the splash overlay, then fade out the splash smoothly.
    const raf = requestAnimationFrame(() => {
      // Use a second frame to ensure the shell is fully rendered
      requestAnimationFrame(hideSplash)
    })
    return () => cancelAnimationFrame(raf)
  }, [hideSplash])

  return (
    <>
      <SplashOverlay visible={showSplash} />
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
    </>
  )
}

export default App
