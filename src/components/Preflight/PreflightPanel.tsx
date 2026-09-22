import {AlertTriangle, CheckCircle2, RefreshCw, XCircle} from 'lucide-react'
import {useState} from 'react'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {StatusPill} from '@/components/ui/status-pill'
import {useAppStore} from '@/store/useAppStore'
import type {PreflightStatus} from '@/types/domain'

const iconOf = {
  pass: CheckCircle2,
  warn: AlertTriangle,
  fail: XCircle,
} as const

const textClassOf: Record<PreflightStatus, string> = {
  pass: 'text-[var(--success)]',
  warn: 'text-[var(--warning)]',
  fail: 'text-[var(--error)]',
}

const labelOf: Record<PreflightStatus, string> = {
  pass: '通过',
  warn: '注意',
  fail: '未通过',
}

/**
 * 构建前检查：把「环境不对、模块路径写错」这类必然失败的配置在构建前暴露出来，
 * 避免用户白等一轮 Maven 启动才发现问题。
 */
export function PreflightPanel() {
  const project = useAppStore((state) => state.project)
  const preflight = useAppStore((state) => state.preflight)
  const runPreflight = useAppStore((state) => state.runPreflight)
  const [running, setRunning] = useState(false)

  const run = async () => {
    setRunning(true)
    try {
      await runPreflight()
    } finally {
      setRunning(false)
    }
  }

  const failCount = preflight?.checks.filter((check) => check.status === 'fail').length ?? 0

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle>构建前检查</CardTitle>
        <div className="flex items-center gap-2">
          {preflight ? (
            <StatusPill tone={preflight.ok ? 'success' : 'error'}>
              {preflight.ok ? '可以构建' : `${failCount} 项未通过`}
            </StatusPill>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            className="h-7 gap-1.5"
            disabled={running || !project}
            onClick={() => void run()}
          >
            <RefreshCw className={running ? 'animate-spin' : undefined} />
            运行检查
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {preflight ? (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {preflight.checks.map((check) => {
              const Icon = iconOf[check.status]
              return (
                <li key={check.key} className="flex items-start gap-2 text-[13px]">
                  <Icon className={`mt-0.5 size-3.5 shrink-0 ${textClassOf[check.status]}`} />
                  <span className="shrink-0 font-medium">{check.label}</span>
                  <span className="min-w-0 flex-1 text-[var(--muted-foreground)]">{check.message}</span>
                  <span className={`shrink-0 text-[11px] ${textClassOf[check.status]}`}>
                    {labelOf[check.status]}
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          <span className="text-[13px] text-[var(--muted-foreground)]">
            构建开始前会自动检查 JDK、Maven、模块路径与配置文件，也可手动运行一次确认。
          </span>
        )}
      </CardContent>
    </Card>
  )
}
