import {Alert, Button, Card, Input, Space, Typography} from 'antd'
import {FolderOpenOutlined, ReloadOutlined} from '@ant-design/icons'
import {useState} from 'react'
import {useAppStore} from '../../store/useAppStore'

const { Text } = Typography

export function ProjectSelector() {
  const project = useAppStore((state) => state.project)
  const error = useAppStore((state) => state.error)
  const loading = useAppStore((state) => state.loading)
  const chooseProject = useAppStore((state) => state.chooseProject)
  const parseProjectPath = useAppStore((state) => state.parseProjectPath)
  const [manualPath, setManualPath] = useState('')

  const currentPath = project?.rootPath ?? ''

  return (
    <Card title="项目选择" className="panel-card" size="small">
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Button
          type="primary"
          icon={<FolderOpenOutlined />}
          block
          loading={loading}
          onClick={chooseProject}
        >
          选择 Maven 项目
        </Button>
        <Input.Search
          placeholder="也可以粘贴项目根目录"
          enterButton={<ReloadOutlined />}
          value={manualPath}
          onChange={(event) => setManualPath(event.target.value)}
          onSearch={(value) => {
            if (value.trim()) {
              void parseProjectPath(value.trim())
            }
          }}
        />
        {currentPath ? (
          <Text className="path-text" type="secondary">
            {currentPath}
          </Text>
        ) : (
          <Text type="secondary">请选择包含 pom.xml 的父工程目录。</Text>
        )}
        {error ? <Alert type="error" showIcon message={error} /> : null}
      </Space>
    </Card>
  )
}
