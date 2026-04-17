import { Alert, Button, Card, Empty, Input, Space, Tree, Typography } from 'antd'
import type { DataNode } from 'antd/es/tree'
import { useMemo, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import type { MavenModule } from '../../types/domain'

const { Text } = Typography

const moduleToTreeNode = (moduleItem: MavenModule): DataNode => ({
  key: moduleItem.id,
  title: (
    <span>
      <strong>{moduleItem.artifactId}</strong>
      <div className="module-meta">{moduleItem.relativePath}</div>
    </span>
  ),
  children: moduleItem.children?.map(moduleToTreeNode),
})

const filterModules = (modules: MavenModule[], keyword: string): MavenModule[] => {
  const normalized = keyword.trim().toLowerCase()
  if (!normalized) {
    return modules
  }

  const result: MavenModule[] = []
  for (const moduleItem of modules) {
    const children = filterModules(moduleItem.children ?? [], normalized)
    const matched =
      moduleItem.artifactId.toLowerCase().includes(normalized) ||
      moduleItem.relativePath.toLowerCase().includes(normalized)
    if (matched || children.length > 0) {
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

export function ModuleTreePanel() {
  const project = useAppStore((state) => state.project)
  const selectedModule = useAppStore((state) => state.selectedModule)
  const selectedModules = useAppStore((state) => state.selectedModules)
  const selectedModuleIds = useAppStore((state) => state.selectedModuleIds)
  const setSelectedModule = useAppStore((state) => state.setSelectedModule)
  const setSelectedModules = useAppStore((state) => state.setSelectedModules)
  const selectAllProject = useAppStore((state) => state.selectAllProject)
  const [keyword, setKeyword] = useState('')

  const filteredModules = useMemo(
    () => filterModules(project?.modules ?? [], keyword),
    [keyword, project?.modules],
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

  return (
    <Card title="模块列表" className="panel-card" size="small">
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Input
          placeholder="搜索 artifactId 或路径"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        {project ? (
          <Space wrap>
            <Button size="small" type={selectedModules.length === 0 ? 'primary' : 'default'} onClick={selectAllProject}>
              全部项目打包
            </Button>
            <Button
              size="small"
              onClick={() => setSelectedModules(allModulesChecked ? [] : allModuleIds)}
            >
              {allModulesChecked ? '取消全选' : '全选模块'}
            </Button>
          </Space>
        ) : null}
        {!project ? <Empty description="等待选择项目" image={Empty.PRESENTED_IMAGE_SIMPLE} /> : null}
        {project && treeData.length === 0 ? (
          <Empty description="没有匹配模块" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : null}
        {treeData.length > 0 ? (
          <Tree
            blockNode
            checkable
            defaultExpandAll={Boolean(keyword.trim())}
            key={keyword.trim() ? 'search-expanded' : 'initial-collapsed'}
            checkedKeys={selectedModuleIds}
            selectedKeys={selectedModule ? [selectedModule.id] : []}
            treeData={treeData}
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
      </Space>
    </Card>
  )
}
