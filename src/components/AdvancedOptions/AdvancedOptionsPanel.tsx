import {Card, Input, InputNumber, Space, Typography} from 'antd'
import {useMemo} from 'react'
import {useAppStore} from '../../store/useAppStore'

const { Text, Paragraph } = Typography
const { TextArea } = Input

const splitArgs = (value: string) =>
  value
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)

const withoutThreadArg = (args: string[]) =>
  args.filter((arg) => arg !== '-T' && !arg.startsWith('-T'))

const getThreadCount = (args: string[]) => {
  const inline = args.find((arg) => /^-T\S+/.test(arg))
  if (inline) {
    const value = Number(inline.slice(2))
    return Number.isFinite(value) ? value : undefined
  }

  const flagIndex = args.indexOf('-T')
  if (flagIndex >= 0) {
    const value = Number(args[flagIndex + 1])
    return Number.isFinite(value) ? value : undefined
  }

  return undefined
}

export function AdvancedOptionsPanel() {
  const buildOptions = useAppStore((state) => state.buildOptions)
  const setBuildOption = useAppStore((state) => state.setBuildOption)
  const customArgs = buildOptions.customArgs
  const threadCount = useMemo(() => getThreadCount(customArgs), [customArgs])
  const properties = buildOptions.properties

  const setProperty = (key: string, value?: string) => {
    const next = { ...properties }
    if (value?.trim()) {
      next[key] = value.trim()
    } else {
      delete next[key]
    }
    setBuildOption('properties', next)
  }

  const setThreadCount = (value: number | null) => {
    const nextArgs = withoutThreadArg(customArgs)
    if (value) {
      nextArgs.push(`-T${value}`)
    }
    setBuildOption('customArgs', nextArgs)
  }

  return (
    <Card title="高级参数" className="panel-card" size="small">
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        <Paragraph type="secondary" className="compact-paragraph">
          这里的配置会参与最终命令生成，适合覆盖本地仓库、线程数或追加 Maven 原生参数。
        </Paragraph>

        <div className="option-block">
          <Text strong>本地仓库覆盖</Text>
          <Input
            placeholder="例如 D:\\maven-repo"
            value={String(properties['maven.repo.local'] ?? '')}
            onChange={(event) => setProperty('maven.repo.local', event.target.value)}
          />
        </div>

        <div className="option-block">
          <Text strong>版本号 / revision</Text>
          <Input
            placeholder="例如 1.0.0-SNAPSHOT"
            value={String(properties.revision ?? '')}
            onChange={(event) => setProperty('revision', event.target.value)}
          />
        </div>

        <div className="option-block">
          <Text strong>并行构建线程数</Text>
          <InputNumber
            min={1}
            max={16}
            placeholder="不启用"
            value={threadCount}
            onChange={setThreadCount}
          />
        </div>

        <div className="option-block">
          <Text strong>追加 Maven 参数</Text>
          <TextArea
            rows={4}
            className="command-textarea"
            placeholder="例如 -DskipDocker -Denv=dev"
            value={customArgs.join(' ')}
            onChange={(event) => setBuildOption('customArgs', splitArgs(event.target.value))}
          />
        </div>
      </Space>
    </Card>
  )
}
