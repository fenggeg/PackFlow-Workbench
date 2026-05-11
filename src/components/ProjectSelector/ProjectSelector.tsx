import React, {useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {ScrollArea} from "@/components/ui/scroll-area";
import {FolderOpen, RefreshCw, Trash2} from "lucide-react";
import {useAppStore} from "../../store/useAppStore";

interface ProjectSelectorProps {
  framed?: boolean;
  onProjectSelected?: () => void;
}

export function ProjectSelector({ framed = true, onProjectSelected }: ProjectSelectorProps) {
  const project = useAppStore((state) => state.project);
  const savedProjectPaths = useAppStore((state) => state.savedProjectPaths);
  const error = useAppStore((state) => state.error);
  const loading = useAppStore((state) => state.loading);
  const chooseProject = useAppStore((state) => state.chooseProject);
  const parseProjectPath = useAppStore((state) => state.parseProjectPath);
  const removeSavedProject = useAppStore((state) => state.removeSavedProject);
  const [manualPath, setManualPath] = useState("");

  const currentPath = project?.rootPath ?? "";

  const handleSelect = (path: string) => {
    void parseProjectPath(path).then(onProjectSelected);
  };

  return (
    <div className={`flex flex-col gap-4 h-full ${framed ? "p-4 border rounded-lg bg-card" : ""}`}>
      <Button
        className="w-full gap-2"
        disabled={loading}
        onClick={() => chooseProject()}
      >
        <FolderOpen className="h-4 w-4" />
        {loading ? "加载中..." : "选择 Maven 项目"}
      </Button>

      <div className="flex gap-2">
        <Input
          placeholder="粘贴项目根目录..."
          value={manualPath}
          onChange={(e) => setManualPath(e.target.value)}
        />
        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            if (manualPath.trim()) {
              handleSelect(manualPath.trim());
              setManualPath("");
            }
          }}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {currentPath && (
        <div className="text-xs text-muted-foreground truncate px-1">
          当前: {currentPath}
        </div>
      )}

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
          {error}
        </div>
      )}

      <div className="flex flex-col flex-1 min-h-0">
        <div className="text-sm font-medium mb-2">已保存项目</div>
        <ScrollArea className="flex-1 -mx-2">
          <div className="flex flex-col gap-1 px-2">
            {savedProjectPaths.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-4">
                暂无保存项目
              </div>
            )}
            {savedProjectPaths.map((path) => {
              const isActive = path.toLowerCase() === currentPath.toLowerCase();
              return (
                <div
                  key={path}
                  className={`
                    flex items-center justify-between p-2 rounded-md text-sm cursor-pointer group
                    ${isActive ? "bg-primary/10 text-primary" : "hover:bg-muted"}
                  `}
                  onClick={() => !isActive && handleSelect(path)}
                >
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="font-medium truncate">{path.split(/[\\/]/).pop()}</span>
                    <span className="text-xs text-muted-foreground truncate">{path}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      void removeSavedProject(path);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
