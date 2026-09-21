import {PageHeader} from '@/components/ui/page-header'
import {WorkspaceCollapse} from '@/components/ui/workspace-collapse'
import {AdvancedOptionsPanel} from '@/components/AdvancedOptions/AdvancedOptionsPanel'
import {BuildNextActionsPanel} from '@/components/BuildCenter/BuildNextActionsPanel'
import {BuildOptionsPanel} from '@/components/BuildOptions/BuildOptionsPanel'
import {BuildProgressPanel} from '@/components/BuildProgress/BuildProgressPanel'
import {EnvPanel} from '@/components/EnvPanel/EnvPanel'

export function BuildPage() {
  return (
    <section className="mx-auto w-full max-w-[1180px] p-4 lg:p-6">
      <PageHeader
        title="构建中心"
        description="选模块、配参数、开始构建，结果会自动记录到产物与历史。"
      />
      <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
        <BuildProgressPanel />
        <BuildOptionsPanel />
        <WorkspaceCollapse
          items={[
            {
              key: 'environment',
              label: '构建环境摘要',
              children: <EnvPanel />,
            },
            {
              key: 'advanced',
              label: '高级参数',
              children: <AdvancedOptionsPanel />,
            },
          ]}
        />
        <BuildNextActionsPanel />
      </div>
    </section>
  )
}
