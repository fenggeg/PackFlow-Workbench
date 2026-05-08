import {
    Alert,
    Button,
    Checkbox,
    Drawer,
    Form,
    Input,
    InputNumber,
    message,
    Select,
    Space,
    Tooltip,
    Typography
} from 'antd'
import {QuestionCircleOutlined} from '@ant-design/icons'
import type {ReactNode} from 'react'
import {useEffect, useState} from 'react'
import {api} from '../../services/tauri-api'
import type {
    SaveServerProfilePayload,
    ServerPrivilegeConfig,
    ServerPrivilegeMode,
    ServerPrivilegePasswordMode,
    ServerProfile,
} from '../../types/domain'

const {Text} = Typography

interface ServerEditorDrawerProps {
  open: boolean
  server?: ServerProfile | null
  onClose: () => void
  onSaved: () => void
}

const envTypeOptions = [
  {label: '开发', value: 'dev'},
  {label: '测试', value: 'test'},
  {label: '预发', value: 'staging'},
  {label: '生产', value: 'prod'},
  {label: '自定义', value: 'custom'},
]

const privilegeModeOptions: {label: string; value: ServerPrivilegeMode}[] = [
  {label: '不提权（普通账号直接执行）', value: 'none'},
  {label: 'sudo（用指定用户执行）', value: 'sudo'},
  {label: 'sudo -i（带登录环境执行）', value: 'sudo_i'},
  {label: 'su（切换到指定用户）', value: 'su'},
  {label: '自定义命令包装（高级）', value: 'custom'},
]

const privilegePasswordOptions: {label: string; value: ServerPrivilegePasswordMode}[] = [
  {label: '不需要提权密码', value: 'none'},
  {label: '使用登录密码提权', value: 'login_password'},
  {label: '单独填写提权密码', value: 'separate'},
]

const defaultPrivilege: ServerPrivilegeConfig = {
  mode: 'none',
  runAsUser: 'root',
  passwordMode: 'none',
  uploadTempDir: '${loginHome}/.packflow/deploy/${deploymentId}',
  shell: 'bash -lc',
  customWrapper: '',
  cleanupOnSuccess: true,
  keepTempOnFailure: true,
}

interface ServerFormValues {
  name: string
  host: string
  port: number
  username: string
  authType: 'password' | 'private_key'
  password?: string
  privateKeyPath?: string
  group?: string
  privilege?: ServerPrivilegeConfig
  privilegePassword?: string
  envType?: string
  tags?: string[]
  remark?: string
}

const HelpLabel = ({children, help}: {children: ReactNode; help: ReactNode}) => (
  <Space size={4} align="center">
    <Text>{children}</Text>
    <Tooltip title={help}>
      <QuestionCircleOutlined />
    </Tooltip>
  </Space>
)

const mergePrivilege = (privilege?: ServerPrivilegeConfig): ServerPrivilegeConfig => ({
  ...defaultPrivilege,
  ...privilege,
  customWrapper: privilege?.customWrapper ?? '',
})

const normalizePrivilege = (privilege?: ServerPrivilegeConfig): ServerPrivilegeConfig => {
  const merged = mergePrivilege(privilege)
  const mode = merged.mode === 'none' ? 'none' : merged.mode

  return {
    ...merged,
    mode,
    passwordMode: mode === 'none' ? 'none' : merged.passwordMode,
    runAsUser: merged.runAsUser?.trim() || 'root',
    uploadTempDir: merged.uploadTempDir?.trim() || defaultPrivilege.uploadTempDir,
    shell: merged.shell?.trim() || defaultPrivilege.shell,
    customWrapper: merged.customWrapper?.trim() || undefined,
  }
}

export function ServerEditorDrawer({open, server, onClose, onSaved}: ServerEditorDrawerProps) {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    if (open) {
      form.resetFields()
      if (server) {
        form.setFieldsValue({
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
        form.setFieldsValue({
          port: 22,
          authType: 'private_key',
          privilege: defaultPrivilege,
          privilegePassword: undefined,
          envType: 'dev',
          tags: [],
        })
      }
    }
  }, [open, server, form])

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      const formValues = values as ServerFormValues
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
        privilegePassword: privilege.passwordMode === 'separate'
          ? formValues.privilegePassword || undefined
          : undefined,
        envType: formValues.envType,
        tags: formValues.tags || [],
        remark: formValues.remark || undefined,
        favorite: server?.favorite ?? false,
      }

      await api.saveServerProfile(payload)
      message.success(server ? '服务器更新成功' : '服务器创建成功')
      onSaved()
      onClose()
    } catch (error) {
      if (error !== 'validationFailed') {
        message.error(`保存失败：${error}`)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    try {
      await form.validateFields(['host', 'port', 'username', 'authType'])
      setTesting(true)

      if (!server?.id) {
        message.warning('请先保存服务器后再测试连接')
        return
      }

      const result = await api.testServerConnection(server.id)
      message.success(result)
    } catch (error) {
      message.error(`测试失败：${error}`)
    } finally {
      setTesting(false)
    }
  }

  return (
    <Drawer
      title={server ? `编辑服务器：${server.name}` : '新增服务器'}
      open={open}
      onClose={onClose}
      width={500}
      extra={
        <Space>
          <Button onClick={handleTest} loading={testing} disabled={!server?.id}>
            测试连接
          </Button>
          <Button type="primary" onClick={handleSave} loading={saving}>
            保存
          </Button>
        </Space>
      }
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          port: 22,
          authType: 'private_key',
          privilege: defaultPrivilege,
          envType: 'dev',
        }}
      >
        <Form.Item
          name="name"
          label="服务器名称"
          rules={[{required: true, message: '请输入服务器名称'}]}
        >
          <Input placeholder="例如：生产-应用服务器-01" />
        </Form.Item>

        <Form.Item
          name="host"
          label="主机地址"
          rules={[{required: true, message: '请输入主机地址'}]}
        >
          <Input placeholder="IP 或域名" />
        </Form.Item>

        <Form.Item
          name="port"
          label="SSH 端口"
          rules={[{required: true, message: '请输入端口'}]}
        >
          <InputNumber min={1} max={65535} style={{width: '100%'}} />
        </Form.Item>

        <Form.Item
          name="username"
          label="用户名"
          rules={[{required: true, message: '请输入用户名'}]}
        >
          <Input placeholder="SSH 登录用户名" />
        </Form.Item>

        <Form.Item
          name="authType"
          label="认证方式"
          rules={[{required: true, message: '请选择认证方式'}]}
        >
          <Select
            options={[
              {label: '私钥认证', value: 'private_key'},
              {label: '密码认证', value: 'password'},
            ]}
          />
        </Form.Item>

        <Form.Item
          noStyle
          shouldUpdate={(prev, cur) => prev.authType !== cur.authType}
        >
          {({getFieldValue}) =>
            getFieldValue('authType') === 'password' ? (
              <Form.Item name="password" label="密码">
                <Input.Password placeholder="SSH 登录密码" />
              </Form.Item>
            ) : (
              <Form.Item name="privateKeyPath" label="私钥路径">
                <Input placeholder="私钥文件路径" />
              </Form.Item>
            )
          }
        </Form.Item>

        <Form.Item
          name={['privilege', 'mode']}
          label={
            <HelpLabel help="服务器登录账号本身有部署目录权限时选不提权；需要以 root 或应用账号执行移动文件、重启服务等命令时再选择 sudo、su 或自定义。">
              提权方式
            </HelpLabel>
          }
        >
          <Select
            options={privilegeModeOptions}
            onChange={(value) => {
              if (value === 'none') {
                form.setFieldValue(['privilege', 'passwordMode'], 'none')
                form.setFieldValue('privilegePassword', undefined)
              }
            }}
          />
        </Form.Item>

        <Form.Item
          noStyle
          shouldUpdate={(prev, cur) => prev.privilege?.mode !== cur.privilege?.mode}
        >
          {({getFieldValue}) => {
            const privilegeMode = getFieldValue(['privilege', 'mode']) as ServerPrivilegeMode
            const privilegeEnabled = privilegeMode !== 'none'
            if (!privilegeEnabled) {
              return (
                <Alert
                  type="info"
                  showIcon
                  message="当前不提权：远程命令会直接以 SSH 登录用户执行。"
                  style={{marginBottom: 16}}
                />
              )
            }

            return (
              <Space direction="vertical" size={12} style={{width: '100%'}}>
                <Space wrap align="start">
                  <Form.Item
                    name={['privilege', 'runAsUser']}
                    label={
                      <HelpLabel help="提权后希望用哪个系统用户执行部署和运维命令，常见值是 root，也可以填应用运行账号。">
                        执行用户
                      </HelpLabel>
                    }
                    rules={[{required: true, message: '请输入执行用户'}]}
                    style={{minWidth: 160}}
                  >
                    <Input placeholder="例如 root" />
                  </Form.Item>

                  <Form.Item
                    name={['privilege', 'passwordMode']}
                    label={
                      <HelpLabel help="如果服务器 sudo/su 不需要密码，选不需要；如果密码和登录密码相同，选使用登录密码；否则单独填写。">
                        提权密码
                      </HelpLabel>
                    }
                    style={{minWidth: 210}}
                  >
                    <Select options={privilegePasswordOptions} />
                  </Form.Item>
                </Space>

                <Form.Item
                  noStyle
                  shouldUpdate={(prev, cur) =>
                    prev.privilege?.passwordMode !== cur.privilege?.passwordMode
                  }
                >
                  {({getFieldValue: getNestedFieldValue}) =>
                    getNestedFieldValue(['privilege', 'passwordMode']) === 'separate' ? (
                      <Form.Item
                        name="privilegePassword"
                        label={
                          <HelpLabel help="只在提权命令需要独立密码时使用；编辑已有服务器时留空会保留原密码。">
                            独立提权密码
                          </HelpLabel>
                        }
                        rules={[
                          {
                            validator: (_, value: string | undefined) => {
                              if (server?.privilegePasswordConfigured || value?.trim()) {
                                return Promise.resolve()
                              }
                              return Promise.reject(new Error('请输入独立提权密码'))
                            },
                          },
                        ]}
                      >
                        <Input.Password placeholder={server?.privilegePasswordConfigured ? '留空则保留原密码' : '请输入提权密码'} />
                      </Form.Item>
                    ) : null
                  }
                </Form.Item>

                <Form.Item
                  name={['privilege', 'uploadTempDir']}
                  label={
                    <HelpLabel help="提权部署时，产物会先上传到这个远端临时目录，再由提权命令移动到正式部署目录。可用 ${loginHome}、${deploymentId}、${loginUser}、${runAsUser}、${remoteArtifactName}。">
                      上传暂存目录
                    </HelpLabel>
                  }
                  rules={[{required: true, message: '请输入上传暂存目录'}]}
                >
                  <Input placeholder="${loginHome}/.packflow/deploy/${deploymentId}" />
                </Form.Item>

                <Form.Item
                  name={['privilege', 'shell']}
                  label={
                    <HelpLabel help="提权后执行远程命令时使用的 Shell 包装器。Linux 服务器通常保持 bash -lc；没有 bash 时可改成 sh -lc。">
                      执行 Shell
                    </HelpLabel>
                  }
                  rules={[{required: true, message: '请输入执行 Shell'}]}
                >
                  <Input placeholder="bash -lc" />
                </Form.Item>

                {privilegeMode === 'custom' ? (
                  <Form.Item
                    name={['privilege', 'customWrapper']}
                    label={
                      <HelpLabel help="用于高级场景，例如公司封装的提权脚本。填写 ${command} 表示原始远程命令放置的位置。">
                        自定义包装命令
                      </HelpLabel>
                    }
                    rules={[{required: true, message: '请输入自定义包装命令'}]}
                  >
                    <Input placeholder="例如 my-sudo ${command}" />
                  </Form.Item>
                ) : null}

                <Space wrap style={{marginBottom: 16}}>
                  <Form.Item name={['privilege', 'cleanupOnSuccess']} valuePropName="checked" noStyle>
                    <Checkbox>成功后清理暂存目录</Checkbox>
                  </Form.Item>
                  <Form.Item name={['privilege', 'keepTempOnFailure']} valuePropName="checked" noStyle>
                    <Checkbox>失败时保留暂存目录</Checkbox>
                  </Form.Item>
                </Space>
              </Space>
            )
          }}
        </Form.Item>

        <Form.Item name="envType" label="环境类型">
          <Select options={envTypeOptions} />
        </Form.Item>

        <Form.Item name="group" label="分组">
          <Input placeholder="例如：电商系统、网关服务" />
        </Form.Item>

        <Form.Item name="tags" label="标签">
          <Select
            mode="tags"
            placeholder="输入标签后回车"
            tokenSeparators={[',']}
          />
        </Form.Item>

        <Form.Item name="remark" label="备注">
          <Input.TextArea rows={3} placeholder="服务器用途说明" />
        </Form.Item>
      </Form>
    </Drawer>
  )
}
