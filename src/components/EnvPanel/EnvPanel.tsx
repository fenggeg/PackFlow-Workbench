import {
    Alert,
    Button,
    Card,
    Input,
    Modal,
    Popover,
    Segmented,
    Space,
    Tag,
    Tooltip,
    Typography
} from 'antd'
import {
    FileSearchOutlined,
    FolderOpenOutlined,
    ReloadOutlined,
    SettingOutlined,
    SwapOutlined,
} from '@ant-design/icons'
import {useState} from 'react'
import {buildEnvironmentCenterItems, sourceText, statusColor,} from '../../services/environmentCenterService'
import {selectLocalDirectory, selectLocalFile} from '../../services/tauri-api'
import {useAppStore} from '../../store/useAppStore'
import type {EnvironmentProfile} from '../../types/domain'
import {JdkRegistryPanel} from './JdkRegistryPanel'

const { Text } = Typography

export function EnvPanel() {
  const project = useAppStore((state) => state.project)
  const environment = useAppStore((state) => state.environment)
  const environmentSettings = useAppStore((state) => state.environmentSettings)
  const updateEnvironment = useAppStore((state) => state.updateEnvironment)
  const refreshEnvironment = useAppStore((state) => state.refreshEnvironment)
  const [pathModalOpen, setPathModalOpen] = useState(false)
  const [jdkPopoverOpen, setJdkPopoverOpen] = useState(false)

  const mavenValue = environment?.mavenHome ?? environment?.mavenPath ?? ''
  const settingsValue = environment?.settingsXmlPath ?? ''
  const localRepoValue = environment?.localRepoPath ?? ''
  const profiles = environmentSettings?.profiles ?? []
  const items = buildEnvironmentCenterItems(environment)
  const currentExecutor = environment?.useMavenWrapper
    ? environment.mavenWrapperPath ?? 'mvnw.cmd'
    : environment?.mavenPath ?? 'mvn.cmd'

  const currentProjectPath = project?.rootPath ?? ''

  // JDK 需求提示
  const jdkRequirement = environment?.projectJdkRequirement

  /**
   * 获取或创建当前项目的专属 profile。
   * - 如果项目已绑定 profile，复用该 profile
   * - 否则创建新的空 profile 并绑定到当前项目
   */
  const getOrCreateProjectProfile = (): EnvironmentProfile => {
    const bindings = environmentSettings?.projectProfileBindings ?? {}
    const boundId = currentProjectPath ? bindings[currentProjectPath] : undefined
    if (boundId) {
      const bound = profiles.find((p) => p.id === boundId)
      if (bound) return { ...bound }
    }
    // 创建新的项目专属 profile
    return {
      id: crypto.randomUUID(),
      name: project?.artifactId ?? '项目配置',
      useMavenWrapper: environment?.useMavenWrapper ?? false,
      updatedAt: new Date().toISOString(),
    }
  }

  /**
   * 保存环境配置到当前项目的专属 profile，自动绑定项目。
   * 每个项目独立记忆，互不干扰。
   */
  const saveProjectEnv = async (patch: Partial<EnvironmentProfile>) => {
    const profile: EnvironmentProfile = {
      ...getOrCreateProjectProfile(),
      ...patch,
      updatedAt: new Date().toISOString(),
    }
    const baseSettings = environmentSettings ?? { profiles: [] }
    const nextBindings = { ...(baseSettings.projectProfileBindings ?? {}) }
    if (currentProjectPath) {
      nextBindings[currentProjectPath] = profile.id
    }
    await updateEnvironment({
      ...baseSettings,
      activeProfileId: profile.id,
      projectProfileBindings: nextBindings,
      profiles: [
        profile,
        ...profiles.filter((p) => p.id !== profile.id),
      ],
    })
  }

  const saveMavenHome = (mavenHome?: string) =>
    saveProjectEnv({ mavenHome })

  const saveSettingsXml = (settingsXmlPath?: string) =>
    saveProjectEnv({ settingsXmlPath })

  const saveLocalRepo = (localRepoPath?: string) =>
    saveProjectEnv({ localRepoPath })

  /** 选择 JDK：保存到当前项目专属 profile */
  const handleSelectJdk = async (jdkPath: string) => {
    setJdkPopoverOpen(false)
    await saveProjectEnv({ javaHome: jdkPath })
  }

  /** 切换回自动识别：清除 javaHome 覆盖 */
  const handleAutoDetect = async () => {
    setJdkPopoverOpen(false)
    await saveProjectEnv({ javaHome: undefined })
  }

  const jdkItem = items.find((i) => i.key === 'jdk')
  const otherItems = items.filter((i) => i.key !== 'jdk')
  const hasProject = Boolean(currentProjectPath)

  const jdkPopoverContent = (
    <div style={{width: 380}}>
      {/* JDK 需求提示 */}
      {jdkRequirement && (
        <div style={{marginBottom: 8, fontSize: 12, color: '#6b7280'}}>
          项目要求 JDK <Tag color="blue" style={{fontSize: 11}}>{jdkRequirement.versionSpec}</Tag>
        </div>
      )}
      {/* 当前 JDK 信息 */}
      {environment?.javaHome && (
        <div style={{marginBottom: 8, fontSize: 12, color: '#374151'}}>
          当前：<Text strong>{environment.javaVersion ?? '未知'}</Text>
          <Text type="secondary" style={{marginLeft: 4}} title={environment.javaHome}>
            {environment.javaHome}
          </Text>
        </div>
      )}
      {/* 已注册 JDK 列表 */}
      <JdkRegistryPanel onSelect={handleSelectJdk} />
      {/* 切换回自动识别 */}
      {environment?.javaSource === 'manual' && hasProject && (
        <Button
          size="small"
          type="link"
          onClick={() => void handleAutoDetect()}
          style={{marginTop: 4, padding: 0}}
        >
          切换回自动识别
        </Button>
      )}
    </div>
  )

  return (
    <Card
      title="环境中心"
      className="panel-card env-card"
      size="small"
      extra={
        <Space size={4}>
          <Tooltip title="手动覆盖路径">
            <Button
              size="small"
              icon={<SettingOutlined />}
              onClick={() => setPathModalOpen(true)}
            />
          </Tooltip>
          <Tooltip title="刷新环境">
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={() => void refreshEnvironment()}
            />
          </Tooltip>
        </Space>
      }
    >
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <div className="env-executor">
          <Text strong>当前执行器</Text>
          <Text className="env-summary-path" title={currentExecutor}>
            {currentExecutor}
          </Text>
        </div>
        <div className="env-summary-grid">
          {/* JDK 行：点击弹出选择器 */}
          {jdkItem && (
            <Popover
              content={jdkPopoverContent}
              trigger="click"
              title={
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                  <span>JDK 切换</span>
                  {hasProject && (
                    <Tag color="blue" style={{fontSize: 11, marginRight: 0}}>
                      自动记忆
                    </Tag>
                  )}
                </div>
              }
              placement="bottomLeft"
              open={jdkPopoverOpen}
              onOpenChange={setJdkPopoverOpen}
            >
              <div className="env-summary-item env-jdk-clickable">
                <div className="env-summary-main">
                  <Text strong className="env-summary-title">
                    {jdkItem.title}
                    <SwapOutlined style={{marginLeft: 6, fontSize: 11, color: '#9ca3af'}} />
                  </Text>
                  <Space size={4} className="env-summary-tags">
                    <Tag color={statusColor(jdkItem.status)}>{jdkItem.value}</Tag>
                    <Tag>{sourceText(jdkItem.source)}</Tag>
                  </Space>
                </div>
                <Text className="env-summary-path" type="secondary" title={jdkItem.detail}>
                  {jdkItem.detail}
                </Text>
              </div>
            </Popover>
          )}

          {otherItems.map((item) => (
            <div className="env-summary-item" key={item.key}>
              <div className="env-summary-main">
                <Text strong className="env-summary-title">
                  {item.title}
                </Text>
                <Space size={4} className="env-summary-tags">
                  <Tag color={statusColor(item.status)}>{item.value}</Tag>
                  <Tag>{sourceText(item.source)}</Tag>
                </Space>
              </div>
              <Text className="env-summary-path" type="secondary" title={item.detail}>
                {item.detail}
              </Text>
            </div>
          ))}

          <div className="env-summary-item env-wrapper-toggle">
            <div className="env-summary-main">
              <Text strong className="env-summary-title">
                执行器切换
              </Text>
              <Segmented
                className="env-executor-toggle"
                size="small"
                value={environment?.useMavenWrapper ? 'wrapper' : 'maven'}
                options={[
                  { label: 'Maven', value: 'maven' },
                  {
                    label: 'mvnw',
                    value: 'wrapper',
                    disabled: !environment?.hasMavenWrapper,
                  },
                ]}
                onChange={(value) =>
                  void saveProjectEnv({ useMavenWrapper: value === 'wrapper' })
                }
              />
            </div>
            <Text className="env-summary-path" type="secondary">
              {environment?.hasMavenWrapper ? '可在 Maven 与 Wrapper 间切换' : '当前项目不可切换'}
            </Text>
          </div>
        </div>

        {environment?.errors.map((error) => (
          <Alert key={error} type="warning" showIcon message={error} />
        ))}
      </Space>
      <Modal
        title="手动覆盖路径"
        open={pathModalOpen}
        okText="完成"
        cancelText="关闭"
        onOk={() => setPathModalOpen(false)}
        onCancel={() => setPathModalOpen(false)}
      >
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <div className="env-row">
            <Text className="env-row-label">Maven</Text>
            <Input.Group compact>
              <Input
                key={`maven-${mavenValue}`}
                className="env-path-input env-path-input-double-action"
                placeholder="选择或粘贴 Maven 目录 / mvn.cmd"
                defaultValue={mavenValue}
                onBlur={(event) =>
                  void saveMavenHome(event.target.value.trim() || undefined)
                }
                onPressEnter={(event) => event.currentTarget.blur()}
              />
              <Button
                icon={<FileSearchOutlined />}
                title="选择 mvn.cmd"
                onClick={async () => {
                  const selected = await selectLocalFile('选择 mvn.cmd')
                  if (selected) {
                    await saveMavenHome(selected)
                  }
                }}
              />
              <Button
                icon={<FolderOpenOutlined />}
                title="选择 Maven 目录"
                onClick={async () => {
                  const selected = await selectLocalDirectory('选择 Maven 目录')
                  if (selected) {
                    await saveMavenHome(selected)
                  }
                }}
              />
            </Input.Group>
          </div>

          <div className="env-row">
            <Text className="env-row-label">settings.xml</Text>
            <Input.Group compact>
              <Input
                key={`settings-${settingsValue}`}
                className="env-path-input env-path-input-single-action"
                placeholder="选择或粘贴 settings.xml"
                defaultValue={settingsValue}
                onBlur={(event) =>
                  void saveSettingsXml(event.target.value.trim() || undefined)
                }
                onPressEnter={(event) => event.currentTarget.blur()}
              />
              <Button
                icon={<FileSearchOutlined />}
                title="选择 settings.xml"
                onClick={async () => {
                  const selected = await selectLocalFile('选择 settings.xml')
                  if (selected) {
                    await saveSettingsXml(selected)
                  }
                }}
              />
            </Input.Group>
          </div>

          <div className="env-row">
            <Text className="env-row-label">本地仓库</Text>
            <Input.Group compact>
              <Input
                key={`repo-${localRepoValue}`}
                className="env-path-input env-path-input-single-action"
                placeholder="选择或粘贴本地仓库目录"
                defaultValue={localRepoValue}
                onBlur={(event) =>
                  void saveLocalRepo(event.target.value.trim() || undefined)
                }
                onPressEnter={(event) => event.currentTarget.blur()}
              />
              <Button
                icon={<FolderOpenOutlined />}
                title="选择本地仓库目录"
                onClick={async () => {
                  const selected = await selectLocalDirectory('选择本地仓库目录')
                  if (selected) {
                    await saveLocalRepo(selected)
                  }
                }}
              />
            </Input.Group>
          </div>
        </Space>
      </Modal>
    </Card>
  )
}
