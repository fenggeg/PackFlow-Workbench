import type {JarEntryInfo} from '@/types/domain'

export interface JarTreeNode {
  /** 唯一键：目录以 / 结尾，文件为完整路径 */
  key: string
  /** 当前层级的显示名 */
  name: string
  isDirectory: boolean
  sizeBytes: number
  isText: boolean
  children: JarTreeNode[]
}

/** 目录在前、名称升序；目录体积按子项累加 */
const finalize = (nodes: JarTreeNode[]): JarTreeNode[] => {
  for (const node of nodes) {
    if (node.children.length > 0) {
      node.children = finalize(node.children)
      node.sizeBytes = node.children.reduce((sum, child) => sum + child.sizeBytes, 0)
    }
  }
  return [...nodes].sort((left, right) => {
    if (left.isDirectory !== right.isDirectory) return left.isDirectory ? -1 : 1
    return left.name.localeCompare(right.name)
  })
}

/**
 * 把扁平的归档条目构建成目录树。
 * zip/jar 的中央目录本身是扁平路径表，这里按 / 拆分出层级，
 * 让「浏览结构」和「搜索某个文件」两种用法都能成立。
 */
export const buildJarTree = (entries: JarEntryInfo[]): JarTreeNode[] => {
  const root: JarTreeNode = {
    key: '',
    name: '',
    isDirectory: true,
    sizeBytes: 0,
    isText: false,
    children: [],
  }
  const directories = new Map<string, JarTreeNode>([['', root]])

  for (const entry of entries) {
    // 目录条目本身由文件路径推导，跳过以避免出现空目录节点
    if (entry.isDirectory) continue
    const segments = entry.name.split('/').filter(Boolean)
    if (segments.length === 0) continue

    let parent = root
    let currentPath = ''
    for (let index = 0; index < segments.length - 1; index += 1) {
      currentPath = currentPath ? `${currentPath}/${segments[index]}` : segments[index]
      let node = directories.get(currentPath)
      if (!node) {
        node = {
          key: `${currentPath}/`,
          name: segments[index],
          isDirectory: true,
          sizeBytes: 0,
          isText: false,
          children: [],
        }
        directories.set(currentPath, node)
        parent.children.push(node)
      }
      parent = node
    }

    parent.children.push({
      key: entry.name,
      name: segments[segments.length - 1],
      isDirectory: false,
      sizeBytes: entry.sizeBytes,
      isText: entry.isText,
      children: [],
    })
  }

  return finalize(root.children)
}

/** 收集所有目录节点键：搜索结果需要把祖先目录展开才能看到命中项 */
export const collectDirectoryKeys = (
  nodes: JarTreeNode[],
  output: string[] = [],
): string[] => {
  for (const node of nodes) {
    if (!node.isDirectory) continue
    output.push(node.key)
    collectDirectoryKeys(node.children, output)
  }
  return output
}

export interface JarTreeRow {
  node: JarTreeNode
  depth: number
}

/**
 * 按展开状态展平可见行，并限制总行数。
 * 全展开在超大归档里会产生几万行，这里先在数据层截断，避免渲染卡死。
 */
export const flattenVisibleRows = (
  nodes: JarTreeNode[],
  isExpanded: (node: JarTreeNode) => boolean,
  limit: number,
  depth = 0,
  output: JarTreeRow[] = [],
): JarTreeRow[] => {
  for (const node of nodes) {
    if (output.length >= limit) return output
    output.push({node, depth})
    if (node.isDirectory && isExpanded(node)) {
      flattenVisibleRows(node.children, isExpanded, limit, depth + 1, output)
    }
  }
  return output
}
