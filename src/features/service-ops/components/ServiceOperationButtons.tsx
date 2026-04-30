import {FileTextOutlined, HeartOutlined, PoweroffOutlined, RocketOutlined, SettingOutlined} from '@ant-design/icons'
import {App, Button, Space, Tooltip} from 'antd'
import {useState} from 'react'
import type {DeploymentProfile, ServerProfile, ServiceRuntimeConfig} from '../../../types/domain'
import {useNavigationStore} from '../../../store/navigationStore'
import {hasLogSource, hasRestartCommand} from '../services/serviceRuntimeConfigService'
import {useRemoteLogSessionStore} from '../stores/remoteLogSessionStore'
import {useServiceOperationStore} from '../stores/serviceOperationStore'
import {RestartConfirmDialog} from './RestartConfirmDialog'
import {ServiceRuntimeConfigEditor} from './ServiceRuntimeConfigEditor'

interface ServiceOperationButtonsProps {
  profile: DeploymentProfile
  server: ServerProfile
  config: ServiceRuntimeConfig
  onConfigSaved?: (config: ServiceRuntimeConfig) => void
  onDeploy?: () => void
}

export function ServiceOperationButtons({
  profile,
  server,
  config,
  onConfigSaved,
  onDeploy,
}: ServiceOperationButtonsProps) {
  const {message} = App.useApp()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [working, setWorking] = useState(false)
  const saveRuntimeConfig = useServiceOperationStore((state) => state.saveRuntimeConfig)
  const startRestart = useServiceOperationStore((state) => state.startRestart)
  const startHealthCheck = useServiceOperationStore((state) => state.startHealthCheck)
  const openLogSession = useRemoteLogSessionStore((state) => state.openSession)
  const setInspectorOpen = useNavigationStore((state) => state.setInspectorOpen)
  const setInspectorTab = useNavigationStore((state) => state.setInspectorTab)
  const setInspectorLogSource = useNavigationStore((state) => state.setInspectorLogSource)

  const openInspector = (source: 'serviceOps' | 'remoteLog') => {
    setInspectorLogSource(source)
    setInspectorTab('logs')
    setInspectorOpen(true)
  }

  const saveConfig = async (nextConfig: ServiceRuntimeConfig) => {
    try {
      const saved = await saveRuntimeConfig(nextConfig)
      onConfigSaved?.(saved)
      setConfigOpen(false)
      message.success('服务运行配置已保存')
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error))
    }
  }

  const handleRestart = async () => {
    if (!hasRestartCommand(config)) {
      message.warning('当前服务未配置重启命令，请先配置 restartCommand 或 stopCommand + startCommand。')
      setConfigOpen(true)
      return
    }
    setConfirmOpen(true)
  }

  const confirmRestart = async () => {
    setWorking(true)
    try {
      await startRestart(config)
      setConfirmOpen(false)
      openInspector('serviceOps')
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error))
    } finally {
      setWorking(false)
    }
  }

  const handleOpenLog = async () => {
    if (!hasLogSource(config)) {
      message.warning('当前服务未配置日志来源，请先配置日志路径、systemd、Docker 或自定义命令。')
      setConfigOpen(true)
      return
    }
    setWorking(true)
    try {
      const saved = await saveRuntimeConfig(config)
      onConfigSaved?.(saved)
      await openLogSession(saved)
      openInspector('remoteLog')
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error))
    } finally {
      setWorking(false)
    }
  }

  const handleHealthCheck = async () => {
    setWorking(true)
    try {
      await startHealthCheck(config)
      openInspector('serviceOps')
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error))
    } finally {
      setWorking(false)
    }
  }

  return (
    <>
      <Space size={4} wrap className="service-operation-buttons">
        <Tooltip title="重启服务">
          <Button
            size="small"
            type="text"
            aria-label="重启服务"
            icon={<PoweroffOutlined />}
            loading={working}
            onClick={() => void handleRestart()}
          />
        </Tooltip>
        <Tooltip title="查看远程日志">
          <Button
            size="small"
            type="text"
            aria-label="查看远程日志"
            icon={<FileTextOutlined />}
            loading={working}
            onClick={() => void handleOpenLog()}
          />
        </Tooltip>
        <Tooltip title="健康检查">
          <Button
            size="small"
            type="text"
            aria-label="健康检查"
            icon={<HeartOutlined />}
            loading={working}
            onClick={() => void handleHealthCheck()}
          />
        </Tooltip>
        <Tooltip title="部署服务">
          <Button
            size="small"
            type="text"
            aria-label="部署服务"
            icon={<RocketOutlined />}
            onClick={onDeploy}
          />
        </Tooltip>
        <Tooltip title="服务运行配置">
          <Button
            size="small"
            type="text"
            aria-label="服务运行配置"
            icon={<SettingOutlined />}
            onClick={() => setConfigOpen(true)}
          />
        </Tooltip>
      </Space>
      {confirmOpen ? (
        <RestartConfirmDialog
          open={confirmOpen}
          config={config}
          server={server}
          confirming={working}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => void confirmRestart()}
        />
      ) : null}
      {configOpen ? (
        <ServiceRuntimeConfigEditor
          open={configOpen}
          config={{...config, deploymentProfileId: profile.id}}
          onCancel={() => setConfigOpen(false)}
          onSave={(nextConfig) => void saveConfig(nextConfig)}
        />
      ) : null}
    </>
  )
}
