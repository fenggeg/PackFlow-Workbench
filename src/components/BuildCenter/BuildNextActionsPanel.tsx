import {Alert, App, Button, Card, Empty, List, Result, Space, Tag, Tooltip, Typography} from 'antd'
import {
  CopyOutlined,
  FolderOpenOutlined,
  ReloadOutlined,
  SendOutlined,
} from '@ant-design/icons'
import {useState} from 'react'
import {useAppStore} from '../../store/useAppStore'
import {useNavigationStore} from '../../store/navigationStore'
import {useCommandStore} from '../../store/useCommandStore'
import {api} from '../../services/tauri-api'

const {Text} = Typography

export function BuildNextActionsPanel() {
  const {message} = App.useApp()
  const buildStatus = useAppStore((state) => state.buildStatus)
  const buildCancelling = useAppStore((state) => state.buildCancelling)
  const artifacts = useAppStore((state) => state.artifacts)
  const diagnosis = useAppStore((state) => state.diagnosis)
  const startBuild = useAppStore((state) => state.startBuild)
  const setActivePage = useNavigationStore((state) => state.setActivePage)
  const [selectedArtifactPath, setSelectedArtifactPath] = useState<string>()

  if (buildStatus === 'RUNNING' || buildCancelling) {
    return null
  }

  if (buildStatus === 'FAILED' || buildStatus === 'CANCELLED') {
    return (
      <Card title="下一步操作" className="panel-card next-action-panel" size="small">
        <Result
          status={buildStatus === 'FAILED' ? 'error' : 'warning'}
          title={buildStatus === 'FAILED' ? '构建失败' : '构建已停止'}
          subTitle={diagnosis?.summary ?? '请查看构建日志了解详情。'}
          extra={[
            <Button
              key="retry"
              type="primary"
              icon={<ReloadOutlined />}
              onClick={() => void startBuild()}
            >
              重新构建
            </Button>,
          ]}
        />
      </Card>
    )
  }

  if (buildStatus !== 'SUCCESS') {
    return null
  }

  const handleSendToCommandCenter = (artifactPath: string) => {
    // 设置变量编辑器中的 artifactPath
    useCommandStore.getState().setPresetVariable('artifactPath', artifactPath)
    // 导航到命令调度中心
    setActivePage('deployment')
    message.success('已发送到命令调度中心')
  }

  return (
    <Card title="下一步操作" className="panel-card next-action-panel" size="small">
      <Space direction="vertical" size={12} style={{width: '100%'}}>
        {artifacts.length === 0 ? (
          <Alert
            type="warning"
            showIcon
            message="构建成功，但未发现 jar/war 产物"
          />
        ) : null}

        <div className="next-action-deploy">
          <Space direction="vertical" size={10} style={{width: '100%'}}>
            <Space size={8} wrap>
              <Tag color="blue">命令调度模式</Tag>
              <Text strong>可发送产物到命令调度中心</Text>
            </Space>
            <Space wrap>
              <Button
                type="primary"
                icon={<SendOutlined />}
                disabled={!selectedArtifactPath}
                onClick={() => selectedArtifactPath && handleSendToCommandCenter(selectedArtifactPath)}
              >
                发送到命令中心
              </Button>
            </Space>
          </Space>
        </div>

        {artifacts.length > 0 ? (
          <List
            size="small"
            bordered
            dataSource={artifacts.slice(0, 4)}
            renderItem={(artifact) => (
              <List.Item
                actions={[
                  <Tooltip key="copy" title="复制文件">
                    <Button
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={() => {
                        void api.copyFileToClipboard(artifact.path).then(
                          () => message.success('已复制到剪贴板'),
                          (error) => message.error(error instanceof Error ? error.message : String(error)),
                        )
                      }}
                    />
                  </Tooltip>,
                  <Tooltip key="open" title="定位产物">
                    <Button
                      size="small"
                      icon={<FolderOpenOutlined />}
                      onClick={() => void api.openPathInExplorer(artifact.path)}
                    />
                  </Tooltip>,
                  <Tooltip key="send" title="发送到命令中心">
                    <Button
                      size="small"
                      type="primary"
                      icon={<SendOutlined />}
                      onClick={() => {
                        setSelectedArtifactPath(artifact.path)
                        handleSendToCommandCenter(artifact.path)
                      }}
                    />
                  </Tooltip>,
                ]}
              >
                <Space direction="vertical" size={0} className="artifact-item">
                  <Text strong ellipsis title={artifact.fileName}>{artifact.fileName}</Text>
                  <Text type="secondary" className="artifact-meta">
                    {artifact.modulePath || '根项目'} · {(artifact.sizeBytes / 1024 / 1024).toFixed(2)} MB
                  </Text>
                </Space>
              </List.Item>
            )}
          />
        ) : (
          <Empty description="暂无可操作产物" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </Space>
    </Card>
  )
}
