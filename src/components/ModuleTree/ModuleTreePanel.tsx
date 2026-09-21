import {
  AppWindow,
  CheckSquare,
  Filter,
  X,
} from 'lucide-react'
import {useMemo, useState} from 'react'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {StatusPill} from '@/components/ui/status-pill'
import {Tree, type TreeNodeData} from '@/components/ui/tree'
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip'
import {WorkspaceCollapse} from '@/components/ui/workspace-collapse'
import {useAppStore} from '@/store/useAppStore'
import {useWorkflowStore} from '@/store/useWorkflowStore'
import type {MavenModule} from '@/types/domain'

const shortenArtifactId = (artifactId: string) => artifactId.replace(/^(scs|wip|maven|mp)-/i, '')

const moduleToTreeNode = (moduleItem: MavenModule): TreeNodeData => ({
  key: moduleItem.id,
  title: shortenArtifactId(moduleItem.artifactId),
  meta: moduleItem.relativePath || '根项目',
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
      result.push({...moduleItem, children})
    }
  }
  return result
}

const flattenModuleIds = (modules: MavenModule[]): string[] =>
  modules.flatMap((moduleItem) => [moduleItem.id, ...flattenModuleIds(moduleItem.children ?? [])])

export function ModuleTreePanel() {
  const project = useAppStore((state) => state.project)
  const loading = useAppStore((state) => state.loading)
  const selectedModules = useAppStore((state) => state.selectedModules)
  const selectedModuleIds = useAppStore((state) => state.selectedModuleIds)
  const setSelectedModules = useAppStore((state) => state.setSelectedModules)
  const selectAllProject = useAppStore((state) => state.selectAllProject)
  const dependencyGraph = useWorkflowStore((state) => state.dependencyGraph)
  const dependencyLoading = useWorkflowStore((state) => state.dependencyLoading)
  const [keyword, setKeyword] = useState('')
  const [showCheckedOnly, setShowCheckedOnly] = useState(false)
  const [focusedModuleId, setFocusedModuleId] = useState<string | undefined>(undefined)

  const filteredModules = useMemo(
    () => filterModules(project?.modules ?? [], keyword, selectedModuleIds, showCheckedOnly),
    [keyword, project?.modules, selectedModuleIds, showCheckedOnly],
  )
  const treeData = useMemo(() => filteredModules.map(moduleToTreeNode), [filteredModules])
  const allModuleIds = useMemo(() => flattenModuleIds(project?.modules ?? []), [project?.modules])
  const allModulesChecked = allModuleIds.length > 0 && selectedModuleIds.length === allModuleIds.length

  const idToModule = useMemo(() => {
    const map: Record<string, MavenModule> = {}
    const collect = (modules: MavenModule[]) => {
      for (const mod of modules) {
        map[mod.id] = mod
        if (mod.children) collect(mod.children)
      }
    }
    collect(project?.modules ?? [])
    return map
  }, [project?.modules])

  const focusedModule = useMemo(() => {
    if (!focusedModuleId) return undefined
    return idToModule[focusedModuleId]
  }, [focusedModuleId, idToModule])
  const selectedSummary = dependencyGraph?.summaries.find((item) => item.moduleId === focusedModule?.id)

  const checkedSet = useMemo(() => new Set(selectedModuleIds), [selectedModuleIds])

  const renderModuleTags = (moduleIds: string[], tone: 'info' | 'warning' | 'success' | 'neutral') =>
    moduleIds.length > 0 ? (
      <div className="flex flex-wrap gap-1.5">
        {moduleIds.map((moduleId) => (
          <StatusPill key={moduleId} tone={tone}>
            {idToModule[moduleId]?.artifactId ?? moduleId}
          </StatusPill>
        ))}
      </div>
    ) : (
      <span className="text-[12px] text-[var(--muted-foreground)]">暂无</span>
    )

  return (
    <Card>
      <CardHeader>
        <CardTitle>模块列表</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Input
          placeholder="搜索 artifactId 或路径"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        {project ? (
          <div className="flex flex-wrap items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={selectedModules.length === 0 ? 'primary' : 'secondary'}
                  size="iconSm"
                  aria-label="全部项目打包"
                  onClick={selectAllProject}
                >
                  <AppWindow />
                </Button>
              </TooltipTrigger>
              <TooltipContent>全部项目打包</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="iconSm"
                  aria-label={allModulesChecked ? '取消全选' : '全选模块'}
                  onClick={() => setSelectedModules(allModulesChecked ? [] : allModuleIds)}
                >
                  <CheckSquare />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{allModulesChecked ? '取消全选' : '全选模块'}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="iconSm"
                  aria-label="清空选择"
                  onClick={() => setSelectedModules([])}
                >
                  <X />
                </Button>
              </TooltipTrigger>
              <TooltipContent>清空选择</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showCheckedOnly ? 'primary' : 'secondary'}
                  size="iconSm"
                  aria-label="仅显示已选"
                  onClick={() => setShowCheckedOnly((value) => !value)}
                >
                  <Filter />
                </Button>
              </TooltipTrigger>
              <TooltipContent>仅显示已选</TooltipContent>
            </Tooltip>
          </div>
        ) : null}

        {loading ? (
          <div className="flex min-h-16 flex-col items-center justify-center gap-2 text-[13px] text-[var(--muted-foreground)]">
            <span className="size-4 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--primary)]" />
            正在解析项目模块...
          </div>
        ) : null}
        {!loading && !project ? (
          <div className="flex min-h-16 items-center justify-center text-[13px] text-[var(--muted-foreground)]">
            等待选择项目
          </div>
        ) : null}
        {project && treeData.length === 0 ? (
          <div className="flex min-h-16 items-center justify-center text-[13px] text-[var(--muted-foreground)]">
            没有匹配模块
          </div>
        ) : null}

        {!loading && treeData.length > 0 ? (
          <Tree
            nodes={treeData}
            checkedKeys={checkedSet}
            onCheckedChange={(keys) => setSelectedModules([...keys])}
            selectedKey={focusedModuleId}
            onSelect={(key) => setFocusedModuleId(key)}
            search={keyword || undefined}
          />
        ) : null}

        {focusedModule?.errorMessage ? (
          <div className="rounded-[var(--radius)] border border-[var(--warning)]/30 bg-[var(--warning)]/5 px-3 py-2 text-[13px] text-[var(--warning)]">
            {focusedModule.errorMessage}
          </div>
        ) : null}

        {selectedModules.length === 0 && project ? (
          <span className="text-[12px] text-[var(--muted-foreground)]">当前选择：全部项目</span>
        ) : null}
        {selectedModules.length > 0 ? (
          <span className="text-[12px] text-[var(--muted-foreground)]">
            当前选择：
            {selectedModules.length === 1
              ? `${selectedModules[0].artifactId} (${selectedModules[0].packaging ?? 'unknown'})`
              : selectedModules.length <= 3
                // 少量模块直接列出名称，避免只显示「N 个模块」让人无法确认范围
                ? selectedModules.map((moduleItem) => moduleItem.artifactId).join('、')
                : `${selectedModules.length} 个模块`}
          </span>
        ) : null}

        {focusedModule ? (
          <WorkspaceCollapse
            defaultOpenKeys={['insight']}
            items={[
              {
                key: 'insight',
                label: `依赖洞察 · ${focusedModule.artifactId}`,
                children: (
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              {dependencyLoading ? (
                <span
                  className="size-3.5 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--primary)]"
                  aria-label="依赖分析加载中"
                />
              ) : null}
              {selectedSummary?.hasCycle ? <StatusPill tone="error">检测到循环依赖</StatusPill> : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium">依赖模块</span>
              {renderModuleTags(selectedSummary?.dependencies ?? [], 'info')}
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium">被依赖模块</span>
              {renderModuleTags(selectedSummary?.dependents ?? [], 'warning')}
            </div>

            <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-[12px] text-[var(--muted-foreground)]">
              实用打包逻辑：当前模块构建交给 Maven -am，发布范围看发布候选模块
              <p className="m-0 mt-1">
                上游依赖由「同时构建依赖模块 (-am)」自动补齐；这里重点展示最终更值得打包发布的模块范围。
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium">发布候选模块</span>
              <span className="text-[12px] text-[var(--muted-foreground)]">
                如果当前改动需要形成可发布产物，优先关注这些最终受影响模块。
              </span>
              {renderModuleTags(selectedSummary?.releaseCandidateModuleIds ?? [], 'success')}
            </div>
            {(selectedSummary?.releaseCandidateModuleIds.length ?? 0) > 0 ? (
              <Button
                variant="primary"
                size="sm"
                className="self-start"
                onClick={() =>
                  setSelectedModules([
                    ...new Set([
                      focusedModule.id,
                      ...(selectedSummary?.releaseCandidateModuleIds ?? []),
                    ]),
                  ])
                }
              >
                一键选中发布候选模块
              </Button>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium">验证建议模块</span>
              <span className="text-[12px] text-[var(--muted-foreground)]">
                更适合联调或回归时一起关注的直接下游模块。
              </span>
              {renderModuleTags(selectedSummary?.suggestedValidationModuleIds ?? [], 'warning')}
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium">聚合关联模块</span>
              <span className="text-[12px] text-[var(--muted-foreground)]">
                同父聚合或父子聚合关系，默认仅展示，不自动建议打包。
              </span>
              {renderModuleTags(selectedSummary?.relatedAggregationModuleIds ?? [], 'neutral')}
            </div>
            {(selectedSummary?.suggestedValidationModuleIds.length ?? 0) > 0 ? (
              <Button
                variant="secondary"
                size="sm"
                className="self-start"
                onClick={() =>
                  setSelectedModules([
                    ...new Set([
                      ...selectedModuleIds,
                      ...(selectedSummary?.suggestedValidationModuleIds ?? []),
                    ]),
                  ])
                }
              >
                一键加入验证建议模块
              </Button>
            ) : null}
          </div>
                ),
              },
            ]}
          />
        ) : null}
        {!focusedModule && project ? (
          <span className="text-[12px] text-[var(--muted-foreground)]">
            点击模块行即可切换是否加入构建，并查看该模块的依赖洞察。
          </span>
        ) : null}
      </CardContent>
    </Card>
  )
}
