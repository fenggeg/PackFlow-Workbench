import {useEffect} from 'react'
import {App as AntApp, ConfigProvider, theme} from 'antd'
import {AppShell} from './app/AppShell'
import {useAppStore} from './store/useAppStore'
import {useWorkflowStore} from './store/useWorkflowStore'
import {useEventSubscriptions} from './hooks/useEventSubscriptions'
import {UI_TOKENS} from './theme/uiTokens'
import './App.css'

function App() {
  const project = useAppStore((state) => state.project)
  const loadDependencyGraph = useWorkflowStore((state) => state.loadDependencyGraph)
  const clearDependencyGraph = useWorkflowStore((state) => state.clearDependencyGraph)

  useEventSubscriptions()

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
