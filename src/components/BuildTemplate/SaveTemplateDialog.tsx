import {useState} from 'react'
import {Button} from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {useAppStore} from '@/store/useAppStore'

const MAX_NAME_LENGTH = 40

/** 保存构建模板的统一入口：底栏与侧边栏共用，避免两套文案与两套实现 */
export function SaveTemplateDialog({
  open,
  onOpenChange,
  defaultName,
  title = '保存构建模板',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultName?: string
  title?: string
}) {
  const saveTemplate = useAppStore((state) => state.saveTemplate)
  const project = useAppStore((state) => state.project)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  // 打开瞬间重置草稿：用渲染期同步代替 effect，避免级联渲染
  const [syncedOpen, setSyncedOpen] = useState(open)
  if (open !== syncedOpen) {
    setSyncedOpen(open)
    if (open) {
      setName(defaultName ?? '')
      setSaving(false)
    }
  }

  const submit = async () => {
    const trimmed = name.trim()
    if (!trimmed || saving) return
    setSaving(true)
    try {
      await saveTemplate(trimmed)
      setName('')
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-1.5 px-5 py-2">
          <Input
            autoFocus
            maxLength={MAX_NAME_LENGTH}
            placeholder="例如 网关联调"
            value={name}
            disabled={!project}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void submit()
              }
            }}
          />
          <span className="text-[12px] text-[var(--muted-foreground)]">
            {project ? '将保存当前模块选择与打包参数。' : '请先选择项目后再保存模板。'}
          </span>
        </div>
        <DialogFooter>
          <Button variant="secondary" disabled={saving} onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant="primary" disabled={saving || !name.trim() || !project} onClick={() => void submit()}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
