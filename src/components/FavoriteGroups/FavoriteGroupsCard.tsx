import {useState} from "react";
import {Check, Edit, Folder, MoreHorizontal, Pin, PinOff, Save, Trash2} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from "@/components/ui/dropdown-menu";
import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip";
import {useAppStore} from "../../store/useAppStore";
import type {BuildTemplate} from "../../types/domain";

export function FavoriteGroupsCard() {
  const project = useAppStore((s) => s.project);
  const templates = useAppStore((s) => s.templates);
  const applyTemplate = useAppStore((s) => s.applyTemplate);
  const saveTemplate = useAppStore((s) => s.saveTemplate);
  const updateTemplate = useAppStore((s) => s.updateTemplate);
  const deleteTemplate = useAppStore((s) => s.deleteTemplate);

  const [saving, setSaving] = useState(false);
  const [savingLoading, setSavingLoading] = useState(false);
  const [editing, setEditing] = useState<BuildTemplate | undefined>();
  const [editingLoading, setEditingLoading] = useState(false);
  const [name, setName] = useState("");
  const [editingName, setEditingName] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<BuildTemplate | undefined>();

  const openEdit = (template: BuildTemplate) => {
    setEditing(template);
    setEditingName(template.name);
  };

  const saveEditing = async () => {
    if (!editing || !editingName.trim()) return;
    setEditingLoading(true);
    await updateTemplate({ ...editing, name: editingName.trim() });
    setEditingLoading(false);
    setEditing(undefined);
    setEditingName("");
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">常用组合</h4>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              disabled={!project}
              onClick={() => setSaving(true)}
            >
              <Save className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>保存当前选择</TooltipContent>
        </Tooltip>
      </div>

      {templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Folder className="h-8 w-8 mb-2" />
          <span className="text-sm">暂无常用组合</span>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {templates.map((template) => (
            <div
              key={template.id}
              className="flex items-center gap-2 p-2 rounded-md hover:bg-accent group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  {template.pinned && <Pin className="h-3 w-3 text-primary shrink-0" />}
                  <span
                    className="text-sm font-medium truncate"
                    title={template.name || "未命名组合"}
                  >
                    {template.name || "未命名组合"}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground truncate block">
                  {template.modulePath || "全部项目"}
                </span>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => applyTemplate(template)}
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>应用常用组合</TooltipContent>
                </Tooltip>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                      <MoreHorizontal className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() =>
                        void updateTemplate({ ...template, pinned: !template.pinned })
                      }
                    >
                      {template.pinned ? (
                        <PinOff className="h-3.5 w-3.5 mr-2" />
                      ) : (
                        <Pin className="h-3.5 w-3.5 mr-2" />
                      )}
                      {template.pinned ? "取消置顶" : "置顶"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openEdit(template)}>
                      <Edit className="h-3.5 w-3.5 mr-2" />
                      编辑名称
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => setDeleteConfirm(template)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                      删除
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Save dialog */}
      <Dialog
        open={saving}
        onOpenChange={(open) => {
          if (!open && !savingLoading) setSaving(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>保存当前选择为常用组合</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="例如 网关联调"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaving(false)}>
              取消
            </Button>
            <Button
              disabled={!name.trim() || savingLoading}
              onClick={async () => {
                const trimmed = name.trim();
                if (!trimmed) return;
                setSavingLoading(true);
                await saveTemplate(trimmed);
                setSavingLoading(false);
                setName("");
                setSaving(false);
              }}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open && !editingLoading) {
            setEditing(undefined);
            setEditingName("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑常用组合</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="组合名称"
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditing(undefined); setEditingName(""); }}>
              取消
            </Button>
            <Button disabled={!editingName.trim() || editingLoading} onClick={saveEditing}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog
        open={Boolean(deleteConfirm)}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirm(undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除常用组合？</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            确定要删除「{deleteConfirm?.name || "未命名组合"}」吗？
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(undefined)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (deleteConfirm) {
                  await deleteTemplate(deleteConfirm.id);
                  setDeleteConfirm(undefined);
                }
              }}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}