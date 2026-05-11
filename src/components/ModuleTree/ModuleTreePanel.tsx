import {useCallback, useMemo, useState} from "react";
import {
    AlertTriangle,
    CheckSquare,
    ChevronDown,
    ChevronRight,
    Folder,
    FolderOpen,
    Info,
    Loader2,
    Search,
    Trash2
} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Badge} from "@/components/ui/badge";
import {Checkbox} from "@/components/ui/checkbox";
import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip";
import {ScrollArea} from "@/components/ui/scroll-area";
import {useAppStore} from "../../store/useAppStore";
import {useWorkflowStore} from "../../store/useWorkflowStore";
import type {MavenModule} from "../../types/domain";

const shortenArtifactId = (artifactId: string) =>
  artifactId.replace(/^(scs|wip|maven|mp)-/i, "");

const flattenModuleIds = (modules: MavenModule[]): string[] =>
  modules.flatMap((m) => [m.id, ...flattenModuleIds(m.children ?? [])]);

const flattenModules = (modules: MavenModule[]): MavenModule[] =>
  modules.flatMap((m) => [m, ...flattenModules(m.children ?? [])]);

const filterModules = (
  modules: MavenModule[],
  keyword: string,
  selectedIds: string[],
  checkedOnly: boolean,
): MavenModule[] => {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized && !checkedOnly) return modules;
  const result: MavenModule[] = [];
  for (const mod of modules) {
    const children = filterModules(mod.children ?? [], normalized, selectedIds, checkedOnly);
    const matched =
      !normalized ||
      mod.artifactId.toLowerCase().includes(normalized) ||
      mod.relativePath.toLowerCase().includes(normalized);
    const selected = !checkedOnly || selectedIds.includes(mod.id);
    if ((matched && selected) || children.length > 0) {
      result.push({ ...mod, children });
    }
  }
  return result;
};

interface TreeNodeProps {
  module: MavenModule;
  depth: number;
  expandedKeys: Set<string>;
  selectedModuleIds: string[];
  selectedModuleId?: string;
  onToggleExpand: (id: string) => void;
  onToggleCheck: (id: string) => void;
  onSelect: (id: string) => void;
}

function TreeNode({
  module,
  depth,
  expandedKeys,
  selectedModuleIds,
  selectedModuleId,
  onToggleExpand,
  onToggleCheck,
  onSelect,
}: TreeNodeProps) {
  const hasChildren = module.children && module.children.length > 0;
  const isExpanded = expandedKeys.has(module.id);
  const isChecked = selectedModuleIds.includes(module.id);
  const isSelected = selectedModuleId === module.id;

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 py-1 px-2 rounded-md cursor-pointer group text-sm transition-colors ${
          isChecked
            ? "bg-primary/5 hover:bg-primary/10"
            : "hover:bg-accent"
        } ${isSelected ? "border-l-2 border-l-primary" : "border-l-2 border-l-transparent"}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onToggleCheck(module.id)}
      >
        {hasChildren ? (
          <button
            className="p-0.5 hover:bg-muted rounded shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(module.id);
            }}
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <Checkbox
          checked={isChecked}
          className="shrink-0"
          onClick={(e) => e.stopPropagation()}
          onCheckedChange={() => onToggleCheck(module.id)}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`truncate flex-1 ${isChecked ? "font-medium text-foreground" : "text-foreground/80"}`}>
              {shortenArtifactId(module.artifactId)}
            </span>
          </TooltipTrigger>
          <TooltipContent>{module.artifactId}</TooltipContent>
        </Tooltip>
        <span className="text-xs text-muted-foreground truncate max-w-[80px]">
          {module.relativePath || "root"}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={`p-0.5 rounded shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${
                isSelected ? "opacity-100 text-primary" : "hover:bg-muted text-muted-foreground"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(module.id);
              }}
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>查看依赖洞察</TooltipContent>
        </Tooltip>
      </div>
      {hasChildren && isExpanded && (
        <div>
          {module.children!.map((child) => (
            <TreeNode
              key={child.id}
              module={child}
              depth={depth + 1}
              expandedKeys={expandedKeys}
              selectedModuleIds={selectedModuleIds}
              selectedModuleId={selectedModuleId}
              onToggleExpand={onToggleExpand}
              onToggleCheck={onToggleCheck}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ModuleTreePanel() {
  const project = useAppStore((s) => s.project);
  const loading = useAppStore((s) => s.loading);
  const selectedModule = useAppStore((s) => s.selectedModule);
  const selectedModules = useAppStore((s) => s.selectedModules);
  const selectedModuleIds = useAppStore((s) => s.selectedModuleIds);
  const setSelectedModule = useAppStore((s) => s.setSelectedModule);
  const setSelectedModules = useAppStore((s) => s.setSelectedModules);
  const selectAllProject = useAppStore((s) => s.selectAllProject);
  const dependencyGraph = useWorkflowStore((s) => s.dependencyGraph);
  const dependencyLoading = useWorkflowStore((s) => s.dependencyLoading);

  const [keyword, setKeyword] = useState("");
  const [showCheckedOnly, setShowCheckedOnly] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const filteredModules = useMemo(
    () => filterModules(project?.modules ?? [], keyword, selectedModuleIds, showCheckedOnly),
    [keyword, project?.modules, selectedModuleIds, showCheckedOnly],
  );

  const allModuleIds = useMemo(
    () => flattenModuleIds(project?.modules ?? []),
    [project?.modules],
  );

  const allModulesChecked =
    allModuleIds.length > 0 && selectedModuleIds.length === allModuleIds.length;

  const filteredModuleIds = useMemo(
    () => new Set(flattenModuleIds(filteredModules)),
    [filteredModules],
  );

  const shouldExpandSearch = Boolean(keyword.trim()) || showCheckedOnly;
  const effectiveExpanded = shouldExpandSearch ? filteredModuleIds : expandedKeys;

  const selectedSummary = dependencyGraph?.summaries.find(
    (item) => item.moduleId === selectedModule?.id,
  );

  const idToModule = useMemo(
    () => Object.fromEntries(flattenModules(project?.modules ?? []).map((m) => [m.id, m])),
    [project?.modules],
  );

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleToggleCheck = useCallback(
    (id: string) => {
      const next = selectedModuleIds.includes(id)
        ? selectedModuleIds.filter((x) => x !== id)
        : [...selectedModuleIds, id];
      setSelectedModules(next);
    },
    [selectedModuleIds, setSelectedModules],
  );

  const handleSelect = useCallback(
    (id: string) => setSelectedModule(id),
    [setSelectedModule],
  );

  const renderModuleTags = (moduleIds: string[], color: string) =>
    moduleIds.length > 0 ? (
      <div className="flex flex-wrap gap-1">
        {moduleIds.map((id) => (
          <Badge key={id} variant="secondary" className="text-xs">
            {idToModule[id]?.artifactId ?? id}
          </Badge>
        ))}
      </div>
    ) : (
      <span className="text-xs text-muted-foreground">暂无</span>
    );

  return (
    <div className="flex flex-col gap-3 h-full">
      <Input
        placeholder="搜索 artifactId 或路径"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        className="h-8 text-sm"
      />

      {project && (
        <div className="flex flex-wrap gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant={selectedModules.length === 0 ? "default" : "outline"}
                className="h-7 px-2"
                onClick={selectAllProject}
              >
                <FolderOpen className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>全部项目打包</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2"
                onClick={() => setSelectedModules(allModulesChecked ? [] : allModuleIds)}
              >
                <CheckSquare className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{allModulesChecked ? "取消全选" : "全选模块"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2"
                onClick={() => setSelectedModules([])}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>清空选择</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2"
                onClick={() => setExpandedKeys(new Set(allModuleIds))}
              >
                <FolderOpen className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>展开全部</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2"
                onClick={() => setExpandedKeys(new Set())}
              >
                <Folder className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>收起全部</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant={showCheckedOnly ? "default" : "outline"}
                className="h-7 px-2"
                onClick={() => setShowCheckedOnly((v) => !v)}
              >
                <Search className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>仅显示已选</TooltipContent>
          </Tooltip>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm text-muted-foreground">正在解析项目模块...</span>
        </div>
      )}

      {!loading && !project && (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Folder className="h-8 w-8 mb-2" />
          <span className="text-sm">等待选择项目</span>
        </div>
      )}

      {project && filteredModules.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Search className="h-8 w-8 mb-2" />
          <span className="text-sm">没有匹配模块</span>
        </div>
      )}

      {!loading && filteredModules.length > 0 && (
        <ScrollArea className="flex-1 min-h-0">
          <div className="pr-2">
            {filteredModules.map((mod) => (
              <TreeNode
                key={mod.id}
                module={mod}
                depth={0}
                expandedKeys={effectiveExpanded}
                selectedModuleIds={selectedModuleIds}
                selectedModuleId={selectedModule?.id}
                onToggleExpand={handleToggleExpand}
                onToggleCheck={handleToggleCheck}
                onSelect={handleSelect}
              />
            ))}
          </div>
        </ScrollArea>
      )}

      {selectedModule?.errorMessage && (
        <div className="flex items-start gap-2 p-2 rounded-md bg-yellow-500/10 text-yellow-600 text-xs">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{selectedModule.errorMessage}</span>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        {selectedModules.length === 0 && project
          ? "当前选择：全部项目"
          : selectedModules.length > 0
            ? `当前选择：${selectedModules.length === 1 ? `${selectedModules[0].artifactId} (${selectedModules[0].packaging ?? "unknown"})` : `${selectedModules.length} 个模块`}`
            : null}
      </div>

      {selectedModule && (
        <div className="border-t pt-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">依赖洞察</span>
            {dependencyLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {selectedSummary?.hasCycle && (
              <Badge variant="destructive" className="text-xs">检测到循环依赖</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            当前模块：{selectedModule.artifactId}
          </p>
          <div className="space-y-1">
            <span className="text-xs font-medium">依赖模块</span>
            {renderModuleTags(selectedSummary?.dependencies ?? [], "blue")}
          </div>
          <div className="space-y-1">
            <span className="text-xs font-medium">被依赖模块</span>
            {renderModuleTags(selectedSummary?.dependents ?? [], "gold")}
          </div>
          <div className="p-2 rounded-md bg-blue-500/10 text-xs text-blue-600">
            实用打包逻辑：当前模块构建交给 Maven -am，发布范围看发布候选模块
          </div>
          <div className="space-y-1">
            <span className="text-xs font-medium">发布候选模块</span>
            {renderModuleTags(selectedSummary?.releaseCandidateModuleIds ?? [], "green")}
          </div>
          {(selectedSummary?.releaseCandidateModuleIds.length ?? 0) > 0 && (
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() =>
                setSelectedModules([
                  ...new Set([
                    selectedModule.id,
                    ...(selectedSummary?.releaseCandidateModuleIds ?? []),
                  ]),
                ])
              }
            >
              一键选中发布候选模块
            </Button>
          )}
          <div className="space-y-1">
            <span className="text-xs font-medium">验证建议模块</span>
            {renderModuleTags(selectedSummary?.suggestedValidationModuleIds ?? [], "gold")}
          </div>
          {(selectedSummary?.suggestedValidationModuleIds.length ?? 0) > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
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
          )}
          <div className="space-y-1">
            <span className="text-xs font-medium">聚合关联模块</span>
            {renderModuleTags(selectedSummary?.relatedAggregationModuleIds ?? [], "cyan")}
          </div>
        </div>
      )}
    </div>
  );
}