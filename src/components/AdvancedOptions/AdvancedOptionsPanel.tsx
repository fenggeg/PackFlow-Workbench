import {useState} from 'react'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {useAppStore} from '@/store/useAppStore'
import {useEnvironmentStore} from '@/store/useEnvironmentStore'
import {notifyError} from '@/store/useFeedbackStore'

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.trunc(value)))

export function AdvancedOptionsPanel() {
  const buildOptions = useAppStore((state) => state.buildOptions)
  const setBuildOption = useAppStore((state) => state.setBuildOption)
  const setThreadCount = useAppStore((state) => state.setThreadCount)
  const environmentSettings = useEnvironmentStore((state) => state.environmentSettings)
  const updateEnvironment = useEnvironmentStore((state) => state.updateEnvironment)
  const properties = buildOptions.properties
  const threadCount = buildOptions.threadCount
  const maxConcurrentBuilds = environmentSettings?.maxConcurrentBuilds ?? 2
  const [threadDraft, setThreadDraft] = useState('')
  const [concurrentDraft, setConcurrentDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const setProperty = (key: string, value?: string) => {
    const next = {...properties}
    if (value?.trim()) {
      next[key] = value.trim()
    } else {
      delete next[key]
    }
    setBuildOption('properties', next)
  }

  const commitThreadCount = (raw: string) => {
    setThreadDraft('')
    if (!raw.trim()) {
      setThreadCount(undefined)
      return
    }
    const parsed = Number(raw)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      notifyError('线程数无效', '请输入 1 到 16 之间的整数。')
      return
    }
    setThreadCount(clamp(parsed, 1, 16))
  }

  const commitMaxConcurrentBuilds = async (raw: string) => {
    setConcurrentDraft('')
    const parsed = Number(raw)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      notifyError('并发数无效', '请输入 1 到 8 之间的整数。')
      return
    }
    if (!environmentSettings) return
    const value = clamp(parsed, 1, 8)
    setSaving(true)
    try {
      await updateEnvironment({...environmentSettings, maxConcurrentBuilds: value})
    } catch (error) {
      notifyError('保存失败', error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>高级参数</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3.5">
        <p className="m-0 text-[13px] text-[var(--muted-foreground)]">
          这里的配置会参与最终命令生成，适合覆盖本地仓库、线程数或版本号。附加参数（如 -U、-Dxxx）请在「打包参数」中设置。
        </p>

        <label className="flex flex-col gap-1.5 text-[13px]">
          <span className="font-medium">本地仓库覆盖</span>
          <Input
            placeholder="例如 D:\\maven-repo"
            value={String(properties['maven.repo.local'] ?? '')}
            onChange={(event) => setProperty('maven.repo.local', event.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1.5 text-[13px]">
          <span className="font-medium">版本号 / revision</span>
          <Input
            placeholder="例如 1.0.0-SNAPSHOT"
            value={String(properties.revision ?? '')}
            onChange={(event) => setProperty('revision', event.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1.5 text-[13px]">
          <span className="font-medium">并行构建线程数</span>
          <Input
            type="number"
            min={1}
            max={16}
            placeholder="不启用"
            value={threadDraft || (threadCount ? String(threadCount) : '')}
            onChange={(event) => setThreadDraft(event.target.value)}
            onBlur={(event) => commitThreadCount(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
            }}
          />
          <span className="text-[12px] text-[var(--muted-foreground)]">
            生效为 -T{threadCount ?? 'N'}，留空表示不启用并行构建。
          </span>
        </label>

        <label className="flex flex-col gap-1.5 text-[13px]">
          <span className="font-medium">最大并发构建数</span>
          <Input
            type="number"
            min={1}
            max={8}
            disabled={saving}
            value={concurrentDraft || String(maxConcurrentBuilds)}
            onChange={(event) => setConcurrentDraft(event.target.value)}
            onBlur={(event) => void commitMaxConcurrentBuilds(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
            }}
          />
        </label>
      </CardContent>
    </Card>
  )
}
