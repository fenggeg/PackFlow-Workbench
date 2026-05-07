import {Button, Drawer, Form, Input, InputNumber, message, Select, Space,} from 'antd'
import {useEffect, useState} from 'react'
import {api} from '../../services/tauri-api'
import type {SaveServerProfilePayload, ServerPrivilegeConfig, ServerProfile} from '../../types/domain'

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

const defaultPrivilege: ServerPrivilegeConfig = {
  mode: 'none',
  runAsUser: 'root',
  passwordMode: 'none',
  uploadTempDir: '',
  shell: 'bash -lc',
  cleanupOnSuccess: true,
  keepTempOnFailure: true,
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
          envType: server.envType,
          tags: server.tags,
          remark: server.remark,
        })
      } else {
        form.setFieldsValue({
          port: 22,
          authType: 'private_key',
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

      const payload: SaveServerProfilePayload = {
        id: server?.id,
        name: values.name,
        host: values.host,
        port: values.port,
        username: values.username,
        authType: values.authType,
        password: values.password || undefined,
        privateKeyPath: values.privateKeyPath || undefined,
        group: values.group || undefined,
        privilege: server?.privilege ?? defaultPrivilege,
        envType: values.envType,
        tags: values.tags || [],
        remark: values.remark || undefined,
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
