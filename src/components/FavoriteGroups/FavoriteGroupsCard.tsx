import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {Check, Download, MoreHorizontal, Pencil, Pin, PinOff, Save, Trash2} from 'lucide-react'
import {useState} from 'react'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {SaveTemplateDialog} from '@/components/BuildTemplate/SaveTemplateDialog'
import {useAppStore} from '@/store/useAppStore'
import {describeError, notifyError, notifySuccess} from '@/store/useFeedbackStore'
import type {BuildTemplate} from '@/types/domain'
import {downloadTextFile, timestampSuffix} from '@/utils/download'

export function FavoriteGroupsCard() {
  const project = useAppStore((state) => state.project)
  const templates = useAppStore((state) => state.templates)
  const applyTemplate = useAppStore((state) => state.applyTemplate)
  const updateTemplate = useAppStore((state) => state.updateTemplate)
  const deleteTemplate = useAppStore((state) => state.deleteTemplate)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<BuildTemplate | undefined>(undefined)
  const [editingName, setEditingName] = useState('')
  const [editingLoading, setEditingLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<BuildTemplate | null>(null)

  const openEdit = (template: BuildTemplate) => {
    setEditing(template)
    setEditingName(template.name)
  }

  const saveEditing = async () => {
    if (!editing || !editingName.trim()) return
    setEditingLoading(true)
    try {
      await updateTemplate({...editing, name: editingName.trim()})
      setEditing(undefined)
      setEditingName('')
    } catch (error) {
      notifyError('保存失败', describeError(error))
    } finally {
      setEditingLoading(false)
    }
  }

  const togglePin = async (template: BuildTemplate) => {
    try {
      await updateTemplate({...template, pinned: !template.pinned})
    } catch (error) {
      notifyError('操作失败', describeError(error))
    }
  }

  /** 导出全部模板为 JSON，便于备份或在另一台机器上恢复 */
  const exportTemplates = () => {
    if (templates.length === 0) return
    downloadTextFile(
      `packflow-templates-${timestampSuffix()}.json`,
      JSON.stringify(templates, null, 2),
      'application/json;charset=utf-8',
    )
    notifySuccess(`已导出 ${templates.length} 个构建模板`)
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>构建模板</CardTitle>
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="iconSm"
                disabled={templates.length === 0}
                aria-label="导出构建模板"
                onClick={exportTemplates}
              >
                <Download />
              </Button>
            </TooltipTrigger>
            <TooltipContent>导出构建模板（JSON）</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="iconSm"
                disabled={!project}
                aria-label="保存当前选择"
                onClick={() => setSaving(true)}
              >
                <Save />
              </Button>
            </TooltipTrigger>
            <TooltipContent>保存当前选择为构建模板</TooltipContent>
          </Tooltip>
        </div>
      </CardHeader>
      <CardContent>
        {templates.length === 0 ? (
          <div className="flex min-h-16 items-center justify-center text-[13px] text-[var(--muted-foreground)]">
            暂无构建模板，配置好参数后点击右上角保存。
          </div>
        ) : (
          <ul className="m-0 list-none divide-y divide-[var(--border)] p-0">
            {templates.map((template) => (
              <li key={template.id} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate text-[13px] font-medium"
                    title={template.name || '未命名模板'}
                  >
                    {template.pinned ? <Pin className="mr-1 inline size-3 text-[var(--muted-foreground)]" /> : null}
                    {template.name || '未命名模板'}
                  </div>
                  <div
                    className="truncate text-[12px] text-[var(--muted-foreground)]"
                    title={template.modulePath || '全部项目'}
                  >
                    {template.modulePath || '全部项目'}
                  </div>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="primary"
                      size="iconSm"
                      aria-label="应用构建模板"
                      onClick={() => applyTemplate(template)}
                    >
                      <Check />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>应用构建模板</TooltipContent>
                </Tooltip>
                {/* 使用 Radix 菜单：Portal 渲染不会被侧栏滚动容器裁剪，且自带键盘与 ARIA 支持 */}
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <Button variant="ghost" size="iconSm" aria-label="更多操作">
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      align="end"
                      sideOffset={4}
                      className="z-50 min-w-32 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--popover)] py-1 shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
                    >
                      <DropdownMenu.Item
                        className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[13px] outline-none data-[highlighted]:bg-[var(--accent)]"
                        onSelect={() => void togglePin(template)}
                      >
                        {template.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                        {template.pinned ? '取消置顶' : '置顶'}
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[13px] outline-none data-[highlighted]:bg-[var(--accent)]"
                        onSelect={() => openEdit(template)}
                      >
                        <Pencil className="size-3.5" />
                        编辑名称
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[13px] text-[var(--error)] outline-none data-[highlighted]:bg-[var(--accent)]"
                        onSelect={() => setDeleteTarget(template)}
                      >
                        <Trash2 className="size-3.5" />
                        删除
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <SaveTemplateDialog open={saving} onOpenChange={setSaving} defaultName={project?.artifactId} />

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open && !editingLoading) {
            setEditing(undefined)
            setEditingName('')
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>编辑构建模板</DialogTitle>
          </DialogHeader>
          <div className="px-5 py-2">
            <Input
              autoFocus
              maxLength={40}
              placeholder="模板名称"
              value={editingName}
              onChange={(event) => setEditingName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void saveEditing()
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              disabled={editingLoading}
              onClick={() => {
                setEditing(undefined)
                setEditingName('')
              }}
            >
              取消
            </Button>
            <Button
              variant="primary"
              disabled={editingLoading || !editingName.trim()}
              onClick={() => void saveEditing()}
            >
              {editingLoading ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>删除构建模板？</DialogTitle>
          </DialogHeader>
          <p className="m-0 px-5 py-2 text-[13px]">
            确定要删除「{deleteTarget?.name || '未命名模板'}」吗？
          </p>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteTarget) {
                  void deleteTemplate(deleteTarget.id).then(() => notifySuccess('已删除构建模板'))
                }
                setDeleteTarget(null)
              }}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
