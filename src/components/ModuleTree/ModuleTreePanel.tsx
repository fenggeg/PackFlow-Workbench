import {Alert, Button, Card, Divider, Empty, Input, Space, Spin, Tag, Tooltip, Tree, Typography} from 'antd'
import {
    AppstoreOutlined,
    CheckSquareOutlined,
    ClearOutlined,
    CompressOutlined,
    ExpandOutlined,
    FilterOutlined,
} from '@ant-design/icons'
import type {DataNode} from 'antd/es/tree'
import type {Key} from 'react'
import {useMemo, useState} from 'react'
import {useAppStore} from '../../store/useAppStore'
import {useWorkflowStore} from '../../store/useWorkflowStore'
import type {MavenModule} from '../../types/domain'

const { Text } = Typography

const shortenArtifactId = (artifactId: string) =>
  artifactId.replace(/^(scs|wip|maven|mp)-/i, '')

const moduleToTreeNode = (moduleItem: MavenModule): DataNode => ({
  key: moduleItem.id,
  title: (
    <Tooltip title={moduleItem.artifactId}>
      <div className="module-tree-title">
        <strong>{shortenArtifactId(moduleItem.artifactId)}</strong>
        <div className="module-meta">{moduleItem.relativePath || '根项目'}</div>
      </div>
    </Tooltip>
  ),
  children: moduleItem.children?.map(moduleToTreeNode),
})

const filterModules = (
  modules: MavenModule[],
  keyword: string,
  selectedIds: string[],
  checkedOnly: boolean,
): MavenModule[] => {
  const normalized = keyword.trim().toLowerCase()
  if (!normalized && !checkedOnly) {
    return modules
  }

  const result: MavenModule[] = []
  for (const moduleItem of modules) {
    const children = filterModules(moduleItem.children ?? [], normalized, selectedIds, checkedOnly)
    const matched =
      !normalized ||
      moduleItem.artifactId.toLowerCase().includes(normalized) ||
      moduleItem.relativePath.toLowerCase().includes(normalized)
    const selected = !checkedOnly || selectedIds.includes(moduleItem.id)
    if ((matched && selected) || children.length > 0) {
      result.push({ ...moduleItem, children })
    }
  }
  return result
}

const flattenModuleIds = (modules: MavenModule[]): string[] =>
  modules.flatMap((moduleItem) => [
    moduleItem.id,
    ...flattenModuleIds(moduleItem.children ?? []),
  ])

const flattenModules = (modules: MavenModule[]): MavenModule[] =>
  modules.flatMap((moduleItem) => [
    moduleItem,
    ...flattenModules(moduleItem.children ?? []),
  ])

export function ModuleTreePanel() {
  const project = useAppStore((state) => state.project)
  const loading = useAppStore((state) => state.loading)
  const selectedModule = useAppStore((state) => state.selectedModule)
  const selectedModules = useAppStore((state) => state.selectedModules)
  const selectedModuleIds = useAppStore((state) => state.selectedModuleIds)
  const setSelectedModule = useAppStore((state) => state.setSelectedModule)
  const setSelectedModules = useAppStore((state) => state.setSelectedModules)
  const selectAllProject = useAppStore((state) => state.selectAllProject)
  const dependencyGraph = useWorkflowStore((state) => state.dependencyGraph)
  const dependencyLoading = useWorkflowStore((state) => state.dependencyLoading)
  const [keyword, setKeyword] = useState('')
  const [showCheckedOnly, setShowCheckedOnly] = useState(false)
  const [expandedKeys, setExpandedKeys] = useState<Key[]>([])

  const filteredModules = useMemo(
    () => filterModules(project?.modules ?? [], keyword, selectedModuleIds, showCheckedOnly),
    [keyword, project?.modules, selectedModuleIds, showCheckedOnly],
  )
  const treeData = useMemo(
    () => filteredModules.map(moduleToTreeNode),
    [filteredModules],
  )
  const allModuleIds = useMemo(
    () => flattenModuleIds(project?.modules ?? []),
    [project?.modules],
  )
  const allModulesChecked =
    allModuleIds.length > 0 && selectedModuleIds.length === allModuleIds.length
  const filteredModuleIds = useMemo(
    () => flattenModuleIds(filteredModules),
    [filteredModules],
  )
  const shouldExpandSearch = Boolean(keyword.trim()) || showCheckedOnly
  const selectedSummary = dependencyGraph?.summaries.find((item) => item.moduleId === selectedModule?.id)
  const idToModule = useMemo(
    () => Object.fromEntries(flattenModules(project?.modules ?? []).map((module) => [module.id, module])),
    [project?.modules],
  )

  const renderModuleTags = (moduleIds: string[], color: string) =>
    moduleIds.length > 0 ? (
      <Space wrap>
        {moduleIds.map((moduleId) => (
          <Tag key={moduleId} color={color}>
            {idToModule[moduleId]?.artifactId ?? moduleId}
          </Tag>
        ))}
      </Space>
    ) : (
      <Text type="secondary">暂无</Text>
    )

  return (
    <Card title="模块列表" className="panel-card module-tree-card" size="small">
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Input
          placeholder="搜索 artifactId 或路径"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        {project ? (
          <Space wrap>
            <Tooltip title="全部项目打包">
              <Button size="small" icon={<AppstoreOutlined />} type={selectedModules.length === 0 ? 'primary' : 'default'} onClick={selectAllProject} />
            </Tooltip>
            <Tooltip title={allModulesChecked ? '取消全选' : '全选模块'}>
              <Button
                size="small"
                icon={<CheckSquareOutlined />}
                onClick={() => setSelectedModules(allModulesChecked ? [] : allModuleIds)}
              />
            </Tooltip>
            <Tooltip title="清空选择">
              <Button size="small" icon={<ClearOutlined />} onClick={() => setSelectedModules([])} />
            </Tooltip>
            <Tooltip title="展开全部">
              <Button size="small" icon={<ExpandOutlined />} onClick={() => setExpandedKeys(allModuleIds)} />
            </Tooltip>
            <Tooltip title="收起全部">
              <Button size="small" icon={<CompressOutlined />} onClick={() => setExpandedKeys([])} />
            </Tooltip>
            <Tooltip title="仅显示已选">
              <Button
                size="small"
                icon={<FilterOutlined />}
                type={showCheckedOnly ? 'primary' : 'default'}
                onClick={() => setShowCheckedOnly((value) => !value)}
              />
            </Tooltip>
          </Space>
        ) : null}
        {loading ? (
          <div className="module-loading-state">
            <Spin />
            <Text type="secondary">正在解析项目模块...</Text>
          </div>
        ) : null}
        {!loading && !project ? <Empty description="等待选择项目" image={Empty.PRESENTED_IMAGE_SIMPLE} /> : null}
        {project && treeData.length === 0 ? (
          <Empty description="没有匹配模块" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : null}
        {!loading && treeData.length > 0 ? (
          <Tree
            className="module-tree"
            checkable
            virtual={false}
            expandedKeys={shouldExpandSearch ? filteredModuleIds : expandedKeys}
            checkedKeys={selectedModuleIds}
            selectedKeys={selectedModule ? [selectedModule.id] : []}
            treeData={treeData}
            onExpand={(keys) => setExpandedKeys(keys)}
            onCheck={(checked) => {
              const keys = Array.isArray(checked) ? checked : checked.checked
              setSelectedModules(keys.map(String))
            }}
            onSelect={(keys) => {
              const key = keys[0]
              if (typeof key === 'string') {
                setSelectedModule(key)
              }
            }}
          />
        ) : null}
        {selectedModule?.errorMessage ? (
          <Alert type="warning" showIcon message={selectedModule.errorMessage} />
        ) : null}
        {selectedModules.length === 0 && project ? (
          <Text type="secondary">当前选择：全部项目</Text>
        ) : null}
        {selectedModules.length > 0 ? (
          <Text type="secondary">
            当前选择：{selectedModules.length === 1
              ? `${selectedModules[0].artifactId} (${selectedModules[0].packaging ?? 'unknown'})`
              : `${selectedModules.length} 个模块`}
          </Text>
        ) : null}
        {selectedModule ? <Divider style={{ margin: '8px 0' }} /> : null}
        {selectedModule ? (
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            <Space wrap>
              <Text strong>依赖洞察</Text>
              {dependencyLoading ? <Spin size="small" /> : null}
              {selectedSummary?.hasCycle ? <Tag color="red">检测到循环依赖</Tag> : null}
            </Space>
            <Text type="secondary">
              当前模块：{selectedModule.artifactId}
            </Text>
            <div className="dependency-info-block">
              <Text strong>依赖模块</Text>
              {renderModuleTags(selectedSummary?.dependencies ?? [], 'blue')}
            </div>
            <div className="dependency-info-block">
              <Text strong>被依赖模块</Text>
              {renderModuleTags(selectedSummary?.dependents ?? [], 'gold')}
            </div>
            <Alert
              type="info"
              showIcon
              message="实用打包逻辑：当前模块构建交给 Maven -am，发布范围看发布候选模块"
              description="上游依赖由“同时构建依赖模块 (-am)”自动补齐；这里重点展示最终更值得打包发布的模块范围。"
            />
            <div className="dependency-info-block">
              <Text strong>发布候选模块</Text>
              <Text type="secondary">如果当前改动需要形成可发布产物，优先关注这些最终受影响模块。</Text>
              {renderModuleTags(selectedSummary?.releaseCandidateModuleIds ?? [], 'green')}
            </div>
            {(selectedSummary?.releaseCandidateModuleIds.length ?? 0) > 0 ? (
              <Button
                size="small"
                type="primary"
                onClick={() => setSelectedModules([
                  ...new Set([
                    selectedModule.id,
                    ...(selectedSummary?.releaseCandidateModuleIds ?? []),
                  ]),
                ])}
              >
                一键选中发布候选模块
              </Button>
            ) : null}
            <div className="dependency-info-block">
              <Text strong>验证建议模块</Text>
              <Text type="secondary">更适合联调或回归时一起关注的直接下游模块。</Text>
              {renderModuleTags(selectedSummary?.suggestedValidationModuleIds ?? [], 'gold')}
            </div>
            <div className="dependency-info-block">
              <Text strong>聚合关联模块</Text>
              <Text type="secondary">同父聚合或父子聚合关系，默认仅展示，不自动建议打包。</Text>
              {renderModuleTags(selectedSummary?.relatedAggregationModuleIds ?? [], 'cyan')}
            </div>
            {(selectedSummary?.suggestedValidationModuleIds.length ?? 0) > 0 ? (
              <Button
                size="small"
                onClick={() => setSelectedModules([
                  ...new Set([
                    ...(selectedModuleIds ?? []),
                    ...(selectedSummary?.suggestedValidationModuleIds ?? []),
                  ]),
                ])}
              >
                一键加入验证建议模块
              </Button>
            ) : null}
          </Space>
        ) : null}
      </Space>
    </Card>
  )
}
