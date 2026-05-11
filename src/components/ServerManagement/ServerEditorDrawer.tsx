import {Button} from "@/components/ui/button"
import {Input} from "@/components/ui/input"
import {Textarea} from "@/components/ui/textarea"
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue,} from "@/components/ui/select"
import {Tooltip, TooltipContent, TooltipTrigger,} from "@/components/ui/tooltip"
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,} from "@/components/ui/dialog"
import {AlertCircle, HelpCircle} from "lucide-react"
import type {ReactNode} from "react"
import {useEffect, useState} from "react"
import {api} from "../../services/tauri-api"
import type {
  SaveServerProfilePayload,
  ServerPrivilegeConfig,
  ServerPrivilegeMode,
  ServerPrivilegePasswordMode,
  ServerProfile,
} from "../../types/domain"

interface ServerEditorDrawerProps {
  open: boolean
  server?: ServerProfile | null
  onClose: () => void
  onSaved: () => void
}

const envTypeOptions = [
  { label: "开发", value: "dev" },
  { label: "测试", value: "test" },
  { label: "预发", value: "staging" },
  { label: "生产", value: "prod" },
  { label: "自定义", value: "custom" },
]

const privilegeModeOptions: { label: string; value: ServerPrivilegeMode }[] = [
  { label: "不提权（普通账号直接执行）", value: "none" },
  { label: "sudo（用指定用户执行）", value: "sudo" },
  { label: "sudo -i（带登录环境执行）", value: "sudo_i" },
  { label: "su（切换到指定用户）", value: "su" },
  { label: "自定义命令包装（高级）", value: "custom" },
]

const privilegePasswordOptions: { label: string; value: ServerPrivilegePasswordMode }[] = [
  { label: "不需要提权密码", value: "none" },
  { label: "使用登录密码提权", value: "login_password" },
  { label: "单独填写提权密码", value: "separate" },
]

const defaultPrivilege: ServerPrivilegeConfig = {
  mode: "none",
  runAsUser: "root",
  passwordMode: "none",
  uploadTempDir: "${loginHome}/.packflow/deploy/${deploymentId}",
  shell: "bash -lc",
  customWrapper: "",
  cleanupOnSuccess: true,
  keepTempOnFailure: true,
}

interface ServerFormValues {
  name: string
  host: string
  port: number
  username: string
  authType: "password" | "private_key"
  password?: string
  privateKeyPath?: string
  group?: string
  privilege?: ServerPrivilegeConfig
  privilegePassword?: string
  envType?: string
  tags?: string[]
  remark?: string
}

const HelpLabel = ({ children, help }: { children: ReactNode; help: ReactNode }) => (
  <div className="flex items-center gap-1">
    <span>{children}</span>
    <Tooltip>
      <TooltipTrigger asChild>
        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{help}</TooltipContent>
    </Tooltip>
  </div>
)

const mergePrivilege = (privilege?: ServerPrivilegeConfig): ServerPrivilegeConfig => ({
  ...defaultPrivilege,
  ...privilege,
  customWrapper: privilege?.customWrapper ?? "",
})

const normalizePrivilege = (privilege?: ServerPrivilegeConfig): ServerPrivilegeConfig => {
  const merged = mergePrivilege(privilege)
  const mode = merged.mode === "none" ? "none" : merged.mode

  return {
    ...merged,
    mode,
    passwordMode: mode === "none" ? "none" : merged.passwordMode,
    runAsUser: merged.runAsUser?.trim() || "root",
    uploadTempDir: merged.uploadTempDir?.trim() || defaultPrivilege.uploadTempDir,
    shell: merged.shell?.trim() || defaultPrivilege.shell,
    customWrapper: merged.customWrapper?.trim() || undefined,
  }
}

function FormField({ label, required, error, children }: {
  label: ReactNode
  required?: boolean
  error?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}

export function ServerEditorDrawer({ open, server, onClose, onSaved }: ServerEditorDrawerProps) {
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [formValues, setFormValues] = useState<ServerFormValues>({
    name: "",
    host: "",
    port: 22,
    username: "",
    authType: "private_key",
    password: undefined,
    privateKeyPath: undefined,
    group: undefined,
    privilege: defaultPrivilege,
    privilegePassword: undefined,
    envType: "dev",
    tags: [],
    remark: undefined,
  })

  useEffect(() => {
    if (open) {
      setErrors({})
      if (server) {
        setFormValues({
          name: server.name,
          host: server.host,
          port: server.port,
          username: server.username,
          authType: server.authType,
          password: undefined,
          privateKeyPath: server.privateKeyPath,
          group: server.group,
          privilege: mergePrivilege(server.privilege),
          privilegePassword: undefined,
          envType: server.envType,
          tags: server.tags,
          remark: server.remark,
        })
      } else {
        setFormValues({
          name: "",
          host: "",
          port: 22,
          username: "",
          authType: "private_key",
          password: undefined,
          privateKeyPath: undefined,
          group: undefined,
          privilege: defaultPrivilege,
          privilegePassword: undefined,
          envType: "dev",
          tags: [],
          remark: undefined,
        })
      }
    }
  }, [open, server])

  const updateField = <K extends keyof ServerFormValues>(key: K, value: ServerFormValues[K]) => {
    setFormValues((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const updatePrivilege = (patch: Partial<ServerPrivilegeConfig>) => {
    setFormValues((prev) => ({
      ...prev,
      privilege: { ...prev.privilege!, ...patch },
    }))
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!formValues.name.trim()) newErrors.name = "请输入服务器名称"
    if (!formValues.host.trim()) newErrors.host = "请输入主机地址"
    if (!formValues.port || formValues.port < 1 || formValues.port > 65535) newErrors.port = "请输入有效端口"
    if (!formValues.username.trim()) newErrors.username = "请输入用户名"
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return

    setSaving(true)
    try {
      const privilege = normalizePrivilege(formValues.privilege)

      const payload: SaveServerProfilePayload = {
        id: server?.id,
        name: formValues.name,
        host: formValues.host,
        port: formValues.port,
        username: formValues.username,
        authType: formValues.authType,
        password: formValues.password || undefined,
        privateKeyPath: formValues.privateKeyPath || undefined,
        group: formValues.group || undefined,
        privilege,
        privilegePassword: privilege.passwordMode === "separate"
          ? formValues.privilegePassword || undefined
          : undefined,
        envType: formValues.envType,
        tags: formValues.tags || [],
        remark: formValues.remark || undefined,
        favorite: server?.favorite ?? false,
      }

      await api.saveServerProfile(payload)
      console.log(server ? "服务器更新成功" : "服务器创建成功")
      onSaved()
      onClose()
    } catch (error) {
      console.error(`保存失败：${error}`)
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!formValues.host.trim() || !formValues.port || !formValues.username.trim()) {
      alert("请先填写主机、端口和用户名")
      return
    }
    setTesting(true)

    if (!server?.id) {
      alert("请先保存服务器后再测试连接")
      setTesting(false)
      return
    }

    try {
      const result = await api.testServerConnection(server.id)
      console.log(result)
    } catch (error) {
      console.error(`测试失败：${error}`)
    } finally {
      setTesting(false)
    }
  }

  const privilegeMode = formValues.privilege?.mode ?? "none"
  const privilegeEnabled = privilegeMode !== "none"

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{server ? `编辑服务器：${server.name}` : "新增服务器"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <FormField label="服务器名称" required error={errors.name}>
            <Input
              placeholder="例如：生产-应用服务器-01"
              value={formValues.name}
              onChange={(e) => updateField("name", e.target.value)}
            />
          </FormField>

          <FormField label="主机地址" required error={errors.host}>
            <Input
              placeholder="IP 或域名"
              value={formValues.host}
              onChange={(e) => updateField("host", e.target.value)}
            />
          </FormField>

          <FormField label="SSH 端口" required error={errors.port}>
            <Input
              type="number"
              min={1}
              max={65535}
              value={formValues.port}
              onChange={(e) => updateField("port", Number(e.target.value))}
            />
          </FormField>

          <FormField label="用户名" required error={errors.username}>
            <Input
              placeholder="SSH 登录用户名"
              value={formValues.username}
              onChange={(e) => updateField("username", e.target.value)}
            />
          </FormField>

          <FormField label="认证方式" required>
            <Select
              value={formValues.authType}
              onValueChange={(v) => updateField("authType", v as "password" | "private_key")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private_key">私钥认证</SelectItem>
                <SelectItem value="password">密码认证</SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          {formValues.authType === "password" ? (
            <FormField label="密码">
              <Input
                type="password"
                placeholder="SSH 登录密码"
                value={formValues.password ?? ""}
                onChange={(e) => updateField("password", e.target.value)}
              />
            </FormField>
          ) : (
            <FormField label="私钥路径">
              <Input
                placeholder="私钥文件路径"
                value={formValues.privateKeyPath ?? ""}
                onChange={(e) => updateField("privateKeyPath", e.target.value)}
              />
            </FormField>
          )}

          <FormField label={
            <HelpLabel help="服务器登录账号本身有部署目录权限时选不提权；需要以 root 或应用账号执行移动文件、重启服务等命令时再选择 sudo、su 或自定义。">
              提权方式
            </HelpLabel>
          }>
            <Select
              value={privilegeMode}
              onValueChange={(value) => {
                updatePrivilege({ mode: value as ServerPrivilegeMode })
                if (value === "none") {
                  updatePrivilege({ passwordMode: "none" })
                  updateField("privilegePassword", undefined)
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {privilegeModeOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {!privilegeEnabled ? (
            <div className="flex items-center gap-2 rounded border border-blue-200 bg-blue-50 p-3 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">当前不提权：远程命令会直接以 SSH 登录用户执行。</span>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-3">
                <FormField label={
                  <HelpLabel help="提权后希望用哪个系统用户执行部署和运维命令，常见值是 root，也可以填应用运行账号。">
                    执行用户
                  </HelpLabel>
                } required>
                  <Input
                    placeholder="例如 root"
                    className="min-w-[160px]"
                    value={formValues.privilege?.runAsUser ?? ""}
                    onChange={(e) => updatePrivilege({ runAsUser: e.target.value })}
                  />
                </FormField>

                <FormField label={
                  <HelpLabel help="如果服务器 sudo/su 不需要密码，选不需要；如果密码和登录密码相同，选使用登录密码；否则单独填写。">
                    提权密码
                  </HelpLabel>
                }>
                  <Select
                    value={formValues.privilege?.passwordMode ?? "none"}
                    onValueChange={(v) => updatePrivilege({ passwordMode: v as ServerPrivilegePasswordMode })}
                  >
                    <SelectTrigger className="min-w-[210px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {privilegePasswordOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              </div>

              {formValues.privilege?.passwordMode === "separate" && (
                <FormField label={
                  <HelpLabel help="只在提权命令需要独立密码时使用；编辑已有服务器时留空会保留原密码。">
                    独立提权密码
                  </HelpLabel>
                }>
                  <Input
                    type="password"
                    placeholder={server?.privilegePasswordConfigured ? "留空则保留原密码" : "请输入提权密码"}
                    value={formValues.privilegePassword ?? ""}
                    onChange={(e) => updateField("privilegePassword", e.target.value)}
                  />
                </FormField>
              )}

              <FormField label={
                <HelpLabel help="提权部署时，产物会先上传到这个远端临时目录，再由提权命令移动到正式部署目录。可用 ${loginHome}、${deploymentId}、${loginUser}、${runAsUser}、${remoteArtifactName}。">
                  上传暂存目录
                </HelpLabel>
              } required>
                <Input
                  placeholder="${loginHome}/.packflow/deploy/${deploymentId}"
                  value={formValues.privilege?.uploadTempDir ?? ""}
                  onChange={(e) => updatePrivilege({ uploadTempDir: e.target.value })}
                />
              </FormField>

              <FormField label={
                <HelpLabel help="提权后执行远程命令时使用的 Shell 包装器。Linux 服务器通常保持 bash -lc；没有 bash 时可改成 sh -lc。">
                  执行 Shell
                </HelpLabel>
              } required>
                <Input
                  placeholder="bash -lc"
                  value={formValues.privilege?.shell ?? ""}
                  onChange={(e) => updatePrivilege({ shell: e.target.value })}
                />
              </FormField>

              {privilegeMode === "custom" && (
                <FormField label={
                  <HelpLabel help="用于高级场景，例如公司封装的提权脚本。填写 ${command} 表示原始远程命令放置的位置。">
                    自定义包装命令
                  </HelpLabel>
                } required>
                  <Input
                    placeholder="例如 my-sudo ${command}"
                    value={formValues.privilege?.customWrapper ?? ""}
                    onChange={(e) => updatePrivilege({ customWrapper: e.target.value })}
                  />
                </FormField>
              )}

              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border"
                    checked={formValues.privilege?.cleanupOnSuccess ?? true}
                    onChange={(e) => updatePrivilege({ cleanupOnSuccess: e.target.checked })}
                  />
                  成功后清理暂存目录
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border"
                    checked={formValues.privilege?.keepTempOnFailure ?? true}
                    onChange={(e) => updatePrivilege({ keepTempOnFailure: e.target.checked })}
                  />
                  失败时保留暂存目录
                </label>
              </div>
            </div>
          )}

          <FormField label="环境类型">
            <Select
              value={formValues.envType ?? "dev"}
              onValueChange={(v) => updateField("envType", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {envTypeOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="分组">
            <Input
              placeholder="例如：电商系统、网关服务"
              value={formValues.group ?? ""}
              onChange={(e) => updateField("group", e.target.value)}
            />
          </FormField>

          <FormField label="标签">
            <Input
              placeholder="输入标签后回车，多个用逗号分隔"
              value={formValues.tags?.join(",") ?? ""}
              onChange={(e) => {
                const tags = e.target.value.split(",").map((t) => t.trim()).filter(Boolean)
                updateField("tags", tags)
              }}
            />
          </FormField>

          <FormField label="备注">
            <Textarea
              rows={3}
              placeholder="服务器用途说明"
              value={formValues.remark ?? ""}
              onChange={(e) => updateField("remark", e.target.value)}
            />
          </FormField>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleTest} disabled={testing || !server?.id}>
            {testing ? "测试中..." : "测试连接"}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}