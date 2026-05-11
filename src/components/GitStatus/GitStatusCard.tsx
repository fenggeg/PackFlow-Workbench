import React from "react";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {ScrollArea} from "@/components/ui/scroll-area";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "@/components/ui/tooltip";
import {Download, RefreshCw} from "lucide-react";
import {useAppStore} from "../../store/useAppStore";

const formatCommitTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

export function GitStatusCard() {
  const project = useAppStore((state) => state.project);
  const gitStatus = useAppStore((state) => state.gitStatus);
  const gitCommits = useAppStore((state) => state.gitCommits);
  const gitChecking = useAppStore((state) => state.gitChecking);
  const gitCommitsLoading = useAppStore((state) => state.gitCommitsLoading);
  const gitPulling = useAppStore((state) => state.gitPulling);
  const gitSwitching = useAppStore((state) => state.gitSwitching);
  const gitError = useAppStore((state) => state.gitError);
  const loadGitCommits = useAppStore((state) => state.loadGitCommits);
  const fetchGitUpdates = useAppStore((state) => state.fetchGitUpdates);
  const pullGitUpdates = useAppStore((state) => state.pullGitUpdates);
  const switchGitBranch = useAppStore((state) => state.switchGitBranch);
  const clearGitError = useAppStore((state) => state.clearGitError);

  if (!project) return null;

  if (!gitStatus?.isGitRepo) {
    return (
      <Card>
        <CardHeader className="p-4"><CardTitle className="text-sm">Git 状态</CardTitle></CardHeader>
        <CardContent className="p-4 pt-0">
          {gitError && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md mb-4">
              {gitError}
              <Button variant="ghost" size="sm" className="ml-2 h-auto p-0" onClick={clearGitError}>关闭</Button>
            </div>
          )}
          <div className="text-sm text-muted-foreground">当前目录未识别为 Git 仓库。</div>
        </CardContent>
      </Card>
    );
  }

  const statusBadge = gitStatus.hasRemoteUpdates ? (
    <Badge variant="destructive">落后 {gitStatus.behindCount}</Badge>
  ) : gitStatus.hasLocalChanges ? (
    <Badge variant="secondary">本地有改动</Badge>
  ) : (
    <Badge variant="default" className="bg-green-500 hover:bg-green-600">已同步</Badge>
  );

  return (
    <TooltipProvider delayDuration={0}>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between p-4">
          <CardTitle className="text-sm">Git 状态</CardTitle>
          {statusBadge}
        </CardHeader>
        <CardContent className="p-4 pt-0 flex flex-col gap-4">
          {gitError && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              {gitError}
              <Button variant="ghost" size="sm" className="ml-2 h-auto p-0" onClick={clearGitError}>关闭</Button>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground">当前分支</span>
            <Select
              value={gitStatus.branch}
              onValueChange={(branchName) => {
                if (branchName !== gitStatus.branch) void switchGitBranch(branchName);
              }}
              disabled={gitSwitching || gitStatus.branches.length === 0}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="detached HEAD 或无本地分支" />
              </SelectTrigger>
              <SelectContent>
                {gitStatus.branches.map((branch) => (
                  <SelectItem key={branch.name} value={branch.name}>
                    {branch.name} {branch.isCurrent ? "（当前）" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" disabled={gitChecking} onClick={() => void fetchGitUpdates()}>
                  <RefreshCw className={`h-4 w-4 ${gitChecking ? "animate-spin" : ""}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>检查远端</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" disabled={gitCommitsLoading} onClick={() => void loadGitCommits()}>
                  <RefreshCw className={`h-4 w-4 ${gitCommitsLoading ? "animate-spin" : ""}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>刷新提交</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" disabled={gitPulling || !gitStatus.hasRemoteUpdates} onClick={() => void pullGitUpdates()}>
                  <Download className={`h-4 w-4 ${gitPulling ? "animate-spin" : ""}`} />
                  <span className="ml-2">拉取</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>应用内拉取</TooltipContent>
            </Tooltip>
          </div>

          {gitStatus.hasRemoteUpdates && (
            <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded-md">
              远端有 {gitStatus.behindCount} 个提交尚未拉取
            </div>
          )}

          <div className="flex flex-col gap-2 min-h-0">
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium">最近提交</span>
              <span className="text-xs text-muted-foreground">{gitCommits.length} 条</span>
            </div>
            <ScrollArea className="h-[200px] -mx-2">
              <div className="flex flex-col gap-1 px-2">
                {gitCommits.map((commit) => (
                  <div key={commit.hash} className="p-2 rounded-md hover:bg-muted text-xs">
                    <div className="font-medium truncate">{commit.subject}</div>
                    <div className="flex gap-2 mt-1 text-muted-foreground">
                      <span className="text-primary">{commit.shortHash}</span>
                      <span>{commit.author}</span>
                      <span>{formatCommitTime(commit.date)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
