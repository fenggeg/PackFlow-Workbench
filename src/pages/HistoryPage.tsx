import {useMemo} from 'react'
import {Card, CardContent} from '@/components/ui/card'
import {PageHeader} from '@/components/ui/page-header'
import {StatusPill} from '@/components/ui/status-pill'
import {HistoryTable} from '@/components/HistoryTable/HistoryTable'
import {useAppStore} from '@/store/useAppStore'
import {formatDuration, summarizeHistory} from '@/utils/buildStats'

export function HistoryPage() {
  const history = useAppStore((state) => state.history)
  const summary = useMemo(() => summarizeHistory(history), [history])
  const lastBuild = history[0]

  return (
    <section className="mx-auto w-full max-w-[1180px] p-4 lg:p-6">
      <PageHeader title="历史管理" description="统一查看构建记录和部署记录。" />
      <Card className="mb-3">
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3">
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[var(--muted-foreground)]">构建记录</span>
            <div className="flex flex-wrap gap-1.5">
              <StatusPill tone="info">总计 {summary.total}</StatusPill>
              <StatusPill tone="success">成功 {summary.success}</StatusPill>
              <StatusPill tone="error">失败 {summary.failed}</StatusPill>
              <StatusPill tone="warning">已停止 {summary.cancelled}</StatusPill>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[var(--muted-foreground)]">趋势</span>
            <div className="flex flex-wrap gap-1.5">
              <StatusPill>成功率 {summary.successRate}%</StatusPill>
              {summary.averageDurationMs ? (
                <StatusPill>平均耗时 {formatDuration(summary.averageDurationMs)}</StatusPill>
              ) : null}
              <StatusPill>近 7 天 {summary.recentSevenDays} 次</StatusPill>
              {summary.slowestModule ? (
                <StatusPill>
                  最慢 {summary.slowestModule.artifactId}（{formatDuration(summary.slowestModule.averageMs)}）
                </StatusPill>
              ) : null}
            </div>
          </div>
          {lastBuild ? (
            <span className="text-[12px] text-[var(--muted-foreground)]">
              最近：{new Date(lastBuild.createdAt).toLocaleString()} ·{' '}
              {lastBuild.status === 'SUCCESS'
                ? '成功'
                : lastBuild.status === 'FAILED'
                  ? '失败'
                  : '已取消'}
            </span>
          ) : null}
        </CardContent>
      </Card>
      <div className="min-w-0">
        <HistoryTable />
      </div>
    </section>
  )
}