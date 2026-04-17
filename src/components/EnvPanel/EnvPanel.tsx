import { Alert, Card, Descriptions, Input, Space, Switch, Tag, Typography } from 'antd'
import { useMemo } from 'react'
import { useAppStore } from '../../store/useAppStore'

const { Text } = Typography

export function EnvPanel() {
  const environment = useAppStore((state) => state.environment)
  const updateEnvironment = useAppStore((state) => state.updateEnvironment)

  const items = useMemo(
    () => [
      {
        key: 'java',
        label: 'JDK',
        children: environment?.javaVersion ?? '未识别',
      },
      {
        key: 'javaPath',
        label: 'Java 路径',
        children: environment?.javaPath ?? environment?.javaHome ?? '未设置',
      },
      {
        key: 'maven',
        label: 'Maven',
        children: environment?.mavenVersion ?? '未识别',
      },
      {
        key: 'mavenPath',
        label: 'Maven 路径',
        children: environment?.mavenPath ?? environment?.mavenHome ?? '未设置',
      },
      {
        key: 'settings',
        label: 'settings.xml',
        children: environment?.settingsXmlPath ?? '未找到',
      },
      {
        key: 'wrapper',
        label: 'mvnw.cmd',
        children: environment?.hasMavenWrapper ? (
          <Tag color="green">可用</Tag>
        ) : (
          <Tag>未发现</Tag>
        ),
      },
    ],
    [environment],
  )

  return (
    <Card title="环境识别" className="panel-card" size="small">
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Descriptions size="small" column={1} items={items} />
        {environment?.errors.map((error) => (
          <Alert key={error} type="warning" showIcon message={error} />
        ))}
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Text strong>手工切换</Text>
          <Input
            key={`java-${environment?.javaHome ?? ''}`}
            placeholder="JDK 目录，例如 C:\Program Files\Java\jdk-21"
            defaultValue={environment?.javaHome ?? ''}
            onBlur={(event) =>
              void updateEnvironment({
                javaHome: event.target.value.trim() || undefined,
                mavenHome: environment?.mavenHome,
                useMavenWrapper: environment?.useMavenWrapper ?? false,
              })
            }
            onPressEnter={(event) => event.currentTarget.blur()}
          />
          <Input
            key={`maven-${environment?.mavenHome ?? ''}`}
            placeholder="Maven 可执行文件或目录"
            defaultValue={environment?.mavenHome ?? ''}
            onBlur={(event) =>
              void updateEnvironment({
                javaHome: environment?.javaHome,
                mavenHome: event.target.value.trim() || undefined,
                useMavenWrapper: environment?.useMavenWrapper ?? false,
              })
            }
            onPressEnter={(event) => event.currentTarget.blur()}
          />
          <Switch
            checked={environment?.useMavenWrapper ?? false}
            disabled={!environment?.hasMavenWrapper}
            checkedChildren="优先 mvnw"
            unCheckedChildren="使用 Maven"
            onChange={(checked) =>
              void updateEnvironment({
                javaHome: environment?.javaHome,
                mavenHome: environment?.mavenHome,
                useMavenWrapper: checked,
              })
            }
          />
        </Space>
      </Space>
    </Card>
  )
}
