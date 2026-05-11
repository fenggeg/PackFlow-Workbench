import {Button} from "@/components/ui/button"
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card"
import {Input} from "@/components/ui/input"
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue,} from "@/components/ui/select"
import {Badge} from "@/components/ui/badge"
import {Tooltip, TooltipContent, TooltipTrigger,} from "@/components/ui/tooltip"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,} from "@/components/ui/dialog"
import {AlertCircle, ChevronDown, Delete, Edit, FileSearch, FolderOpen, Plus, RefreshCw, Settings,} from "lucide-react"
import {useState} from "react"
import {buildEnvironmentCenterItems, sourceText} from "../../services/environmentCenterService"
import {selectLocalDirectory, selectLocalFile} from "../../services/tauri-api"
import {useAppStore} from "../../store/useAppStore"
import type {EnvironmentProfile} from "../../types/domain"

type EnvProfileMode = "create" | "edit"

export function EnvPanel() {
  const environment = useAppStore((state) => state.environment)
  const environmentSettings = useAppStore((state) => state.environmentSettings)
  const updateEnvironment = useAppStore((state) => state.updateEnvironment)
  const refreshEnvironment = useAppStore((state) => state.refreshEnvironment)
  const applyEnvironmentProfile = useAppStore((state) => state.applyEnvironmentProfile)
  const saveEnvironmentProfile = useAppStore((state) => state.saveEnvironmentProfile)
  const deleteEnvironmentProfile = useAppStore((state) => state.deleteEnvironmentProfile)
  const [profileName, setProfileName] = useState("")
  const [profileMode, setProfileMode] = useState<EnvProfileMode>("create")
  const [profileModalOpen, setProfileModalOpen] = useState(false)
  const [pathModalOpen, setPathModalOpen] = useState(false)
  const [manualCollapseOpen, setManualCollapseOpen] = useState(false)

  const javaValue = environment?.javaHome ?? ""
  const mavenValue = environment?.mavenHome ?? environment?.mavenPath ?? ""
  const settingsValue = environment?.settingsXmlPath ?? ""
  const localRepoValue = environment?.localRepoPath ?? ""
  const profiles = environmentSettings?.profiles ?? []
  const activeProfile = profiles.find((profile) => profile.id === environmentSettings?.activeProfileId)
  const profileValue = environmentSettings?.activeProfileId ?? "__auto__"
  const items = buildEnvironmentCenterItems(environment)
  const currentExecutor = environment?.useMavenWrapper
    ? environment.mavenWrapperPath ?? "mvnw.cmd"
    : environment?.mavenPath ?? "mvn.cmd"

  const updateActiveProfile = (patch: Partial<EnvironmentProfile>) => {
    const profile: EnvironmentProfile = {
      id: activeProfile?.id ?? crypto.randomUUID(),
      name: activeProfile?.name ?? (profileName.trim() || "自定义环境"),
      useMavenWrapper: environment?.useMavenWrapper ?? false,
      ...activeProfile,
      ...patch,
      updatedAt: new Date().toISOString(),
    }
    void updateEnvironment({
      ...(environmentSettings ?? { profiles: [] }),
      activeProfileId: profile.id,
      profiles: [
        profile,
        ...profiles.filter((item) => item.id !== profile.id),
      ],
    })
  }

  const saveJavaHome = (javaHome?: string) =>
    updateActiveProfile({ javaHome })

  const saveMavenHome = (mavenHome?: string) =>
    updateActiveProfile({ mavenHome })

  const saveSettingsXml = (settingsXmlPath?: string) =>
    updateActiveProfile({ settingsXmlPath })

  const saveLocalRepo = (localRepoPath?: string) =>
    updateActiveProfile({ localRepoPath })

  const openCreateProfileModal = () => {
    setProfileMode("create")
    setProfileName("")
    setProfileModalOpen(true)
  }

  const openEditProfileModal = () => {
    setProfileMode("edit")
    setProfileName(activeProfile?.name ?? "")
    setProfileModalOpen(true)
  }

  const submitProfileModal = () => {
    void saveEnvironmentProfile(profileName || activeProfile?.name || "自定义环境")
    setProfileName("")
    setProfileMode("edit")
    setProfileModalOpen(false)
  }

  const statusBadgeVariant = (status: string) => {
    switch (status) {
      case "valid": return "bg-green-500"
      case "invalid": return "bg-red-500"
      case "unknown": return "bg-gray-500"
      default: return "bg-gray-500"
    }
  }

  return (
    <Card className="panel-card env-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-lg">环境中心</CardTitle>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={() => void refreshEnvironment()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>刷新环境</TooltipContent>
        </Tooltip>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2.5">
          <div className="env-profile-panel flex items-center gap-2">
            <Select
              value={profileValue}
              onValueChange={(value) => {
                if (value === "__auto__") {
                  setProfileMode("create")
                  setProfileName("")
                  void updateEnvironment({
                    ...(environmentSettings ?? { profiles: [] }),
                    activeProfileId: undefined,
                    profiles,
                  })
                  return
                }
                setProfileMode("edit")
                const profile = profiles.find((item) => item.id === value)
                setProfileName(profile?.name ?? "")
                void applyEnvironmentProfile(value)
              }}
            >
              <SelectTrigger className="env-profile-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__auto__">自动识别</SelectItem>
                {profiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="env-profile-actions flex gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={openCreateProfileModal}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>新增方案</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" disabled={!activeProfile} onClick={openEditProfileModal}>
                    <Edit className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>编辑方案</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={() => setPathModalOpen(true)}>
                    <Settings className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>手动覆盖</TooltipContent>
              </Tooltip>
              <AlertDialog>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" disabled={!activeProfile}>
                        <Delete className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                  </TooltipTrigger>
                  <TooltipContent>删除当前环境方案</TooltipContent>
                </Tooltip>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>确认删除</AlertDialogTitle>
                    <AlertDialogDescription>删除当前环境方案？</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => {
                        if (activeProfile) {
                          void deleteEnvironmentProfile(activeProfile.id)
                          setProfileMode("create")
                          setProfileName("")
                        }
                      }}
                    >
                      删除
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          <div className="env-executor flex items-center gap-2">
            <span className="font-semibold text-sm">当前执行器</span>
            <span className="env-summary-path text-sm truncate" title={currentExecutor}>
              {currentExecutor}
            </span>
          </div>

          <div className="env-summary-grid">
            {items.map((item) => (
              <div className="env-summary-item border rounded p-3" key={item.key}>
                <div className="env-summary-main flex flex-col gap-1">
                  <span className="font-semibold text-sm env-summary-title">
                    {item.title}
                  </span>
                  <div className="flex gap-1 env-summary-tags">
                    <Badge className={statusBadgeVariant(item.status)}>{item.value}</Badge>
                    <Badge variant="outline">{sourceText(item.source)}</Badge>
                  </div>
                </div>
                <span className="env-summary-path text-xs text-muted-foreground truncate" title={item.detail}>
                  {item.detail}
                </span>
              </div>
            ))}

            <div className="env-summary-item env-wrapper-toggle border rounded p-3">
              <div className="env-summary-main flex flex-col gap-1">
                <span className="font-semibold text-sm env-summary-title">
                  执行器切换
                </span>
                <div className="env-executor-toggle flex gap-1">
                  <Button
                    variant={!environment?.useMavenWrapper ? "default" : "outline"}
                    size="sm"
                    onClick={() => updateActiveProfile({ useMavenWrapper: false })}
                  >
                    Maven
                  </Button>
                  <Button
                    variant={environment?.useMavenWrapper ? "default" : "outline"}
                    size="sm"
                    disabled={!environment?.hasMavenWrapper}
                    onClick={() => updateActiveProfile({ useMavenWrapper: true })}
                  >
                    mvnw
                  </Button>
                </div>
              </div>
              <span className="env-summary-path text-xs text-muted-foreground">
                {environment?.hasMavenWrapper ? "可在 Maven 与 Wrapper 间切换" : "当前项目不可切换"}
              </span>
            </div>
          </div>

          {/* Collapse for manual path override */}
          <div className="env-config-collapse border rounded">
            <button
              className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium hover:bg-accent"
              onClick={() => setManualCollapseOpen(!manualCollapseOpen)}
            >
              <span>手动覆盖路径</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${manualCollapseOpen ? "rotate-180" : ""}`} />
            </button>
            {manualCollapseOpen && (
              <div className="px-3 pb-3">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" onClick={() => setPathModalOpen(true)}>
                      <Settings className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>打开路径覆盖弹窗</TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>

          {environment?.errors.map((error) => (
            <div
              key={error}
              className="flex items-center gap-2 rounded border border-yellow-200 bg-yellow-50 p-3 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200"
            >
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          ))}
        </div>

        {/* Profile Modal */}
        <Dialog open={profileModalOpen} onOpenChange={setProfileModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {profileMode === "edit" ? "编辑环境方案" : "新增环境方案"}
              </DialogTitle>
            </DialogHeader>
            <Input
              autoFocus
              placeholder={profileMode === "edit" ? "编辑当前方案名称" : "新增方案名称"}
              value={profileName}
              onChange={(event) => setProfileName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitProfileModal()
              }}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setProfileModalOpen(false)}>取消</Button>
              <Button onClick={submitProfileModal}>
                {profileMode === "edit" ? "保存修改" : "新增方案"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Path Override Modal */}
        <Dialog open={pathModalOpen} onOpenChange={setPathModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>手动覆盖路径</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-2.5">
              <div className="env-row flex flex-col gap-1">
                <label className="env-row-label text-sm font-medium">JDK</label>
                <div className="flex gap-1">
                  <Input
                    key={`java-${javaValue}`}
                    className="env-path-input flex-1"
                    placeholder="选择或粘贴 JDK 目录"
                    defaultValue={javaValue}
                    onBlur={(event) =>
                      void saveJavaHome(event.target.value.trim() || undefined)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") (event.target as HTMLInputElement).blur()
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    title="选择 JDK 目录"
                    onClick={async () => {
                      const selected = await selectLocalDirectory("选择 JDK 目录")
                      if (selected) {
                        await saveJavaHome(selected)
                      }
                    }}
                  >
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="env-row flex flex-col gap-1">
                <label className="env-row-label text-sm font-medium">Maven</label>
                <div className="flex gap-1">
                  <Input
                    key={`maven-${mavenValue}`}
                    className="env-path-input flex-1"
                    placeholder="选择或粘贴 Maven 目录 / mvn.cmd"
                    defaultValue={mavenValue}
                    onBlur={(event) =>
                      void saveMavenHome(event.target.value.trim() || undefined)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") (event.target as HTMLInputElement).blur()
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    title="选择 mvn.cmd"
                    onClick={async () => {
                      const selected = await selectLocalFile("选择 mvn.cmd")
                      if (selected) {
                        await saveMavenHome(selected)
                      }
                    }}
                  >
                    <FileSearch className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    title="选择 Maven 目录"
                    onClick={async () => {
                      const selected = await selectLocalDirectory("选择 Maven 目录")
                      if (selected) {
                        await saveMavenHome(selected)
                      }
                    }}
                  >
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="env-row flex flex-col gap-1">
                <label className="env-row-label text-sm font-medium">settings.xml</label>
                <div className="flex gap-1">
                  <Input
                    key={`settings-${settingsValue}`}
                    className="env-path-input flex-1"
                    placeholder="选择或粘贴 settings.xml"
                    defaultValue={settingsValue}
                    onBlur={(event) =>
                      void saveSettingsXml(event.target.value.trim() || undefined)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") (event.target as HTMLInputElement).blur()
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    title="选择 settings.xml"
                    onClick={async () => {
                      const selected = await selectLocalFile("选择 settings.xml")
                      if (selected) {
                        await saveSettingsXml(selected)
                      }
                    }}
                  >
                    <FileSearch className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="env-row flex flex-col gap-1">
                <label className="env-row-label text-sm font-medium">本地仓库</label>
                <div className="flex gap-1">
                  <Input
                    key={`repo-${localRepoValue}`}
                    className="env-path-input flex-1"
                    placeholder="选择或粘贴本地仓库目录"
                    defaultValue={localRepoValue}
                    onBlur={(event) =>
                      void saveLocalRepo(event.target.value.trim() || undefined)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") (event.target as HTMLInputElement).blur()
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    title="选择本地仓库目录"
                    onClick={async () => {
                      const selected = await selectLocalDirectory("选择本地仓库目录")
                      if (selected) {
                        await saveLocalRepo(selected)
                      }
                    }}
                  >
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setPathModalOpen(false)}>完成</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}