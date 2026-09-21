import {FileSearch, FolderOpen, RefreshCw, Settings, ArrowLeftRight} from 'lucide-react'
import {useState} from 'react'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {MonoText} from '@/components/ui/mono-text'
import {StatusPill} from '@/components/ui/status-pill'
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip'
import {buildEnvironmentCenterItems, sourceText, statusToneOf} from '@/services/environmentCenterService'
import {selectLocalDirectory, selectLocalFile} from '@/services/tauri-api'
import {useAppStore} from '@/store/useAppStore'
import type {EnvironmentProfile} from '@/types/domain'
import {JdkRegistryPanel} from './JdkRegistryPanel'

export function EnvPanel() {
  const project = useAppStore((state) => state.project)
  const environment = useAppStore((state) => state.environment)
  const environmentSettings = useAppStore((state) => state.environmentSettings)
  const updateEnvironment = useAppStore((state) => state.updateEnvironment)
  const refreshEnvironment = useAppStore((state) => state.refreshEnvironment)
  const [pathModalOpen, setPathModalOpen] = useState(false)
  const [jdkOpen, setJdkOpen] = useState(false)
  const [savingPaths, setSavingPaths] = useState(false)
  // 受控草稿：关闭弹窗前必须显式保存，避免输入内容被静默丢弃
  const [pathDraft, setPathDraft] = useState({maven: '', settings: '', repo: ''})

  const mavenValue = environment?.mavenHome ?? environment?.mavenPath ?? ''
  const settingsValue = environment?.settingsXmlPath ?? ''
  const localRepoValue = environment?.localRepoPath ?? ''
  const profiles = environmentSettings?.profiles ?? []
  const items = buildEnvironmentCenterItems(environment)
  const currentExecutor = environment?.useMavenWrapper
    ? environment.mavenWrapperPath ?? 'mvnw.cmd'
    : environment?.mavenPath ?? 'mvn.cmd'

  const currentProjectPath = project?.rootPath ?? ''
  const jdkRequirement = environment?.projectJdkRequirement

  // 打开弹窗时用当前值初始化草稿：渲染期同步，避免 effect 触发级联渲染
  const [syncedPathModalOpen, setSyncedPathModalOpen] = useState(false)
  if (pathModalOpen !== syncedPathModalOpen) {
    setSyncedPathModalOpen(pathModalOpen)
    if (pathModalOpen) {
      setPathDraft({maven: mavenValue, settings: settingsValue, repo: localRepoValue})
    }
  }

  const getOrCreateProjectProfile = (): EnvironmentProfile => {
    const bindings = environmentSettings?.projectProfileBindings ?? {}
    const boundId = currentProjectPath ? bindings[currentProjectPath] : undefined
    if (boundId) {
      const bound = profiles.find((p) => p.id === boundId)
      if (bound) return {...bound}
    }
    return {
      id: crypto.randomUUID(),
      name: project?.artifactId ?? '项目配置',
      useMavenWrapper: environment?.useMavenWrapper ?? false,
      updatedAt: new Date().toISOString(),
    }
  }

  const saveProjectEnv = async (patch: Partial<EnvironmentProfile>) => {
    const profile: EnvironmentProfile = {
      ...getOrCreateProjectProfile(),
      ...patch,
      updatedAt: new Date().toISOString(),
    }
    const baseSettings = environmentSettings ?? {profiles: []}
    const nextBindings = {...(baseSettings.projectProfileBindings ?? {})}
    if (currentProjectPath) {
      nextBindings[currentProjectPath] = profile.id
    }
    await updateEnvironment({
      ...baseSettings,
      activeProfileId: profile.id,
      projectProfileBindings: nextBindings,
      profiles: [profile, ...profiles.filter((p) => p.id !== profile.id)],
    })
  }

  const handleSelectJdk = async (jdkPath: string) => {
    setJdkOpen(false)
    await saveProjectEnv({javaHome: jdkPath})
  }

  const handleAutoDetect = async () => {
    setJdkOpen(false)
    await saveProjectEnv({javaHome: undefined})
  }

  const jdkItem = items.find((i) => i.key === 'jdk')
  const otherItems = items.filter((i) => i.key !== 'jdk')
  const hasProject = Boolean(currentProjectPath)

  const renderSummary = (item: (typeof items)[number], onClick?: () => void) => (
    <div
      key={item.key}
      className={
        onClick
          ? 'flex cursor-pointer flex-col gap-1 rounded-[var(--radius)] border border-[var(--border)] px-3 py-2 transition-colors hover:bg-[var(--accent)]'
          : 'flex flex-col gap-1 rounded-[var(--radius)] border border-[var(--border)] px-3 py-2'
      }
      onClick={onClick}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[13px] font-medium">
          {item.title}
          {onClick ? <ArrowLeftRight className="ml-1.5 inline size-3 text-[var(--muted-foreground)]" /> : null}
        </span>
        <StatusPill tone={statusToneOf(item.status)}>{item.value}</StatusPill>
        <StatusPill>{sourceText(item.source)}</StatusPill>
      </div>
      <div className="truncate text-[12px] text-[var(--muted-foreground)]" title={item.detail}>
        {item.detail}
      </div>
    </div>
  )

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>环境中心</CardTitle>
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="iconSm" aria-label="手动覆盖路径" onClick={() => setPathModalOpen(true)}>
                <Settings />
              </Button>
            </TooltipTrigger>
            <TooltipContent>手动覆盖路径</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="iconSm" aria-label="刷新环境" onClick={() => void refreshEnvironment()}>
                <RefreshCw />
              </Button>
            </TooltipTrigger>
            <TooltipContent>刷新环境</TooltipContent>
          </Tooltip>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-medium">当前执行器</span>
          <MonoText className="truncate text-[12px] text-[var(--muted-foreground)]" title={currentExecutor}>
            {currentExecutor}
          </MonoText>
        </div>

        <div className="flex flex-col gap-2">
          {jdkItem ? renderSummary(jdkItem, () => setJdkOpen(true)) : null}
          {otherItems.map((item) => renderSummary(item))}

          <div className="flex flex-col gap-1 rounded-[var(--radius)] border border-[var(--border)] px-3 py-2">
            <span className="text-[13px] font-medium">执行器切换</span>
            <div className="inline-flex w-fit overflow-hidden rounded-[var(--radius)] border border-[var(--border)]">
              <button
                type="button"
                className={
                  environment?.useMavenWrapper
                    ? 'px-3 py-1 text-[12px] text-[var(--muted-foreground)]'
                    : 'bg-[var(--primary)] px-3 py-1 text-[12px] text-[var(--primary-foreground)]'
                }
                onClick={() => void saveProjectEnv({useMavenWrapper: false})}
              >
                Maven
              </button>
              <button
                type="button"
                disabled={!environment?.hasMavenWrapper}
                className={
                  environment?.useMavenWrapper
                    ? 'border-l border-[var(--border)] bg-[var(--primary)] px-3 py-1 text-[12px] text-[var(--primary-foreground)]'
                    : 'border-l border-[var(--border)] px-3 py-1 text-[12px] text-[var(--muted-foreground)] disabled:opacity-50'
                }
                onClick={() => void saveProjectEnv({useMavenWrapper: true})}
              >
                mvnw
              </button>
            </div>
            <span className="text-[12px] text-[var(--muted-foreground)]">
              {environment?.hasMavenWrapper ? '可在 Maven 与 Wrapper 间切换' : '当前项目不可切换'}
            </span>
          </div>
        </div>

        {environment?.errors.map((error) => (
          <div
            key={error}
            className="rounded-[var(--radius)] border border-[var(--warning)]/30 bg-[var(--warning)]/5 px-3 py-2 text-[13px] text-[var(--warning)]"
          >
            {error}
          </div>
        ))}
      </CardContent>

      <Dialog open={jdkOpen} onOpenChange={setJdkOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader className="flex-row items-center justify-between space-y-0">
            <DialogTitle>JDK 切换</DialogTitle>
            {hasProject ? <StatusPill tone="info">自动记忆</StatusPill> : null}
          </DialogHeader>
          <div className="flex flex-col gap-3 px-5 py-2">
            {jdkRequirement ? (
              <div className="flex items-center gap-2 text-[12px] text-[var(--muted-foreground)]">
                项目要求 JDK
                <StatusPill tone="info">{jdkRequirement.versionSpec}</StatusPill>
              </div>
            ) : null}
            {environment?.javaHome ? (
              <div className="text-[12px]">
                当前：<span className="font-medium">{environment.javaVersion ?? '未知'}</span>
                <MonoText className="ml-1 text-[11px] text-[var(--muted-foreground)]" title={environment.javaHome}>
                  {environment.javaHome}
                </MonoText>
              </div>
            ) : null}
            <JdkRegistryPanel onSelect={handleSelectJdk} />
            {environment?.javaSource === 'manual' && hasProject ? (
              <button
                type="button"
                className="self-start text-[12px] text-[var(--info)] underline-offset-2 hover:underline"
                onClick={() => void handleAutoDetect()}
              >
                切换回自动识别
              </button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={pathModalOpen} onOpenChange={setPathModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>手动覆盖路径</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 px-5 py-2">
            <label className="flex flex-col gap-1.5 text-[13px]">
              <span className="font-medium">Maven</span>
              <div className="flex gap-1.5">
                <Input
                  placeholder="选择或粘贴 Maven 目录 / mvn.cmd"
                  value={pathDraft.maven}
                  onChange={(event) => setPathDraft((draft) => ({...draft, maven: event.target.value}))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.preventDefault()
                  }}
                />
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label="选择 mvn.cmd"
                  onClick={async () => {
                    const selected = await selectLocalFile('选择 mvn.cmd')
                    if (selected) setPathDraft((draft) => ({...draft, maven: selected}))
                  }}
                >
                  <FileSearch />
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label="选择 Maven 目录"
                  onClick={async () => {
                    const selected = await selectLocalDirectory('选择 Maven 目录')
                    if (selected) setPathDraft((draft) => ({...draft, maven: selected}))
                  }}
                >
                  <FolderOpen />
                </Button>
              </div>
            </label>

            <label className="flex flex-col gap-1.5 text-[13px]">
              <span className="font-medium">settings.xml</span>
              <div className="flex gap-1.5">
                <Input
                  placeholder="选择或粘贴 settings.xml"
                  value={pathDraft.settings}
                  onChange={(event) => setPathDraft((draft) => ({...draft, settings: event.target.value}))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.preventDefault()
                  }}
                />
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label="选择 settings.xml"
                  onClick={async () => {
                    const selected = await selectLocalFile('选择 settings.xml')
                    if (selected) setPathDraft((draft) => ({...draft, settings: selected}))
                  }}
                >
                  <FileSearch />
                </Button>
              </div>
            </label>

            <label className="flex flex-col gap-1.5 text-[13px]">
              <span className="font-medium">本地仓库</span>
              <div className="flex gap-1.5">
                <Input
                  placeholder="选择或粘贴本地仓库目录"
                  value={pathDraft.repo}
                  onChange={(event) => setPathDraft((draft) => ({...draft, repo: event.target.value}))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.preventDefault()
                  }}
                />
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label="选择本地仓库目录"
                  onClick={async () => {
                    const selected = await selectLocalDirectory('选择本地仓库目录')
                    if (selected) setPathDraft((draft) => ({...draft, repo: selected}))
                  }}
                >
                  <FolderOpen />
                </Button>
              </div>
            </label>
          </div>
          <DialogFooter>
            <Button variant="secondary" disabled={savingPaths} onClick={() => setPathModalOpen(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              disabled={savingPaths}
              onClick={async () => {
                setSavingPaths(true)
                try {
                  // 一次性提交三个路径，避免多次写入互相覆盖
                  await saveProjectEnv({
                    mavenHome: pathDraft.maven.trim() || undefined,
                    settingsXmlPath: pathDraft.settings.trim() || undefined,
                    localRepoPath: pathDraft.repo.trim() || undefined,
                  })
                  setPathModalOpen(false)
                } finally {
                  setSavingPaths(false)
                }
              }}
            >
              {savingPaths ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
