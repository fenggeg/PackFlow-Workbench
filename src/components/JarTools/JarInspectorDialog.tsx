import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Copy,
  FileArchive,
  FileText,
  Folder,
  FolderOpen,
  Loader2,
  Pencil,
} from 'lucide-react'
import {useEffect, useMemo, useState} from 'react'
import {AnimatePresence, motion} from 'motion/react'
import {Button} from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {MonoText} from '@/components/ui/mono-text'
import {StatusPill} from '@/components/ui/status-pill'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs'
import {api} from '@/services/tauri-api'
import {describeError, notifyError, notifyInfo, notifySuccess} from '@/store/useFeedbackStore'
import type {BuildArtifact, JarEntryContent, JarEntryInfo, JarInspection} from '@/types/domain'
import {formatBytes} from '@/utils/buildStats'
import {
  buildJarTree,
  collectDirectoryKeys,
  flattenVisibleRows,
  type JarTreeNode,
} from '@/utils/jarTree'

/** 一次渲染的可见行上限：全展开在超大归档里会有几万行 */
const RENDER_LIMIT = 300

/**
 * JAR 内容查看：
 * - 目录树：按层级浏览归档结构，目录可展开/折叠
 * - 条目内容：文本类文件（properties / xml / yml / json 等）可直接查看并复制
 * - MANIFEST：直接查看清单
 */
export function JarInspectorDialog({
  artifact,
  open,
  onOpenChange,
}: {
  artifact: BuildArtifact | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  // 状态随 artifact 变化由父级 key 重置，effect 内只做异步加载
  const [inspection, setInspection] = useState<JarInspection>()
  const [error, setError] = useState<string>()
  const [keyword, setKeyword] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selectedEntry, setSelectedEntry] = useState<JarEntryInfo>()
  const [entryContent, setEntryContent] = useState<JarEntryContent>()
  const [entryError, setEntryError] = useState<string>()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    if (!open || !artifact) return
    let cancelled = false
    api
      .inspectJar(artifact.path)
      .then((result) => {
        if (!cancelled) setInspection(result)
      })
      .catch((err) => {
        if (!cancelled) setError(describeError(err))
      })
    return () => {
      cancelled = true
    }
  }, [artifact, open])

  const filteredEntries = useMemo(() => {
    const list = (inspection?.entries ?? []).filter((entry) => !entry.isDirectory)
    const normalized = keyword.trim().toLowerCase()
    if (!normalized) return list
    return list.filter((entry) => entry.name.toLowerCase().includes(normalized))
  }, [inspection, keyword])

  const tree = useMemo(() => buildJarTree(filteredEntries), [filteredEntries])
  const searching = keyword.trim().length > 0

  // 搜索时直接展开全部命中路径，否则用户还得逐层点开才能看到结果
  const expandedKeys = useMemo(
    () => (searching ? new Set(collectDirectoryKeys(tree)) : expanded),
    [expanded, searching, tree],
  )

  const rows = useMemo(
    () => flattenVisibleRows(tree, (node) => expandedKeys.has(node.key), RENDER_LIMIT),
    [expandedKeys, tree],
  )

  const toggleDirectory = (node: JarTreeNode) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(node.key)) {
        next.delete(node.key)
      } else {
        next.add(node.key)
      }
      return next
    })
  }

  const openEntry = (entry: JarTreeNode) => {
    if (entry.isDirectory) {
      toggleDirectory(entry)
      return
    }
    if (!entry.isText) {
      notifyInfo('无法预览该条目', '这是二进制文件（如 class），仅支持查看体积与路径。')
      return
    }
    if (!inspection) return
    setSelectedEntry({
      name: entry.key,
      sizeBytes: entry.sizeBytes,
      compressedBytes: entry.sizeBytes,
      isDirectory: false,
      isText: entry.isText,
    })
    setEntryContent(undefined)
    setEntryError(undefined)
    api
      .readJarEntry(inspection.path, entry.key)
      .then(setEntryContent)
      .catch((err) => setEntryError(describeError(err)))
  }

  const copyEntryContent = async () => {
    if (!entryContent?.content) return
    try {
      await navigator.clipboard?.writeText(entryContent.content)
      notifySuccess('已复制条目内容')
    } catch (err) {
      notifyInfo('复制失败', describeError(err))
    }
  }

  const startEdit = () => {
    if (!entryContent) return
    setDraft(entryContent.content)
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
    setDraft('')
  }

  const saveEntry = async () => {
    if (!inspection || !selectedEntry || !entryContent) return
    setSaving(true)
    try {
      const result = await api.updateJarEntry(inspection.path, selectedEntry.name, draft)
      setEntryContent({
        ...entryContent,
        content: draft,
        sizeBytes: new TextEncoder().encode(draft).length,
        truncated: false,
      })
      setEditing(false)
      setConfirmOpen(false)
      notifySuccess('已修改归档内容', `原文件已备份到 ${result.backupPath}`)
      if (result.removedSignatures.length > 0) {
        notifyInfo(
          '已移除失效签名',
          `${result.removedSignatures.join('、')} 已移除，否则修改后 Java 会拒绝加载。`,
        )
      }
    } catch (error) {
      notifyError('修改失败', describeError(error))
    } finally {
      setSaving(false)
    }
  }

  /** 保存期间禁止关闭：重写到一半被中断会让归档处于不确定状态 */
  const handleDialogOpenChange = (next: boolean) => {
    if (saving) return
    onOpenChange(next)
  }

  const compressionRatio = inspection && inspection.fileSizeBytes > 0
    ? Math.round(
        (inspection.entries.reduce((sum, entry) => sum + entry.sizeBytes, 0)
          / inspection.fileSizeBytes) * 100,
      )
    : undefined

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="flex h-[82vh] max-w-[80vw] flex-col p-0">
        <DialogHeader className="border-b border-[var(--border)] px-5 py-3">
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <FileArchive className="size-4 shrink-0" />
            <span className="min-w-0 truncate">
              {selectedEntry ? selectedEntry.name : (artifact?.fileName ?? '归档内容')}
            </span>
            {inspection ? (
              <>
                <StatusPill>{inspection.fileCount} 个文件</StatusPill>
                <StatusPill tone="info">{formatBytes(inspection.fileSizeBytes)}</StatusPill>
                {compressionRatio !== undefined ? (
                  <StatusPill tone="success">解压后约 {compressionRatio}%</StatusPill>
                ) : null}
              </>
            ) : null}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 px-5 py-3">
          {error ? (
            <div className="rounded-[var(--radius)] border border-[var(--error)]/30 bg-[var(--error)]/5 px-3 py-2 text-[13px] text-[var(--error)]">
              {error}
            </div>
          ) : !inspection ? (
            <div className="flex h-full items-center justify-center text-[13px] text-[var(--muted-foreground)]">
              正在读取归档内容…
            </div>
          ) : selectedEntry ? (
            <div className="flex h-full min-h-0 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-7 gap-1.5"
                  onClick={() => {
                    setSelectedEntry(undefined)
                    setEntryContent(undefined)
                    setEntryError(undefined)
                  }}
                >
                  <ArrowLeft className="size-3.5" />
                  返回目录树
                </Button>
                <StatusPill>{formatBytes(selectedEntry.sizeBytes)}</StatusPill>
                {entryContent?.truncated ? (
                  <StatusPill tone="warning">内容较大，仅显示前 1 MB</StatusPill>
                ) : null}
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-7 gap-1.5"
                  disabled={!entryContent?.content || editing}
                  onClick={() => void copyEntryContent()}
                >
                  <Copy className="size-3.5" />
                  复制内容
                </Button>
                {!editing ? (
                  <Button
                    variant="primary"
                    size="sm"
                    className="h-7 gap-1.5"
                    disabled={!entryContent?.content || saving}
                    onClick={startEdit}
                  >
                    <Pencil className="size-3.5" />
                    编辑
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="primary"
                      size="sm"
                      className="h-7 gap-1.5"
                      disabled={saving || draft === entryContent?.content}
                      onClick={() => setConfirmOpen(true)}
                    >
                      {saving ? '保存中…' : '保存修改'}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-7"
                      disabled={saving}
                      onClick={cancelEdit}
                    >
                      取消
                    </Button>
                  </>
                )}
              </div>
              <AnimatePresence initial={false}>
                {saving ? (
                  <motion.div
                    key="saving"
                    className="flex flex-col gap-1.5 overflow-hidden"
                    initial={{opacity: 0, height: 0}}
                    animate={{opacity: 1, height: 'auto'}}
                    exit={{opacity: 0, height: 0}}
                    transition={{duration: 0.18, ease: [0.2, 0, 0, 1]}}
                  >
                    <span className="flex items-center gap-1.5 text-[12px] text-[var(--muted-foreground)]">
                      <Loader2 className="size-3.5 animate-spin" />
                      正在重写归档文件，请勿关闭窗口…
                    </span>
                    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-[var(--muted)]">
                      <span className="progress-stripes block h-full w-full rounded-full bg-[var(--primary)]" />
                    </span>
                  </motion.div>
                ) : null}
              </AnimatePresence>
              {editing ? (
                <span className="text-[12px] text-[var(--warning)]">
                  修改会直接写入磁盘上的归档文件（保存前会先自动备份），修改后产物与源码不再一致，重新构建即会覆盖。
                </span>
              ) : null}
              {entryError ? (
                <div className="rounded-[var(--radius)] border border-[var(--error)]/30 bg-[var(--error)]/5 px-3 py-2 text-[13px] text-[var(--error)]">
                  {entryError}
                </div>
              ) : !entryContent ? (
                <div className="flex flex-1 items-center justify-center text-[13px] text-[var(--muted-foreground)]">
                  正在读取条目内容…
                </div>
              ) : editing ? (
                <textarea
                  className="m-0 min-h-0 flex-1 resize-none rounded-[var(--radius-md)] border border-[var(--input)] bg-[var(--card)] p-3 font-[family-name:var(--font-mono)] text-[12px] leading-5 text-[var(--foreground)] focus-visible:border-[var(--ring)] focus-visible:outline-none"
                  value={draft}
                  spellCheck={false}
                  onChange={(event) => setDraft(event.target.value)}
                />
              ) : (
                <pre className="m-0 min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-all rounded-[var(--radius-md)] border border-[var(--console-border)] bg-[var(--console-bg)] p-3 font-[family-name:var(--font-mono)] text-[12px] text-[var(--console-text)]">
                  {entryContent.content}
                </pre>
              )}
            </div>
          ) : (
            <Tabs defaultValue="entries" className="flex h-full min-h-0 flex-col">
              <TabsList className="h-9 shrink-0 justify-start gap-0.5 rounded-none border-b border-[var(--border)] bg-transparent p-0">
                <TabsTrigger
                  value="entries"
                  className="h-9 rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-[var(--primary)] data-[state=active]:bg-transparent"
                >
                  目录树
                </TabsTrigger>
                <TabsTrigger
                  value="manifest"
                  className="h-9 rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-[var(--primary)] data-[state=active]:bg-transparent"
                >
                  MANIFEST
                </TabsTrigger>
              </TabsList>

              <TabsContent value="entries" className="mt-0 flex min-h-0 flex-1 flex-col gap-2 pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    className="min-w-56 flex-1"
                    placeholder="按路径搜索条目"
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8"
                    disabled={searching}
                    onClick={() => setExpanded(new Set(collectDirectoryKeys(tree)))}
                  >
                    展开全部
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8"
                    disabled={searching || expanded.size === 0}
                    onClick={() => setExpanded(new Set())}
                  >
                    收起全部
                  </Button>
                </div>
                {inspection.truncated ? (
                  <span className="text-[12px] text-[var(--warning)]">
                    条目过多，仅读取了前 5000 条。
                  </span>
                ) : null}
                {rows.length === 0 ? (
                  <div className="flex min-h-24 items-center justify-center text-[13px] text-[var(--muted-foreground)]">
                    没有匹配的条目
                  </div>
                ) : (
                  <>
                    <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] p-0">
                      {rows.map(({node, depth}) => {
                        const isOpen = node.isDirectory && expandedKeys.has(node.key)
                        return (
                          <li key={node.key} className="border-b border-[var(--border)] last:border-b-0">
                            <button
                              type="button"
                              className="flex w-full items-center gap-1.5 py-1.5 pr-3 text-left transition-colors hover:bg-[var(--accent)]"
                              style={{paddingLeft: `${depth * 14 + 8}px`}}
                              title={
                                node.isDirectory
                                  ? node.key
                                  : node.isText
                                    ? `${node.name}（点击查看内容）`
                                    : `${node.name}（二进制文件，无法预览）`
                              }
                              onClick={() => openEntry(node)}
                            >
                              {node.isDirectory ? (
                                <>
                                  {isOpen ? (
                                    <ChevronDown className="size-3.5 shrink-0 text-[var(--muted-foreground)]" />
                                  ) : (
                                    <ChevronRight className="size-3.5 shrink-0 text-[var(--muted-foreground)]" />
                                  )}
                                  {isOpen ? (
                                    <FolderOpen className="size-3.5 shrink-0 text-[var(--warning)]" />
                                  ) : (
                                    <Folder className="size-3.5 shrink-0 text-[var(--warning)]" />
                                  )}
                                </>
                              ) : (
                                <>
                                  <span className="size-3.5 shrink-0" />
                                  <FileText
                                    className={
                                      node.isText
                                        ? 'size-3.5 shrink-0 text-[var(--muted-foreground)]'
                                        : 'size-3.5 shrink-0 text-[var(--muted-foreground)]/50'
                                    }
                                  />
                                </>
                              )}
                              <MonoText
                                className={
                                  node.isDirectory
                                    ? 'min-w-0 flex-1 truncate text-[12px] font-medium'
                                    : 'min-w-0 flex-1 truncate text-[12px]'
                                }
                              >
                                {node.name}
                              </MonoText>
                              <span className="shrink-0 text-[11px] text-[var(--muted-foreground)]">
                                {formatBytes(node.sizeBytes)}
                              </span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                    {rows.length >= RENDER_LIMIT ? (
                      <span className="text-[12px] text-[var(--muted-foreground)]">
                        已展示 {rows.length} 行，请继续展开或使用搜索缩小范围。
                      </span>
                    ) : searching ? (
                      <span className="text-[12px] text-[var(--muted-foreground)]">
                        匹配 {filteredEntries.length} 个文件。
                      </span>
                    ) : null}
                  </>
                )}
              </TabsContent>

              <TabsContent value="manifest" className="mt-0 min-h-0 flex-1 overflow-y-auto pt-3">
                {inspection.manifest ? (
                  <pre className="m-0 whitespace-pre-wrap rounded-[var(--radius-md)] border border-[var(--console-border)] bg-[var(--console-bg)] p-3 font-[family-name:var(--font-mono)] text-[12px] text-[var(--console-text)]">
                    {inspection.manifest}
                  </pre>
                ) : (
                  <div className="flex min-h-24 items-center justify-center text-[13px] text-[var(--muted-foreground)]">
                    归档中没有 META-INF/MANIFEST.MF
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </DialogContent>
      </Dialog>

      <Dialog
        open={confirmOpen}
        onOpenChange={(next) => {
          if (saving) return
          setConfirmOpen(next)
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>确认修改归档内容？</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 px-5 py-2 text-[13px] text-[var(--muted-foreground)]">
            <span className="break-all font-[family-name:var(--font-mono)] text-[12px] text-[var(--foreground)]">
              {selectedEntry?.name}
            </span>
            <span>将直接写入磁盘上的归档文件，保存前会自动备份到同目录（文件名加 .bak-时间戳）。</span>
            <span>
              归档格式不支持原地替换条目，保存时需要重建整个文件（其余条目按原始压缩数据搬运），
              体积越大耗时越长。
            </span>
            <span>
              若该归档带数字签名，签名文件会被一并移除 —— 内容已变更，保留签名会让 Java
              直接拒绝加载。
            </span>
            <span className="text-[var(--warning)]">
              修改后的产物与源码不再一致，重新构建即会覆盖本次改动。
            </span>
          </div>
          <DialogFooter>
            <Button variant="secondary" disabled={saving} onClick={() => setConfirmOpen(false)}>
              取消
            </Button>
            <Button variant="primary" disabled={saving} onClick={() => void saveEntry()}>
              {saving ? '保存中…' : '确认修改'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
