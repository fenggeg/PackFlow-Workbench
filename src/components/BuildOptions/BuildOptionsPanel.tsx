import { Card, Checkbox, Input, Space, Tooltip, Typography } from 'antd'
import { InfoCircleOutlined } from '@ant-design/icons'
import { useAppStore } from '../../store/useAppStore'

const { Text } = Typography

const splitArgs = (value: string) =>
  value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)

export function BuildOptionsPanel() {
  const buildOptions = useAppStore((state) => state.buildOptions)
  const setBuildOption = useAppStore((state) => state.setBuildOption)

  return (
    <Card title="打包参数" className="panel-card" size="small">
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Text type="secondary">
          默认只生成基础目标；附加参数需要你主动勾选或输入。
        </Text>
        <Checkbox.Group
          value={buildOptions.goals}
          options={[
            { label: 'clean', value: 'clean' },
            { label: 'package', value: 'package' },
            { label: 'install', value: 'install' },
          ]}
          onChange={(values) =>
            setBuildOption(
              'goals',
              values.map(String),
            )
          }
        />
        <Checkbox
          checked={buildOptions.alsoMake}
          onChange={(event) => setBuildOption('alsoMake', event.target.checked)}
        >
          -am{' '}
          <Tooltip title="同时构建目标模块依赖的上游模块。">
            <InfoCircleOutlined />
          </Tooltip>
        </Checkbox>
        <Checkbox
          checked={buildOptions.skipTests}
          onChange={(event) => setBuildOption('skipTests', event.target.checked)}
        >
          -Dmaven.test.skip=true{' '}
          <Tooltip title="跳过测试编译和执行，适合本地快速打包。">
            <InfoCircleOutlined />
          </Tooltip>
        </Checkbox>
        <Input
          addonBefore="-P"
          placeholder="profile，例如 dev,test"
          value={buildOptions.profiles.join(',')}
          onChange={(event) => setBuildOption('profiles', splitArgs(event.target.value))}
        />
        <Input
          placeholder="自定义参数，例如 -DskipITs -U"
          value={buildOptions.customArgs.join(' ')}
          onChange={(event) => setBuildOption('customArgs', splitArgs(event.target.value))}
        />
      </Space>
    </Card>
  )
}
