import {CornerDownRight, RefreshCw} from 'lucide-react'
import {useMemo} from 'react'
import type {ModuleDependencyGraph} from '@/types/domain'

interface DependencyTreeProps {
  rootModuleId: string
  graph: ModuleDependencyGraph
  labelOf: (moduleId: string) => string
  onSelect: (moduleId: string) => void
  /** 展开深度上限：依赖链很深时只展示前几层，避免面板被撑爆 */
  maxDepth?: number
}

/** 单次渲染的节点上限，防止超大项目把侧栏拖慢 */
const NODE_LIMIT = 200

interface DepNode {
  key: string
  moduleId: string
  isCycle: boolean
  children: DepNode[]
}

/**
 * 纯函数构建依赖树：把可变状态收敛在函数内部，
 * 避免在 useMemo 回调里对外部变量赋值（会触发 react-compiler 告警）。
 */
const buildDependencyTree = (
  rootModuleId: string,
  dependencyMap: Map<string, string[]>,
  maxDepth: number,
): {tree: DepNode; truncated: boolean} => {
  let count = 0
  let truncated = false

  const walk = (moduleId: string, depth: number, path: string[]): DepNode => {
    count += 1
    const isCycle = path.includes(moduleId)
    const children: DepNode[] = []
    const nextPath = [...path, moduleId]

    if (!isCycle && depth < maxDepth) {
      for (const dependencyId of dependencyMap.get(moduleId) ?? []) {
        if (count >= NODE_LIMIT) {
          truncated = true
          break
        }
        children.push(walk(dependencyId, depth + 1, nextPath))
      }
    }

    return {
      key: nextPath.join('>'),
      moduleId,
      isCycle,
      children,
    }
  }

  return {tree: walk(rootModuleId, 0, []), truncated}
}

const DepNodeItem = ({
  node,
  labelOf,
  onSelect,
}: {
  node: DepNode
  labelOf: (moduleId: string) => string
  onSelect: (moduleId: string) => void
}) => (
  <li className="min-w-0">
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        className="min-w-0 truncate rounded-[var(--radius)] px-1.5 py-0.5 text-left text-[12px] transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
        title={node.moduleId}
        onClick={() => onSelect(node.moduleId)}
      >
        {labelOf(node.moduleId)}
      </button>
      {node.isCycle ? (
        <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-[var(--error)]">
          <RefreshCw className="size-2.5" />
          循环
        </span>
      ) : null}
    </div>
    {node.children.length > 0 ? (
      <ul className="m-0 mt-0.5 flex list-none flex-col gap-0.5 border-l border-[var(--border)] pl-2.5">
        {node.children.map((child) => (
          <DepNodeItem key={child.key} node={child} labelOf={labelOf} onSelect={onSelect} />
        ))}
      </ul>
    ) : null}
  </li>
)

/**
 * 依赖结构树：把「当前模块依赖了谁、这些模块又依赖了谁」按层级展开，
 * 比一行行的模块标签更容易看清依赖链的走向。
 */
export function DependencyTree({
  rootModuleId,
  graph,
  labelOf,
  onSelect,
  maxDepth = 3,
}: DependencyTreeProps) {
  const dependencyMap = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const summary of graph.summaries) {
      map.set(summary.moduleId, summary.dependencies)
    }
    return map
  }, [graph])

  const {tree, truncated} = useMemo(
    () => buildDependencyTree(rootModuleId, dependencyMap, maxDepth),
    [dependencyMap, maxDepth, rootModuleId],
  )

  if (tree.children.length === 0) {
    return (
      <span className="text-[12px] text-[var(--muted-foreground)]">
        该模块没有依赖其它内部模块。
      </span>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        <DepNodeItem node={tree} labelOf={labelOf} onSelect={onSelect} />
      </ul>
      {truncated ? (
        <span className="flex items-center gap-1 text-[11px] text-[var(--muted-foreground)]">
          <CornerDownRight className="size-3" />
          依赖链过长，仅展示前 {NODE_LIMIT} 个节点。
        </span>
      ) : null}
    </div>
  )
}
