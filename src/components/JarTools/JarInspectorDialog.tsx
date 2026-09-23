import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Copy,
  FileArchive,
  FileText,
  Folder,
  FolderOpen,
  History,
  Loader2,
  MapPin,
  Pencil,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react'
import {useCallback, useEffect, useMemo, useState, type ReactNode} from 'react'
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
import type {
  BuildArtifact,
  JarBackupInfo,
  JarEntryContent,
  JarInspection,
} from '@/types/domain'
import {formatBytes} from '@/utils/buildStats'
import {
  buildJarTree,
  collectDirectoryKeys,
  flattenVisibleRows,
  type JarTreeNode,
} from '@/utils/jarTree'

/** 一次渲染的可见行上限：全展开在超大归档里会有几万行 */
const RENDER_LIMIT = 300

/** 已打开的文本条目：content 是归档中的已保存内容，draft 是编辑缓冲 */
interface EntryTab {
  name: string
  sizeBytes: number
  loading: boolean
  error?: string
  content?: string
  draft: string
  editing: boolean
  truncated: boolean
}

interface ConfirmRequest {
  title: string
  lines: ReactNode[]
  confirmText: string
  danger?: boolean
  /** 批量保存走主对话框的 saving 状态，不叠加确认框自身的 busy */
  isSave?: boolean
  /** 返回非空字符串作为成功提示 */
  run: () => Promise<string | void>
}

type MainTab = 'entries' | 'manifest' | 'backups'

/**
 * JAR 内容查看与编辑：
 * - 目录树：按层级浏览归档结构，目录可展开/折叠
 * - 条目内容：文本类文件可同时打开多个标签页编辑，全部改动一次性批量写回
 * - MANIFEST：直接查看清单
 * - 备份：管理历次修改自动生成的 .bak-时间戳 备份，支持恢复与删除
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
  const [reloadNonce, setReloadNonce] = useState(0)
  const [error, setError] = useState<string>()
  const [keyword, setKeyword] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [mainTab, setMainTab] = useState<MainTab>('entries')

  const [tabs, setTabs] = useState<EntryTab[]>([])
  const [activeName, setActiveName] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest>()
  const [confirmBusy, setConfirmBusy] = useState(false)

  const [backups, setBackups] = useState<JarBackupInfo[]>([])
  const [backupsLoading, setBackupsLoading] = useState(false)
  const [backupsError, setBackupsError] = useState<string>()

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
  }, [artifact, open, reloadNonce])

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

  const patchTab = (name: string, patch: Partial<EntryTab>) => {
    setTabs((current) =>
      current.map((tab) => (tab.name === name ? {...tab, ...patch} : tab)),
    )
  }

  const loadEntry = (name: string, sizeBytes: number) => {
    if (!inspection) return
    setTabs((current) => {
      if (current.some((tab) => tab.name === name)) return current
      return [
        ...current,
        {name, sizeBytes, loading: true, draft: '', editing: false, truncated: false},
      ]
    })
    setActiveName(name)
    api
      .readJarEntry(inspection.path, name)
      .then((result: JarEntryContent) => {
        patchTab(name, {
          loading: false,
          content: result.content,
          draft: result.content,
          sizeBytes: result.sizeBytes,
          truncated: result.truncated,
        })
      })
      .catch((err) => patchTab(name, {loading: false, error: describeError(err)}))
  }

  const openEntry = (node: JarTreeNode) => {
    if (node.isDirectory) {
      toggleDirectory(node)
      return
    }
    if (!node.isText) {
      notifyInfo('无法预览该条目', '这是二进制文件（如 class），仅支持查看体积与路径。')
      return
    }
    if (!inspection) return
    if (tabs.some((tab) => tab.name === node.key)) {
      setActiveName(node.key)
      return
    }
    loadEntry(node.key, node.sizeBytes)
  }

  const activeTab = tabs.find((tab) => tab.name === activeName)
  const dirtyTabs = useMemo(
    () => tabs.filter((tab) => tab.editing && tab.content !== undefined && tab.draft !== tab.content),
    [tabs],
  )
  const isDirty = (tab: EntryTab) =>
    tab.editing && tab.content !== undefined && tab.draft !== tab.content

  const copyEntryContent = async () => {
    const text = activeTab?.editing ? activeTab.draft : activeTab?.content
    if (!text) return
    try {
      await navigator.clipboard?.writeText(text)
      notifySuccess('已复制条目内容')
    } catch (err) {
      notifyInfo('复制失败', describeError(err))
    }
  }

  const startEdit = () => {
    if (!activeTab?.content && activeTab?.content !== '') return
    patchTab(activeTab.name, {editing: true})
  }

  const cancelEdit = () => {
    if (!activeTab) return
    patchTab(activeTab.name, {editing: false, draft: activeTab.content ?? ''})
  }

  const applySaveResult = () => {
    setTabs((current) =>
      current.map((tab) =>
        isDirty(tab)
          ? {
              ...tab,
              editing: false,
              content: tab.draft,
              sizeBytes: new TextEncoder().encode(tab.draft).length,
              truncated: false,
            }
          : tab,
      ),
    )
  }

  const saveAll = async () => {
    if (!inspection || dirtyTabs.length === 0) return
    setSaving(true)
    try {
      const result = await api.updateJarEntries(
        inspection.path,
        dirtyTabs.map((tab) => ({name: tab.name, content: tab.draft})),
      )
      applySaveResult()
      setConfirmRequest(undefined)
      notifySuccess(
        `已修改 ${result.updatedNames.length} 个条目`,
        `原文件已备份到 ${result.backupPath}`,
      )
      if (result.removedSignatures.length > 0) {
        notifyInfo(
          '已移除失效签名',
          `${result.removedSignatures.join('、')} 已移除，否则修改后 Java 会拒绝加载。`,
        )
      }
    } catch (err) {
      notifyError('修改失败', describeError(err))
    } finally {
      setSaving(false)
    }
  }

  const removeTab = (name: string) => {
    setTabs((current) => {
      const next = current.filter((tab) => tab.name !== name)
      setActiveName((active) => {
        if (active !== name) return active
        return next[next.length - 1]?.name
      })
      return next
    })
  }

  const closeTab = (tab: EntryTab) => {
    if (isDirty(tab)) {
      setConfirmRequest({
        title: '放弃未保存的修改？',
        lines: [
          <span key="name" className="break-all font-[family-name:var(--font-mono)] text-[12px] text-[var(--foreground)]">
            {tab.name}
          </span>,
          <span key="hint">该条目有尚未保存的改动，关闭标签页后将丢失。</span>,
        ],
        confirmText: '放弃并关闭',
        danger: true,
        run: async () => {
          removeTab(tab.name)
        },
      })
      return
    }
    removeTab(tab.name)
  }

  /** 保存期间禁止关闭：重写到一半被中断会让归档处于不确定状态 */
  const handleDialogOpenChange = (next: boolean) => {
    if (saving || confirmBusy) return
    if (!next && dirtyTabs.length > 0) {
      setConfirmRequest({
        title: '关闭前放弃未保存的修改？',
        lines: [
          <span key="list">
            以下条目的改动尚未写入归档：{dirtyTabs.map((tab) => tab.name).join('、')}
          </span>,
        ],
        confirmText: '放弃并关闭',
        danger: true,
        run: async () => {
          onOpenChange(false)
        },
      })
      return
    }
    onOpenChange(next)
  }

  const loadBackups = useCallback(() => {
    if (!inspection) return
    setBackupsLoading(true)
    setBackupsError(undefined)
    api
      .listJarBackups(inspection.path)
      .then(setBackups)
      .catch((err) => setBackupsError(describeError(err)))
      .finally(() => setBackupsLoading(false))
  }, [inspection])

  const handleMainTabChange = (value: string) => {
    setMainTab(value as MainTab)
    if (value === 'backups') loadBackups()
  }

  const requestRestore = (backup: JarBackupInfo) => {
    if (!inspection) return
    setConfirmRequest({
      title: '用该备份恢复归档？',
      lines: [
        <span key="name" className="break-all font-[family-name:var(--font-mono)] text-[12px] text-[var(--foreground)]">
          {backup.fileName}
        </span>,
        <span key="warn">当前归档将被该备份覆盖（恢复前会先自动备份当前版本）。</span>,
        <span key="stale">已打开的条目标签会被清空，归档内容会重新读取。</span>,
      ],
      confirmText: '恢复',
      danger: true,
      run: async () => {
        const result = await api.restoreJarBackup(inspection.path, backup.path)
        setTabs([])
        setActiveName(undefined)
        setInspection(undefined)
        setError(undefined)
        setReloadNonce((nonce) => nonce + 1)
        loadBackups()
        return `已恢复为 ${backup.modifiedAt} 的备份，当前版本另存到 ${result.backupPath}`
      },
    })
  }

  const requestDelete = (backup: JarBackupInfo) => {
    if (!inspection) return
    setConfirmRequest({
      title: '删除该备份文件？',
      lines: [
        <span key="name" className="break-all font-[family-name:var(--font-mono)] text-[12px] text-[var(--foreground)]">
          {backup.fileName}
        </span>,
        <span key="warn">删除后无法通过它恢复归档，请确认归档当前内容无误。</span>,
      ],
      confirmText: '删除',
      danger: true,
      run: async () => {
        await api.deleteJarBackups(inspection.path, [backup.path])
        loadBackups()
        return '备份文件已删除'
      },
    })
  }

  const runConfirm = async () => {
    if (!confirmRequest) return
    if (confirmRequest.isSave) {
      await saveAll()
      return
    }
    setConfirmBusy(true)
    try {
      const message = await confirmRequest.run()
      if (message) notifySuccess(message)
      setConfirmRequest(undefined)
    } catch (err) {
      notifyError('操作失败', describeError(err))
    } finally {
      setConfirmBusy(false)
    }
  }

  const backupPrefix = artifact ? `${artifact.fileName}.bak-` : ''
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
              {activeTab ? activeTab.name : (artifact?.fileName ?? '归档内容')}
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
          ) : activeTab ? (
            <div className="flex h-full min-h-0 flex-col gap-2">
              <div className="flex min-w-0 items-center gap-1 overflow-x-auto border-b border-[var(--border)] pb-1">
                <Button
                  variant="ghost"
                  size="iconSm"
                  aria-label="返回目录树"
                  title="返回目录树"
                  onClick={() => setActiveName(undefined)}
                >
                  <ArrowLeft className="size-3.5" />
                </Button>
                {tabs.map((tab) => (
                  <button
                    key={tab.name}
                    type="button"
                    title={tab.name}
                    className={
                      tab.name === activeName
                        ? 'flex h-7 max-w-64 shrink-0 items-center gap-1 rounded-t-[var(--radius-md)] border border-b-0 border-[var(--border)] bg-[var(--card)] px-2 text-[12px] font-medium'
                        : 'flex h-7 max-w-64 shrink-0 items-center gap-1 rounded-t-[var(--radius-md)] border border-transparent px-2 text-[12px] text-[var(--muted-foreground)] hover:bg-[var(--accent)]'
                    }
                    onClick={() => setActiveName(tab.name)}
                  >
                    {isDirty(tab) ? (
                      <span className="size-1.5 shrink-0 rounded-full bg-[var(--warning)]" />
                    ) : null}
                    <span className="min-w-0 truncate font-[family-name:var(--font-mono)]">
                      {tab.name.split('/').pop()}
                    </span>
                    <span
                      role="button"
                      aria-label="关闭标签"
                      tabIndex={-1}
                      className="flex size-4 shrink-0 items-center justify-center rounded hover:bg-[var(--muted)]"
                      onClick={(event) => {
                        event.stopPropagation()
                        closeTab(tab)
                      }}
                    >
                      <X className="size-3" />
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill>{formatBytes(activeTab.sizeBytes)}</StatusPill>
                {activeTab.truncated ? (
                  <StatusPill tone="warning">内容较大，仅加载前 1 MB</StatusPill>
                ) : null}
                {dirtyTabs.length > 0 ? (
                  <StatusPill tone="warning">{dirtyTabs.length} 个条目待保存</StatusPill>
                ) : null}
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-7 gap-1.5"
                  disabled={!activeTab.content && activeTab.content !== ''}
                  onClick={() => void copyEntryContent()}
                >
                  <Copy className="size-3.5" />
                  复制内容
                </Button>
                {!activeTab.editing ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-7 gap-1.5"
                    disabled={!activeTab.content && activeTab.content !== ''}
                    onClick={startEdit}
                  >
                    <Pencil className="size-3.5" />
                    编辑
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-7"
                    disabled={saving}
                    onClick={cancelEdit}
                  >
                    取消编辑
                  </Button>
                )}
                <Button
                  variant="primary"
                  size="sm"
                  className="h-7 gap-1.5"
                  disabled={saving || dirtyTabs.length === 0}
                  onClick={() =>
                    setConfirmRequest({
                      title: `确认修改 ${dirtyTabs.length} 个归档条目？`,
                      lines: [
                        ...dirtyTabs.map((tab) => (
                          <span
                            key={tab.name}
                            className="break-all font-[family-name:var(--font-mono)] text-[12px] text-[var(--foreground)]"
                          >
                            {tab.name}
                          </span>
                        )),
                        <span key="backup">将直接写入磁盘上的归档文件，保存前会自动备份到同目录（文件名加 .bak-时间戳）。</span>,
                        <span key="rebuild">
                          归档格式不支持原地替换条目，全部改动在同一次重建中完成（其余条目按原始压缩数据搬运）。
                        </span>,
                        <span key="signature">
                          若该归档带数字签名，签名文件会被一并移除 —— 内容已变更，保留签名会让 Java 直接拒绝加载。
                        </span>,
                        <span key="drift" className="text-[var(--warning)]">
                          修改后的产物与源码不再一致，重新构建即会覆盖本次改动。
                        </span>,
                      ],
                      confirmText: '确认修改',
                      isSave: true,
                      run: saveAll,
                    })
                  }
                >
                  {saving ? '保存中…' : `保存全部修改${dirtyTabs.length > 0 ? ` (${dirtyTabs.length})` : ''}`}
                </Button>
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
              {activeTab.editing ? (
                <span className="text-[12px] text-[var(--warning)]">
                  修改会直接写入磁盘上的归档文件（保存前会先自动备份），修改后产物与源码不再一致，重新构建即会覆盖。
                </span>
              ) : null}
              {activeTab.error ? (
                <div className="rounded-[var(--radius)] border border-[var(--error)]/30 bg-[var(--error)]/5 px-3 py-2 text-[13px] text-[var(--error)]">
                  {activeTab.error}
                </div>
              ) : activeTab.loading ? (
                <div className="flex flex-1 items-center justify-center text-[13px] text-[var(--muted-foreground)]">
                  正在读取条目内容…
                </div>
              ) : activeTab.editing ? (
                <textarea
                  className="m-0 min-h-0 flex-1 resize-none rounded-[var(--radius-md)] border border-[var(--input)] bg-[var(--card)] p-3 font-[family-name:var(--font-mono)] text-[12px] leading-5 text-[var(--foreground)] focus-visible:border-[var(--ring)] focus-visible:outline-none"
                  value={activeTab.draft}
                  spellCheck={false}
                  onChange={(event) => patchTab(activeTab.name, {draft: event.target.value})}
                />
              ) : (
                <pre className="m-0 min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-all rounded-[var(--radius-md)] border border-[var(--console-border)] bg-[var(--console-bg)] p-3 font-[family-name:var(--font-mono)] text-[12px] text-[var(--console-text)]">
                  {activeTab.content}
                </pre>
              )}
            </div>
          ) : (
            <Tabs value={mainTab} onValueChange={handleMainTabChange} className="flex h-full min-h-0 flex-col">
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
                <TabsTrigger
                  value="backups"
                  className="h-9 rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-[var(--primary)] data-[state=active]:bg-transparent"
                >
                  备份{backups.length > 0 ? ` (${backups.length})` : ''}
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

              <TabsContent value="backups" className="mt-0 flex min-h-0 flex-1 flex-col gap-2 pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[12px] text-[var(--muted-foreground)]">
                    <History className="size-3.5" />
                    每次保存条目都会自动备份原文件到归档同目录（{artifact?.fileName ?? ''}.bak-时间戳）。
                  </span>
                  <Button variant="secondary" size="sm" className="h-7" onClick={loadBackups}>
                    刷新
                  </Button>
                </div>
                {backupsError ? (
                  <div className="rounded-[var(--radius)] border border-[var(--error)]/30 bg-[var(--error)]/5 px-3 py-2 text-[13px] text-[var(--error)]">
                    {backupsError}
                  </div>
                ) : backupsLoading ? (
                  <div className="flex min-h-24 items-center justify-center text-[13px] text-[var(--muted-foreground)]">
                    正在扫描备份文件…
                  </div>
                ) : backups.length === 0 ? (
                  <div className="flex min-h-24 items-center justify-center text-[13px] text-[var(--muted-foreground)]">
                    还没有备份文件，保存条目修改后会自动生成。
                  </div>
                ) : (
                  <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] p-0">
                    {backups.map((backup) => (
                      <li
                        key={backup.path}
                        className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2 last:border-b-0"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-medium" title={backup.fileName}>
                            {backup.fileName.slice(backupPrefix.length) || backup.fileName}
                          </div>
                          <div className="text-[12px] text-[var(--muted-foreground)]">
                            {backup.modifiedAt || '时间未知'} · {formatBytes(backup.sizeBytes)}
                          </div>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-7 gap-1.5"
                          onClick={() => requestRestore(backup)}
                        >
                          <RotateCcw className="size-3.5" />
                          恢复
                        </Button>
                        <Button
                          variant="ghost"
                          size="iconSm"
                          aria-label="定位备份文件"
                          title="定位备份文件"
                          onClick={() => {
                            void api.openPathInExplorer(backup.path).catch((err) => {
                              notifyError('打开目录失败', describeError(err))
                            })
                          }}
                        >
                          <MapPin />
                        </Button>
                        <Button
                          variant="ghost"
                          size="iconSm"
                          aria-label="删除备份"
                          title="删除备份"
                          className="text-[var(--error)]"
                          onClick={() => requestDelete(backup)}
                        >
                          <Trash2 />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(confirmRequest)}
        onOpenChange={(next) => {
          if (confirmBusy || saving) return
          if (!next) setConfirmRequest(undefined)
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{confirmRequest?.title}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 px-5 py-2 text-[13px] text-[var(--muted-foreground)]">
            {confirmRequest?.lines.map((line, index) => (
              <span key={index} className="contents">{line}</span>
            ))}
          </div>
          <DialogFooter>
            <Button variant="secondary" disabled={confirmBusy || saving} onClick={() => setConfirmRequest(undefined)}>
              取消
            </Button>
            <Button
              variant={confirmRequest?.danger ? 'destructive' : 'primary'}
              disabled={confirmBusy || saving}
              onClick={() => void runConfirm()}
            >
              {confirmBusy || saving ? '处理中…' : confirmRequest?.confirmText}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
