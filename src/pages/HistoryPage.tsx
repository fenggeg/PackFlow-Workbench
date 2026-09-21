import {Card, CardContent} from '@/components/ui/card'
import {PageHeader} from '@/components/ui/page-header'
import {StatusPill} from '@/components/ui/status-pill'
import {HistoryTable} from '@/components/HistoryTable/HistoryTable'
import {useAppStore} from '@/store/useAppStore'

export function HistoryPage() {
  const history = useAppStore((state) => state.history)
  const buildSuccess = history.filter((h) => h.status === 'SUCCESS').length
  const buildFailed = history.filter((h) => h.status === 'FAILED').length
  const buildCancelled = history.filter((h) => h.status === 'CANCELLED').length
  const lastBuild = history[0]

  return (
    <section className="mx-auto w-full max-w-[1180px] p-4 lg:p-6">
      <PageHeader title="历史管理" description="统一查看构建记录和部署记录。" />
      <Card className="mb-3">
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3">
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[var(--muted-foreground)]">构建记录</span>
            <div className="flex flex-wrap gap-1.5">
              <StatusPill tone="info">总计 {history.length}</StatusPill>
              <StatusPill tone="success">成功 {buildSuccess}</StatusPill>
              <StatusPill tone="error">失败 {buildFailed}</StatusPill>
              <StatusPill tone="warning">已停止 {buildCancelled}</StatusPill>
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