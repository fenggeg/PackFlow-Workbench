import {useEffect, useState} from 'react'
import type {TabsProps} from 'antd'
import {App as AntApp, ConfigProvider, Layout, Menu, Space, Tabs, Tag, theme, Typography} from 'antd'
import {
    AppstoreAddOutlined,
    BranchesOutlined,
    FolderOpenOutlined,
    FolderOutlined,
    NodeIndexOutlined,
} from '@ant-design/icons'
import {AdvancedOptionsPanel} from './components/AdvancedOptions/AdvancedOptionsPanel'
import {BuildLogPanel} from './components/BuildLogPanel/BuildLogPanel'
import {BuildOptionsPanel} from './components/BuildOptions/BuildOptionsPanel'
import {CommandPreview} from './components/CommandPreview/CommandPreview'
import {DeploymentCenterPanel} from './components/Deployment/DeploymentCenterPanel'
import {EnvPanel} from './components/EnvPanel/EnvPanel'
import {FavoriteGroupsCard} from './components/FavoriteGroups/FavoriteGroupsCard'
import {GitStatusCard} from './components/GitStatus/GitStatusCard'
import {WorkbenchHistoryPanel} from './components/HistoryTable/WorkbenchHistoryPanel'
import {ModuleTreePanel} from './components/ModuleTree/ModuleTreePanel'
import {ProjectSelector} from './components/ProjectSelector/ProjectSelector'
import {TaskPipelinePanel} from './components/TaskPipeline/TaskPipelinePanel'
import {TemplatePanel} from './components/TemplatePanel/TemplatePanel'
import {UpdateChecker} from './components/UpdateChecker/UpdateChecker'
import {registerBuildEvents, registerDeploymentEvents, registerTaskPipelineEvents,} from './services/tauri-api'
import {useAppStore} from './store/useAppStore'
import {useWorkflowStore} from './store/useWorkflowStore'
import './App.css'

const { Header, Sider, Content } = Layout
const { Title, Text } = Typography
type SidebarSection = 'project' | 'git' | 'modules' | 'favorites'

const branchStatusColor = (hasLocalChanges?: boolean, hasRemoteUpdates?: boolean) => {
  if (hasRemoteUpdates) {
    return 'orange'
  }
  if (hasLocalChanges) {
    return 'gold'
  }
  return 'green'
}

function App() {
  const [activeSidebarSection, setActiveSidebarSection] = useState<SidebarSection>('modules')
  const initialize = useAppStore((state) => state.initialize)
  const appendBuildLog = useAppStore((state) => state.appendBuildLog)
  const finishBuild = useAppStore((state) => state.finishBuild)
  const project = useAppStore((state) => state.project)
  const gitStatus = useAppStore((state) => state.gitStatus)
  const selectedModuleIds = useAppStore((state) => state.selectedModuleIds)
  const templates = useAppStore((state) => state.templates)
  const savedProjectPaths = useAppStore((state) => state.savedProjectPaths)
  const initializeWorkflow = useWorkflowStore((state) => state.initialize)
  const loadDependencyGraph = useWorkflowStore((state) => state.loadDependencyGraph)
  const clearDependencyGraph = useWorkflowStore((state) => state.clearDependencyGraph)
  const appendTaskPipelineLog = useWorkflowStore((state) => state.appendTaskPipelineLog)
  const updateTaskPipelineStep = useWorkflowStore((state) => state.updateTaskPipelineStep)
  const finishTaskPipeline = useWorkflowStore((state) => state.finishTaskPipeline)
  const appendDeploymentLog = useWorkflowStore((state) => state.appendDeploymentLog)
  const updateDeploymentTask = useWorkflowStore((state) => state.updateDeploymentTask)
  const finishDeploymentTask = useWorkflowStore((state) => state.finishDeploymentTask)

  useEffect(() => {
    initialize()
    void initializeWorkflow()

    let cleanupBuild: (() => void) | undefined
    let cleanupPipeline: (() => void) | undefined
    let cleanupDeployment: (() => void) | undefined
    let disposed = false
    void registerBuildEvents(appendBuildLog, finishBuild).then((unlisten) => {
      if (disposed) {
        unlisten()
        return
      }
      cleanupBuild = unlisten
    })
    void registerTaskPipelineEvents(
      appendTaskPipelineLog,
      updateTaskPipelineStep,
      finishTaskPipeline,
    ).then((unlisten) => {
      if (disposed) {
        unlisten()
        return
      }
      cleanupPipeline = unlisten
    })
    void registerDeploymentEvents(
      appendDeploymentLog,
      updateDeploymentTask,
      finishDeploymentTask,
    ).then((unlisten) => {
      if (disposed) {
        unlisten()
        return
      }
      cleanupDeployment = unlisten
    })

    return () => {
      disposed = true
      cleanupBuild?.()
      cleanupPipeline?.()
      cleanupDeployment?.()
    }
  }, [
    appendBuildLog,
    appendDeploymentLog,
    appendTaskPipelineLog,
    finishBuild,
    finishDeploymentTask,
    finishTaskPipeline,
    initialize,
    initializeWorkflow,
    updateDeploymentTask,
    updateTaskPipelineStep,
  ])

  useEffect(() => {
    if (project?.rootPath) {
      void loadDependencyGraph(project.rootPath)
    } else {
      clearDependencyGraph()
    }
  }, [clearDependencyGraph, loadDependencyGraph, project?.rootPath])

  const buildTabs: TabsProps['items'] = [
    {
      key: 'execute',
      label: '执行配置',
      children: <BuildOptionsPanel />,
    },
    {
      key: 'environment',
      label: '环境中心',
      children: <EnvPanel />,
    },
    {
      key: 'pipeline',
      label: '任务编排',
      children: <TaskPipelinePanel />,
    },
    {
      key: 'deployment',
      label: '部署中心',
      children: <DeploymentCenterPanel />,
    },
    {
      key: 'advanced',
      label: '高级参数',
      children: <AdvancedOptionsPanel />,
    },
  ]

  const outputTabs: TabsProps['items'] = [
    {
      key: 'logs',
      label: '日志',
      children: <BuildLogPanel />,
    },
    {
      key: 'history',
      label: '历史',
      children: <WorkbenchHistoryPanel />,
    },
    {
      key: 'templates',
      label: '模板',
      children: <TemplatePanel />,
    },
  ]

  const sidebarItems = [
    {
      key: 'project',
      icon: <FolderOpenOutlined />,
      label: savedProjectPaths.length > 0 ? `项目 · ${savedProjectPaths.length}` : '项目',
    },
    {
      key: 'git',
      icon: <BranchesOutlined />,
      label: 'Git',
      disabled: !project,
    },
    {
      key: 'modules',
      icon: <NodeIndexOutlined />,
      label: selectedModuleIds.length > 0 ? `模块 · ${selectedModuleIds.length}` : '模块',
    },
    {
      key: 'favorites',
      icon: <AppstoreAddOutlined />,
      label: templates.length > 0 ? `常用 · ${templates.length}` : '常用',
    },
  ]

  const sidebarPanel = {
    project: <ProjectSelector />,
    git: <GitStatusCard />,
    modules: <ModuleTreePanel />,
    favorites: <FavoriteGroupsCard />,
  }[activeSidebarSection]

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          borderRadius: 6,
          colorPrimary: '#16a34a',
          fontFamily:
            'Inter, "Segoe UI", "Microsoft YaHei", system-ui, sans-serif',
        },
      }}
    >
      <AntApp>
        <Layout className="app-shell">
          <Header className="app-header">
            <div className="app-header-copy">
              <Title level={3} className="app-title">Maven Packager</Title>
              <Space size={8} wrap className="app-context">
                <Tag icon={<FolderOutlined />} color={project ? 'blue' : 'default'}>
                  {project?.artifactId ?? '尚未选择项目'}
                </Tag>
                <Tag
                  icon={<BranchesOutlined />}
                  color={branchStatusColor(gitStatus?.hasLocalChanges, gitStatus?.hasRemoteUpdates)}
                >
                  {gitStatus?.branch ?? '未识别分支'}
                </Tag>
                <Text type="secondary" className="app-path" title={project?.rootPath}>
                  {project?.rootPath ?? '选择项目后自动识别模块、Git 与构建环境'}
                </Text>
              </Space>
            </div>
            <Space size={12} className="app-header-actions">
              <UpdateChecker />
            </Space>
          </Header>
          <Layout className="app-main">
            <Sider width={400} className="app-sider">
              <div className="sidebar-nav-shell">
                <Menu
                  className="sidebar-menu"
                  mode="horizontal"
                  selectedKeys={[activeSidebarSection]}
                  items={sidebarItems}
                  onClick={({ key }) => setActiveSidebarSection(key as SidebarSection)}
                />
                <div className="sidebar-panel-host">
                  {sidebarPanel}
                </div>
              </div>
            </Sider>
            <Content className="app-content">
              <div className="workbench-grid">
                <section className="workbench-column build-column">
                  <Tabs items={buildTabs} className="panel-tabs build-tabs" />
                  <CommandPreview />
                </section>
                <section className="workbench-column output-column">
                  <Tabs items={outputTabs} className="panel-tabs output-tabs" />
                </section>
              </div>
            </Content>
          </Layout>
        </Layout>
      </AntApp>
    </ConfigProvider>
  )
}

export default App
