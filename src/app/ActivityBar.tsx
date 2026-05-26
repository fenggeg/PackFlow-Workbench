import {
    AppstoreOutlined,
    BuildOutlined,
    CloudServerOutlined,
    DatabaseOutlined,
    DesktopOutlined,
    HistoryOutlined,
    HomeOutlined,
    RocketOutlined,
    SettingOutlined,
} from '@ant-design/icons'
import {Badge, Button, Tooltip} from 'antd'
import type {ReactNode} from 'react'
import {useState} from 'react'
import {useAppStore} from '../store/useAppStore'
import {type AppPage, useNavigationStore} from '../store/navigationStore'
import {useNavigationConfigStore} from '../store/useNavigationConfigStore'
import {useWorkflowStore} from '../store/useWorkflowStore'
import {NavigationSettings} from '../components/NavigationSettings/NavigationSettings'

const pageIcons: Record<AppPage, ReactNode> = {
  dashboard: <HomeOutlined />,
  release: <RocketOutlined />,
  build: <BuildOutlined />,
  artifacts: <DatabaseOutlined />,
  deployment: <CloudServerOutlined />,
  services: <AppstoreOutlined />,
  servers: <DesktopOutlined />,
  history: <HistoryOutlined />,
}

const hasRunningDeployment = (status?: string) =>
  Boolean(status && !['success', 'failed', 'cancelled'].includes(status))

export function ActivityBar() {
  const activePage = useNavigationStore((state) => state.activePage)
  const setActivePage = useNavigationStore((state) => state.setActivePage)
  const buildStatus = useAppStore((state) => state.buildStatus)
  const currentDeploymentTask = useWorkflowStore((state) => state.currentDeploymentTask)
  const navigationItems = useNavigationConfigStore((state) => state.items)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const visibleItems = navigationItems
    .filter((item) => item.visible)
    .sort((a, b) => a.order - b.order)

  const renderIcon = (key: AppPage) => {
    const running = (key === 'build' && buildStatus === 'RUNNING')
      || (key === 'deployment' && hasRunningDeployment(currentDeploymentTask?.status))

    const icon = pageIcons[key]
    return running ? <Badge status="processing">{icon}</Badge> : icon
  }

  return (
    <>
      <nav className="activity-bar" aria-label="一级功能导航">
        <div className="activity-bar-items">
          {visibleItems.map((item) => (
            <Tooltip key={item.key} title={item.label} placement="right">
              <Button
                type={activePage === item.key ? 'primary' : 'text'}
                className="activity-button"
                icon={renderIcon(item.key)}
                aria-label={item.label}
                onClick={() => setActivePage(item.key)}
              />
            </Tooltip>
          ))}
        </div>
        <div className="activity-bar-bottom">
          <Tooltip title="导航栏设置" placement="right">
            <Button
              type="text"
              className="activity-button"
              icon={<SettingOutlined />}
              onClick={() => setSettingsOpen(true)}
            />
          </Tooltip>
        </div>
      </nav>
      <NavigationSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}
