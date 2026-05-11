import {useEffect, useState} from "react";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {Dialog, DialogContent, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {FolderOpen, GitBranch, Minus, Square, X} from "lucide-react";
import {useAppStore} from "@/store/useAppStore";
import {UpdateChecker} from "@/components/UpdateChecker/UpdateChecker";
import {ProjectSelector} from "@/components/ProjectSelector/ProjectSelector";

export function Header() {
  const project = useAppStore((state) => state.project);
  const gitStatus = useAppStore((state) => state.gitStatus);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [win, setWin] = useState<{ minimize(): void; toggleMaximize(): void; close(): void } | null>(null);

  useEffect(() => {
    import("@tauri-apps/api/window").then((mod) => {
      setWin(mod.getCurrentWindow());
    }).catch(() => {});
  }, []);

  return (
    <>
      <header className="h-12 flex items-center justify-between px-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60" data-tauri-drag-region>
        <div className="flex items-center gap-2" data-tauri-no-drag>
          <Button variant="ghost" onClick={() => setSwitcherOpen(true)} className="flex items-center gap-2 px-2">
            <FolderOpen className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">{project?.artifactId ?? '尚未选择项目'}</span>
          </Button>
          <div className="h-4 w-px bg-border mx-1" />
          <Badge variant="outline" className="gap-1 text-xs font-normal text-muted-foreground">
            <GitBranch className="h-3 w-3" />
            {gitStatus?.branch ?? '未识别分支'}
          </Badge>
        </div>
        <div className="flex items-center gap-2" data-tauri-no-drag>
          <UpdateChecker />
          <div className="h-4 w-px bg-border mx-1" />
          {win && (
            <>
              <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted" onClick={() => win.minimize()}>
                <Minus className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted" onClick={() => win.toggleMaximize()}>
                <Square className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-destructive hover:text-destructive-foreground" onClick={() => win.close()}>
                <X className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </header>

      <Dialog open={switcherOpen} onOpenChange={setSwitcherOpen}>
        <DialogContent className="max-w-[500px] max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>项目切换</DialogTitle>
          </DialogHeader>
          <ProjectSelector framed={false} onProjectSelected={() => setSwitcherOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}