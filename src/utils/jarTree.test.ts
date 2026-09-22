import {describe, expect, it} from 'vitest'
import {buildJarTree, collectDirectoryKeys, flattenVisibleRows} from './jarTree'
import type {JarEntryInfo} from '@/types/domain'

const fileOf = (name: string, sizeBytes: number, isText = false): JarEntryInfo => ({
  name,
  sizeBytes,
  compressedBytes: sizeBytes,
  isDirectory: false,
  isText,
})

const dirOf = (name: string): JarEntryInfo => ({
  name,
  sizeBytes: 0,
  compressedBytes: 0,
  isDirectory: true,
  isText: false,
})

describe('归档目录树构建', () => {
  it('按路径层级建树，并跳过目录条目本身', () => {
    const tree = buildJarTree([
      dirOf('com/'),
      fileOf('META-INF/MANIFEST.MF', 100, true),
      fileOf('com/example/App.class', 2048),
      fileOf('com/example/App.java', 512, true),
    ])

    // 根级：com/ 目录在前，META-INF/ 次之（名称升序）
    expect(tree.map((node) => node.name)).toEqual(['com', 'META-INF'])
    const com = tree[0]
    expect(com.isDirectory).toBe(true)
    expect(com.children.map((node) => node.name)).toEqual(['example'])
    expect(com.children[0].children.map((node) => node.name)).toEqual(['App.class', 'App.java'])
  })

  it('目录体积按子项累加，文件保留自身体积', () => {
    const tree = buildJarTree([
      fileOf('a/b/one.txt', 100, true),
      fileOf('a/b/two.txt', 200, true),
      fileOf('a/three.txt', 50, true),
    ])

    const a = tree[0]
    expect(a.sizeBytes).toBe(350)
    expect(a.children.find((node) => node.name === 'b')?.sizeBytes).toBe(300)
    expect(a.children.find((node) => node.name === 'three.txt')?.sizeBytes).toBe(50)
  })

  it('同层目录排在文件之前', () => {
    const tree = buildJarTree([fileOf('aaa.txt', 1, true), fileOf('zzz/x.txt', 1, true)])
    expect(tree.map((node) => node.isDirectory)).toEqual([true, false])
  })

  it('空输入返回空树', () => {
    expect(buildJarTree([])).toEqual([])
  })
})

describe('目录键收集', () => {
  it('收集所有层级的目录键，不含文件', () => {
    const tree = buildJarTree([
      fileOf('a/b/one.txt', 1, true),
      fileOf('c/two.txt', 1, true),
    ])
    const keys = collectDirectoryKeys(tree).sort()

    expect(keys).toEqual(['a/', 'a/b/', 'c/'])
  })
})

describe('可见行展平', () => {
  const tree = buildJarTree([
    fileOf('a/b/one.txt', 1, true),
    fileOf('c/two.txt', 1, true),
  ])

  it('折叠时不展示子节点', () => {
    const rows = flattenVisibleRows(tree, () => false, 100)
    expect(rows.map((row) => row.node.name)).toEqual(['a', 'c'])
    expect(rows.every((row) => row.depth === 0)).toBe(true)
  })

  it('展开父目录后展示子节点并带上深度', () => {
    const rows = flattenVisibleRows(tree, (node) => node.key === 'a/', 100)
    expect(rows.map((row) => `${row.node.name}@${row.depth}`)).toEqual(['a@0', 'b@1', 'c@0'])
  })

  it('达到行数上限后停止展平', () => {
    const rows = flattenVisibleRows(tree, () => true, 2)
    expect(rows).toHaveLength(2)
  })
})
