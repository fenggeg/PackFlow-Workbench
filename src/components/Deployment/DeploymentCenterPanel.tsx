import {Alert, Button, Card, Empty, Input, List, Modal, Popconfirm, Select, Space, Tabs, Tag, Typography,} from 'antd'
import {DeleteOutlined, PlayCircleOutlined, SaveOutlined} from '@ant-design/icons'
import {useMemo, useState} from 'react'
import {selectLocalFile} from '../../services/tauri-api'
import {useAppStore} from '../../store/useAppStore'
import {useWorkflowStore} from '../../store/useWorkflowStore'
import type {
    BuildArtifact,
    DeploymentProfile,
    MavenModule,
    SaveServerProfilePayload,
    ServerProfile,
} from '../../types/domain'

const {Text} = Typography

const flattenModules = (modules: MavenModule[]): MavenModule[] =>
  modules.flatMap((module) => [module, ...flattenModules(module.children ?? [])])

const createServerDraft = (): SaveServerProfilePayload => ({
  name: '',
  host: '',
  port: 22,
  username: '',
  authType: 'private_key',
  password: '',
  privateKeyPath: '',
  group: '',
})

const createDeploymentDraft = (): DeploymentProfile => ({
  id: crypto.randomUUID(),
  name: '',
  serverId: '',
  moduleId: '',
  localArtifactPattern: '*.jar',
  remoteDeployPath: '',
  stopCommand: '',
  startCommand: '',
  restartCommand: '',
  healthCheckUrl: '',
})

const globToRegex = (pattern: string) =>
  new RegExp(`^${pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')}$`, 'i')

const collectArtifacts = (currentArtifacts: BuildArtifact[], historyArtifacts: BuildArtifact[]) => {
  const all = [...currentArtifacts, ...historyArtifacts]
  const seen = new Set<string>()
  return all.filter((artifact) => {
    if (seen.has(artifact.path)) {
      return false
    }
    seen.add(artifact.path)
    return true
  })
}

export function DeploymentCenterPanel() {
  const project = useAppStore((state) => state.project)
  const artifacts = useAppStore((state) => state.artifacts)
  const history = useAppStore((state) => state.history)
  const error = useWorkflowStore((state) => state.error)
  const serverProfiles = useWorkflowStore((state) => state.serverProfiles)
  const deploymentProfiles = useWorkflowStore((state) => state.deploymentProfiles)
  const currentDeploymentTask = useWorkflowStore((state) => state.currentDeploymentTask)
  const saveServerProfile = useWorkflowStore((state) => state.saveServerProfile)
  const deleteServerProfile = useWorkflowStore((state) => state.deleteServerProfile)
  const saveDeploymentProfile = useWorkflowStore((state) => state.saveDeploymentProfile)
  const deleteDeploymentProfile = useWorkflowStore((state) => state.deleteDeploymentProfile)
  const startDeployment = useWorkflowStore((state) => state.startDeployment)
  const [serverDraft, setServerDraft] = useState<SaveServerProfilePayload>(createServerDraft())
  const [deploymentDraft, setDeploymentDraft] = useState<DeploymentProfile>(createDeploymentDraft())
  const [selectedDeploymentProfileId, setSelectedDeploymentProfileId] = useState<string>()
  const [selectedArtifactPath, setSelectedArtifactPath] = useState<string>()

  const modules = useMemo(() => flattenModules(project?.modules ?? []), [project?.modules])
  const artifactPool = useMemo(
    () => collectArtifacts(artifacts, history.flatMap((item) => item.artifacts ?? [])),
    [artifacts, history],
  )
  const selectedProfile = deploymentProfiles.find((item) => item.id === selectedDeploymentProfileId)
  const artifactOptions = useMemo(() => {
    const pattern = selectedProfile?.localArtifactPattern?.trim()
    const matcher = pattern ? globToRegex(pattern) : undefined
    return artifactPool
      .filter((artifact) => !matcher || matcher.test(artifact.fileName))
      .map((artifact) => ({
        label: `${artifact.fileName}${artifact.modulePath ? ` · ${artifact.modulePath}` : ''}`,
        value: artifact.path,
      }))
  }, [artifactPool, selectedProfile?.localArtifactPattern])

  const openServer = (profile: ServerProfile) => {
    setServerDraft({
      id: profile.id,
      name: profile.name,
      host: profile.host,
      port: profile.port,
      username: profile.username,
      authType: profile.authType,
      password: '',
      privateKeyPath: profile.privateKeyPath,
      group: profile.group,
    })
  }

  const openDeployment = (profile: DeploymentProfile) => {
    setDeploymentDraft(profile)
  }

  return (
    <Card title="部署中心" className="panel-card" size="small">
      <Space direction="vertical" size={16} style={{width: '100%'}}>
        {error ? <Alert type="error" showIcon message={error} /> : null}
        <Tabs
          items={[
            {
              key: 'server',
              label: '服务器管理',
              children: (
                <Space direction="vertical" size={16} style={{width: '100%'}}>
                  <Space wrap>
                    <Input
                      placeholder="名称"
                      value={serverDraft.name}
                      onChange={(event) => setServerDraft((state) => ({...state, name: event.target.value}))}
                    />
                    <Input
                      placeholder="Host"
                      value={serverDraft.host}
                      onChange={(event) => setServerDraft((state) => ({...state, host: event.target.value}))}
                    />
                    <Input
                      placeholder="端口"
                      style={{width: 100}}
                      value={String(serverDraft.port)}
                      onChange={(event) => setServerDraft((state) => ({...state, port: Number(event.target.value) || 22}))}
                    />
                    <Input
                      placeholder="用户名"
                      value={serverDraft.username}
                      onChange={(event) => setServerDraft((state) => ({...state, username: event.target.value}))}
                    />
                  </Space>
                  <Space wrap>
                    <Select
                      value={serverDraft.authType}
                      style={{width: 160}}
                      options={[
                        {label: '私钥认证', value: 'private_key'},
                        {label: '密码认证', value: 'password'},
                      ]}
                      onChange={(value) => setServerDraft((state) => ({...state, authType: value}))}
                    />
                    {serverDraft.authType === 'private_key' ? (
                      <Input
                        placeholder="私钥路径"
                        style={{minWidth: 280}}
                        value={serverDraft.privateKeyPath}
                        onChange={(event) => setServerDraft((state) => ({...state, privateKeyPath: event.target.value}))}
                      />
                    ) : (
                      <Input.Password
                        placeholder="密码（留空则保留原密码）"
                        style={{minWidth: 260}}
                        value={serverDraft.password}
                        onChange={(event) => setServerDraft((state) => ({...state, password: event.target.value}))}
                      />
                    )}
                    <Input
                      placeholder="分组"
                      value={serverDraft.group}
                      onChange={(event) => setServerDraft((state) => ({...state, group: event.target.value}))}
                    />
                    <Button
                      type="primary"
                      icon={<SaveOutlined />}
                      onClick={() => void saveServerProfile(serverDraft)}
                    >
                      保存服务器
                    </Button>
                    <Button onClick={() => setServerDraft(createServerDraft())}>重置</Button>
                  </Space>
                  {serverProfiles.length === 0 ? (
                    <Empty description="暂无服务器配置" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  ) : (
                    <List
                      bordered
                      dataSource={serverProfiles}
                      renderItem={(profile) => (
                        <List.Item
                          actions={[
                            <Button key="edit" size="small" onClick={() => openServer(profile)}>
                              编辑
                            </Button>,
                            <Popconfirm
                              key="delete"
                              title="删除服务器配置？"
                              okText="删除"
                              cancelText="取消"
                              onConfirm={() => void deleteServerProfile(profile.id)}
                            >
                              <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                            </Popconfirm>,
                          ]}
                        >
                          <Space direction="vertical" size={2}>
                            <Text strong>{profile.name}</Text>
                            <Text type="secondary">
                              {profile.username}@{profile.host}:{profile.port}
                            </Text>
                            <Space size={8} wrap>
                              <Tag>{profile.authType}</Tag>
                              {profile.passwordConfigured ? <Tag color="gold">已保存密码</Tag> : null}
                              {profile.group ? <Tag>{profile.group}</Tag> : null}
                            </Space>
                          </Space>
                        </List.Item>
                      )}
                    />
                  )}
                </Space>
              ),
            },
            {
              key: 'profile',
              label: '部署配置',
              children: (
                <Space direction="vertical" size={16} style={{width: '100%'}}>
                  <Input
                    addonBefore="名称"
                    value={deploymentDraft.name}
                    onChange={(event) => setDeploymentDraft((state) => ({...state, name: event.target.value}))}
                  />
                  <Space wrap>
                    <Select
                      placeholder="绑定服务器"
                      style={{minWidth: 220}}
                      value={deploymentDraft.serverId || undefined}
                      options={serverProfiles.map((item) => ({label: item.name, value: item.id}))}
                      onChange={(value) => setDeploymentDraft((state) => ({...state, serverId: value}))}
                    />
                    <Select
                      placeholder="绑定模块"
                      style={{minWidth: 260}}
                      value={deploymentDraft.moduleId || undefined}
                      options={modules.map((item) => ({
                        label: `${item.artifactId}${item.relativePath ? ` · ${item.relativePath}` : ''}`,
                        value: item.id,
                      }))}
                      onChange={(value) => setDeploymentDraft((state) => ({...state, moduleId: value}))}
                    />
                    <Input
                      placeholder="产物匹配规则，如 *.jar"
                      style={{minWidth: 220}}
                      value={deploymentDraft.localArtifactPattern}
                      onChange={(event) => setDeploymentDraft((state) => ({...state, localArtifactPattern: event.target.value}))}
                    />
                  </Space>
                  <Input
                    addonBefore="远端目录"
                    value={deploymentDraft.remoteDeployPath}
                    onChange={(event) => setDeploymentDraft((state) => ({...state, remoteDeployPath: event.target.value}))}
                  />
                  <Input
                    addonBefore="停止命令"
                    value={deploymentDraft.stopCommand}
                    onChange={(event) => setDeploymentDraft((state) => ({...state, stopCommand: event.target.value}))}
                  />
                  <Input
                    addonBefore="启动命令"
                    value={deploymentDraft.startCommand}
                    onChange={(event) => setDeploymentDraft((state) => ({...state, startCommand: event.target.value}))}
                  />
                  <Input
                    addonBefore="重启命令"
                    value={deploymentDraft.restartCommand}
                    onChange={(event) => setDeploymentDraft((state) => ({...state, restartCommand: event.target.value}))}
                  />
                  <Input
                    addonBefore="健康检查"
                    value={deploymentDraft.healthCheckUrl}
                    onChange={(event) => setDeploymentDraft((state) => ({...state, healthCheckUrl: event.target.value}))}
                  />
                  <Space wrap>
                    <Button type="primary" icon={<SaveOutlined />} onClick={() => void saveDeploymentProfile(deploymentDraft)}>
                      保存部署配置
                    </Button>
                    <Button onClick={() => setDeploymentDraft(createDeploymentDraft())}>
                      新建配置
                    </Button>
                  </Space>
                  {deploymentProfiles.length === 0 ? (
                    <Empty description="暂无部署配置" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  ) : (
                    <List
                      bordered
                      dataSource={deploymentProfiles}
                      renderItem={(profile) => (
                        <List.Item
                          actions={[
                            <Button key="edit" size="small" onClick={() => openDeployment(profile)}>
                              编辑
                            </Button>,
                            <Popconfirm
                              key="delete"
                              title="删除部署配置？"
                              okText="删除"
                              cancelText="取消"
                              onConfirm={() => void deleteDeploymentProfile(profile.id)}
                            >
                              <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                            </Popconfirm>,
                          ]}
                        >
                          <Space direction="vertical" size={2}>
                            <Text strong>{profile.name}</Text>
                            <Text type="secondary">{profile.remoteDeployPath}</Text>
                            <Text type="secondary">匹配：{profile.localArtifactPattern}</Text>
                          </Space>
                        </List.Item>
                      )}
                    />
                  )}
                </Space>
              ),
            },
            {
              key: 'run',
              label: '一键部署',
              children: (
                <Space direction="vertical" size={16} style={{width: '100%'}}>
                  <Select
                    placeholder="选择部署配置"
                    value={selectedDeploymentProfileId}
                    options={deploymentProfiles.map((item) => ({label: item.name, value: item.id}))}
                    onChange={(value) => {
                      setSelectedDeploymentProfileId(value)
                      setSelectedArtifactPath(undefined)
                    }}
                  />
                  <Select
                    placeholder="选择构建产物"
                    value={selectedArtifactPath}
                    options={artifactOptions}
                    onChange={setSelectedArtifactPath}
                    notFoundContent={selectedProfile ? '当前没有匹配该规则的本地产物' : '先选择部署配置'}
                  />
                  <Space wrap>
                    <Button
                      onClick={() => {
                        void selectLocalFile('选择要部署的本地产物').then((path) => {
                          if (path) {
                            setSelectedArtifactPath(path)
                          }
                        })
                      }}
                    >
                      手动选择产物
                    </Button>
                    <Button
                      type="primary"
                      icon={<PlayCircleOutlined />}
                      disabled={!selectedDeploymentProfileId || !selectedArtifactPath}
                      onClick={() => {
                        Modal.confirm({
                          title: '确认执行部署？',
                          content: '该操作会上传产物并执行停止/替换/启动命令，请确认目标服务器与配置无误。',
                          okText: '确认部署',
                          cancelText: '取消',
                          onOk: () => startDeployment(selectedDeploymentProfileId!, selectedArtifactPath!),
                        })
                      }}
                    >
                      开始部署
                    </Button>
                  </Space>
                  {selectedProfile ? (
                    <Alert
                      type="info"
                      showIcon
                      message={`部署配置：${selectedProfile.name}`}
                      description={`目标目录：${selectedProfile.remoteDeployPath}；匹配规则：${selectedProfile.localArtifactPattern}`}
                    />
                  ) : null}
                  {currentDeploymentTask ? (
                    <Card size="small" className="workflow-run-card">
                      <Space direction="vertical" size={8} style={{width: '100%'}}>
                        <Space wrap>
                          <Tag color={currentDeploymentTask.status === 'success' ? 'green' : currentDeploymentTask.status === 'failed' ? 'red' : 'processing'}>
                            {currentDeploymentTask.status}
                          </Tag>
                          <Text>{currentDeploymentTask.deploymentProfileName ?? currentDeploymentTask.deploymentProfileId}</Text>
                        </Space>
                        <Text type="secondary">{currentDeploymentTask.artifactPath}</Text>
                      </Space>
                    </Card>
                  ) : null}
                </Space>
              ),
            },
          ]}
        />
      </Space>
    </Card>
  )
}
