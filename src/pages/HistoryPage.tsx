import {PageHeader} from '@/components/ui/page-header'
import {HistoryTable} from '@/components/HistoryTable/HistoryTable'

export function HistoryPage() {
  return (
    <section className="mx-auto w-full max-w-[1180px] p-4 lg:p-6">
      <PageHeader title="历史管理" description="统一查看构建记录和部署记录。" />
      <div className="min-w-0">
        <HistoryTable />
      </div>
    </section>
  )
}
