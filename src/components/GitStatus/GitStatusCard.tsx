import {Download, History, X} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {StatusPill} from '@/components/ui/status-pill'
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip'
import {useAppStore} from '@/store/useAppStore'
import {useNavigationStore} from '@/store/navigationStore'

const formatCommitTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export function GitStatusCard() {
  const project = useAppStore((state) => state.project)
  const gitStatus = useAppStore((state) => state.gitStatus)
  const gitCommits = useAppStore((state) => state.gitCommits)
  const gitChecking = useAppStore((state) => state.gitChecking)
  const gitCommitsLoading = useAppStore((state) => state.gitCommitsLoading)
  const gitPulling = useAppStore((state) => state.gitPulling)
  const gitSwitching = useAppStore((state) => state.gitSwitching)
  const gitError = useAppStore((state) => state.gitError)
  const loadGitCommits = useAppStore((state) => state.loadGitCommits)
  const fetchGitUpdates = useAppStore((state) => state.fetchGitUpdates)
  const pullGitUpdates = useAppStore((state) => state.pullGitUpdates)
  const switchGitBranch = useAppStore((state) => state.switchGitBranch)
  const clearGitError = useAppStore((state) => state.clearGitError)
  const navigateToProjectSelector = useNavigationStore((state) => state.navigateToProjectSelector)

  if (!project) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Git 状态</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-2.5">
          <span className="text-[13px] text-[var(--muted-foreground)]">请先选择 Maven 项目。</span>
          <Button variant="secondary" size="sm" onClick={navigateToProjectSelector}>
            去选择项目
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!gitStatus?.isGitRepo) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Git 状态</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2.5">
          {gitError ? (
            <div className="flex items-start justify-between gap-2 rounded-[var(--radius)] border border-[var(--error)]/30 bg-[var(--error)]/5 px-3 py-2 text-[13px] text-[var(--error)]">
              {gitError}
              <button type="button" onClick={clearGitError} aria-label="关闭">
                <X className="size-3.5" />
              </button>
            </div>
          ) : null}
          <span className="text-[13px] text-[var(--muted-foreground)]">当前目录未识别为 Git 仓库。</span>
        </CardContent>
      </Card>
    )
  }

  const statusPill = gitStatus.hasRemoteUpdates ? (
    <StatusPill tone="warning">落后 {gitStatus.behindCount}</StatusPill>
  ) : gitStatus.hasLocalChanges ? (
    <StatusPill tone="info">本地有改动</StatusPill>
  ) : (
    <StatusPill tone="success">已同步</StatusPill>
  )

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Git 状态</CardTitle>
        {statusPill}
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5">
        {gitError ? (
          <div className="flex items-start justify-between gap-2 rounded-[var(--radius)] border border-[var(--error)]/30 bg-[var(--error)]/5 px-3 py-2 text-[13px] text-[var(--error)]">
            {gitError}
            <button type="button" onClick={clearGitError} aria-label="关闭">
              <X className="size-3.5" />
            </button>
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <span className="shrink-0 text-[12px] text-[var(--muted-foreground)]">当前分支</span>
          <Select
            value={gitStatus.branch}
            disabled={gitSwitching || gitStatus.branches.length === 0}
            onValueChange={(branchName) => {
              if (branchName !== gitStatus.branch) void switchGitBranch(branchName)
            }}
          >
            <SelectTrigger className="h-7 flex-1 text-[12px]">
              <SelectValue placeholder="detached HEAD 或无本地分支" />
            </SelectTrigger>
            <SelectContent>
              {gitStatus.branches.map((branch) => (
                <SelectItem key={branch.name} value={branch.name}>
                  {branch.isCurrent ? `${branch.name}（当前）` : branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="iconSm"
                disabled={gitChecking}
                aria-label="检查远端"
                onClick={() => void fetchGitUpdates()}
              >
                <Download />
              </Button>
            </TooltipTrigger>
            <TooltipContent>检查远端</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="iconSm"
                disabled={gitCommitsLoading}
                aria-label="刷新提交"
                onClick={() => void loadGitCommits()}
              >
                <History />
              </Button>
            </TooltipTrigger>
            <TooltipContent>刷新提交</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="primary"
                size="sm"
                className="h-7 gap-1.5"
                disabled={gitPulling || !gitStatus.hasRemoteUpdates}
                onClick={() => void pullGitUpdates()}
              >
                <Download />
                {gitPulling ? '拉取中…' : '应用内拉取'}
              </Button>
            </TooltipTrigger>
            <TooltipContent>应用内拉取</TooltipContent>
          </Tooltip>
        </div>

        {gitStatus.hasRemoteUpdates ? (
          <div className="rounded-[var(--radius)] border border-[var(--warning)]/30 bg-[var(--warning)]/5 px-3 py-2 text-[13px] text-[var(--warning)]">
            远端有 {gitStatus.behindCount} 个提交尚未拉取
            <p className="m-0 mt-1 text-[12px] text-[var(--muted-foreground)]">
              应用内拉取会使用快进模式；如果需要合并或处理冲突，请在代码编辑器中完成。
            </p>
          </div>
        ) : null}

        {gitStatus.hasLocalChanges ? (
          <span className="text-[12px] text-[var(--warning)]">本地有未提交改动，不影响打包。</span>
        ) : null}

        {!gitStatus.hasRemoteUpdates && !gitStatus.hasLocalChanges && gitStatus.message ? (
          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-[13px] text-[var(--muted-foreground)]">
            {gitStatus.message}
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium">最近提交</span>
            <span className="text-[12px] text-[var(--muted-foreground)]">{gitCommits.length} 条</span>
          </div>
          {gitCommits.length === 0 && !gitCommitsLoading ? (
            <div className="flex min-h-12 items-center justify-center text-[13px] text-[var(--muted-foreground)]">
              暂无提交记录
            </div>
          ) : (
            <ul className="m-0 list-none divide-y divide-[var(--border)] p-0">
              {gitCommits.map((commit) => (
                <li key={commit.hash} className="flex flex-col gap-1 py-2">
                  <span className="truncate text-[13px] font-medium" title={commit.subject}>
                    {commit.subject}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill tone="info">{commit.shortHash}</StatusPill>
                    <span className="text-[12px] text-[var(--muted-foreground)]">{commit.author}</span>
                    <span className="text-[12px] text-[var(--muted-foreground)]">
                      {formatCommitTime(commit.date)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {gitCommitsLoading ? (
            <span className="text-[12px] text-[var(--muted-foreground)]">加载提交…</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
