import {Database, Rocket} from 'lucide-react'

import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {PageHeader} from '@/components/ui/page-header'
import {StatusPill} from '@/components/ui/status-pill'
import {MonoText} from '@/components/ui/mono-text'
import {useAppStore} from '@/store/useAppStore'
import {useNavigationStore} from '@/store/navigationStore'

export function DashboardPage() {
  const setActivePage = useNavigationStore((state) => state.setActivePage)
  const project = useAppStore((state) => state.project)
  const environment = useAppStore((state) => state.environment)
  const buildStatus = useAppStore((state) => state.buildStatus)

  const runningTasks = [buildStatus === 'RUNNING' ? 'Maven 构建正在运行' : undefined].filter(
    (item): item is string => Boolean(item),
  )

  return (
    <section className="mx-auto w-full max-w-[1180px] p-4 lg:p-6">
      <PageHeader
        title="首页 Dashboard"
        description="Maven 多模块项目打包工作台。"
        actions={
          <Button variant="primary" className="gap-1.5" onClick={() => setActivePage('build')}>
            <Rocket />
            开始打包
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>当前环境状态</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              <span className="text-[13px]">项目：{project?.artifactId ?? '未选择'}</span>
              <MonoText className="truncate text-[12px] text-[var(--muted-foreground)]">
                {project?.rootPath ?? '选择项目后显示路径'}
              </MonoText>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <StatusPill
                  tone={
                    environment?.status === 'ok'
                      ? 'success'
                      : environment?.status === 'error'
                        ? 'error'
                        : 'warning'
                  }
                >
                  {environment?.status === 'ok'
                    ? '环境正常'
                    : environment?.status === 'error'
                      ? '环境异常'
                      : '待检查'}
                </StatusPill>
                <StatusPill>JDK：{environment?.javaVersion ?? '未识别'}</StatusPill>
                <StatusPill>
                  Maven：
                  {environment?.mavenVersion ?? (environment?.hasMavenWrapper ? 'mvnw' : '未识别')}
                </StatusPill>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>正在运行任务</CardTitle>
          </CardHeader>
          <CardContent>
            {runningTasks.length === 0 ? (
              <div className="flex min-h-16 items-center justify-center text-[13px] text-[var(--muted-foreground)]">
                当前没有运行中的构建任务
              </div>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {runningTasks.map((item) => (
                  <li key={item}>
                    <StatusPill tone="processing">{item}</StatusPill>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>快捷操作</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" className="gap-1.5" onClick={() => setActivePage('artifacts')}>
                <Database />
                构建产物
              </Button>
              <Button variant="secondary" onClick={() => setActivePage('history')}>
                构建历史
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
