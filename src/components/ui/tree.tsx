import {ChevronDown, ChevronRight} from 'lucide-react'
import {useMemo, useState} from 'react'
import {cn} from '@/lib/utils'
import {Checkbox} from '@/components/ui/checkbox'

export interface TreeNodeData {
  key: string
  title: string
  children?: TreeNodeData[]
  /** optional right-aligned secondary label (e.g. version) */
  meta?: string
}

interface TreeProps {
  nodes: TreeNodeData[]
  checkedKeys: Set<string>
  onCheckedChange: (keys: Set<string>) => void
  selectedKey?: string
  onSelect?: (key: string) => void
  className?: string
  search?: string
}

function collectKeys(nodes: TreeNodeData[]): string[] {
  const out: string[] = []
  const walk = (list: TreeNodeData[]) => {
    for (const n of list) {
      out.push(n.key)
      if (n.children?.length) walk(n.children)
    }
  }
  walk(nodes)
  return out
}

function TreeRow({
  node,
  depth,
  expanded,
  onToggle,
  checked,
  onToggleCheck,
  selected,
  onSelect,
  hasChildren,
}: {
  node: TreeNodeData
  depth: number
  expanded: boolean
  onToggle: () => void
  checked: boolean | 'indeterminate'
  onToggleCheck: () => void
  selected: boolean
  onSelect: () => void
  hasChildren: boolean
}) {
  return (
    <div
      className={cn(
        'group flex min-h-8 cursor-pointer select-none items-center gap-1 rounded-[var(--radius)] py-1 pr-2 transition-colors duration-150',
        selected ? 'bg-[var(--accent)]' : 'hover:bg-[var(--accent)]/60',
      )}
      style={{paddingLeft: depth * 16 + 4}}
      tabIndex={selected ? 0 : -1}
      onClick={() => {
        // 点击整行即切换是否加入构建，同时更新依赖洞察焦点
        onToggleCheck()
        onSelect()
      }}
      onKeyDown={(event) => {
        // 行内键盘操作：Enter 切换勾选，左右方向键展开/收起
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onToggleCheck()
          return
        }
        if (hasChildren && event.key === 'ArrowRight' && !expanded) {
          event.preventDefault()
          onToggle()
          return
        }
        if (hasChildren && event.key === 'ArrowLeft' && expanded) {
          event.preventDefault()
          onToggle()
        }
      }}
      role="treeitem"
      aria-selected={selected}
      aria-expanded={hasChildren ? expanded : undefined}
    >
      {hasChildren ? (
        <button
          type="button"
          className="flex size-5 shrink-0 items-center justify-center rounded-[var(--radius)] text-[var(--muted-foreground)] hover:bg-[var(--border)]"
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
          aria-label={expanded ? '收起' : '展开'}
        >
          {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>
      ) : (
        <span className="size-5 shrink-0" aria-hidden />
      )}
      <Checkbox
        checked={checked}
        onCheckedChange={() => onToggleCheck()}
        onClick={(e) => e.stopPropagation()}
        className="size-3.5"
      />
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <span
          className="truncate text-[14px] font-semibold leading-5 text-[var(--foreground)]"
          title={node.title}
        >
          {node.title}
        </span>
        {node.meta ? (
          <span
            className="truncate font-[family-name:var(--font-mono)] text-[11px] leading-4 text-[var(--muted-foreground)]"
            title={node.meta}
          >
            {node.meta}
          </span>
        ) : null}
      </div>
    </div>
  )
}

export function Tree({
  nodes,
  checkedKeys,
  onCheckedChange,
  selectedKey,
  onSelect,
  className,
  search,
}: TreeProps) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set())

  const filtered = useMemo(() => {
    if (!search?.trim()) return nodes
    const q = search.trim().toLowerCase()
    const filterNode = (n: TreeNodeData): TreeNodeData | null => {
      const titleHit = n.title.toLowerCase().includes(q)
      const filteredChildren = n.children?.map(filterNode).filter(Boolean) as TreeNodeData[] | undefined
      if (titleHit || filteredChildren?.length) {
        return {...n, children: filteredChildren?.length ? filteredChildren : n.children}
      }
      return null
    }
    return nodes.map(filterNode).filter(Boolean) as TreeNodeData[]
  }, [nodes, search])

  const searching = Boolean(search?.trim())
  const searchExpanded = useMemo(
    () => (searching ? new Set(collectKeys(filtered)) : null),
    [searching, filtered],
  )
  const activeExpanded = searching ? searchExpanded! : expandedKeys

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // 子节点 key -> 父节点，供取消勾选时向上清理「空壳」祖先
  const parentMap = useMemo(() => {
    const map = new Map<string, TreeNodeData>()
    const walk = (list: TreeNodeData[]) => {
      for (const n of list) {
        for (const child of n.children ?? []) {
          map.set(child.key, n)
          walk([child])
        }
      }
    }
    walk(nodes)
    return map
  }, [nodes])

  const toggleCheck = (node: TreeNodeData) => {
    // 勾选父模块会带上它的整棵子树；子模块勾选时只在「所有子孙都已勾选」的情况下才反向勾选祖先，
    // 避免只选一个子模块就连带把父聚合模块也纳入 -pl，导致构建范围与历史记录被放大。
    const all = collectKeys([node])
    const allChecked = all.every((k) => checkedKeys.has(k))
    const next = new Set(checkedKeys)
    if (allChecked) {
      for (const k of all) next.delete(k)
      // 取消子模块后，若其祖先的子孙并非全部勾选，则祖先应一并取消（半选态由 isIndeterminate 派生），
      // 避免父模块残留勾选却没有任何子模块被选中的「空壳」状态。
      pruneAncestorsOnUncheck(node, next)
    } else {
      for (const k of all) next.add(k)
      // 子模块全部勾选后，父模块自动进入勾选态，保持父子选择一致。
      promoteAncestorsOnCheck(node, next)
    }
    onCheckedChange(next)
  }

  // 取消勾选后向上回溯：只要某祖先的子孙并非全部勾选，就把它从勾选态移除。
  const pruneAncestorsOnUncheck = (node: TreeNodeData, keys: Set<string>) => {
    const parent = parentMap.get(node.key)
    if (!parent) return
    const descendants = collectKeys(parent.children ?? [])
    if (descendants.length > 0 && !descendants.every((k) => keys.has(k))) {
      keys.delete(parent.key)
      pruneAncestorsOnUncheck(parent, keys)
    }
  }

  // 勾选后向上回溯：只要某祖先的所有子孙都已勾选，就把它一并勾选。
  const promoteAncestorsOnCheck = (node: TreeNodeData, keys: Set<string>) => {
    const parent = parentMap.get(node.key)
    if (!parent) return
    const descendants = collectKeys(parent.children ?? [])
    if (descendants.length > 0 && descendants.every((k) => keys.has(k))) {
      keys.add(parent.key)
      promoteAncestorsOnCheck(parent, keys)
    }
  }

  const isIndeterminate = (node: TreeNodeData) => {
    const descendants = collectKeys(node.children ?? [])
    if (!descendants.length) return false
    const checkedCount = descendants.filter((k) => checkedKeys.has(k)).length
    return checkedCount > 0 && checkedCount < descendants.length
  }

  const renderNodes = (list: TreeNodeData[], depth: number): React.ReactNode =>
    list.map((node) => {
      const hasChildren = Boolean(node.children?.length)
      const expanded = activeExpanded.has(node.key)
      return (
        <div key={node.key} role="group">
          <TreeRow
            node={node}
            depth={depth}
            expanded={expanded}
            onToggle={() => toggleExpand(node.key)}
            checked={isIndeterminate(node) ? 'indeterminate' : checkedKeys.has(node.key)}
            onToggleCheck={() => toggleCheck(node)}
            selected={selectedKey === node.key}
            onSelect={() => onSelect?.(node.key)}
            hasChildren={hasChildren}
          />
          {hasChildren && expanded ? renderNodes(node.children!, depth + 1) : null}
        </div>
      )
    })

  return (
    <div role="tree" className={cn('flex flex-col gap-0.5', className)}>
      {renderNodes(filtered, 0)}
    </div>
  )
}
