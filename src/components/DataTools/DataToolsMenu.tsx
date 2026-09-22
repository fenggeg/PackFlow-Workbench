import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {Database, Download, FolderOpen, ShieldCheck, Upload} from 'lucide-react'
import {useState} from 'react'
import {Button} from '@/components/ui/button'
import {
  api,
  getCurrentAppVersion,
  isTauriRuntime,
  selectLocalFile,
  selectSavePath,
} from '@/services/tauri-api'
import {useAppStore} from '@/store/useAppStore'
import {describeError, notifyError, notifySuccess} from '@/store/useFeedbackStore'

const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-')

/** 组装诊断包内容：排障需要的信息一次给全，避免用户手工翻应用数据目录 */
const buildDiagnosticContent = async () => {
  const state = useAppStore.getState()
  const version = await getCurrentAppVersion().catch(() => 'unknown')
  const {project, environment, buildOptions, buildStatus, logs, diagnosis, error} = state

  const lines: string[] = []
  lines.push('=== PackFlow Workbench 诊断包 ===')
  lines.push(`导出时间：${new Date().toLocaleString()}`)
  lines.push(`应用版本：${version}`)
  lines.push('')
  lines.push('--- 项目 ---')
  lines.push(`名称：${project?.artifactId ?? '(未选择)'}`)
  lines.push(`路径：${project?.rootPath ?? '-'}`)
  lines.push(`模块数：${project?.modules?.length ?? 0}`)
  lines.push(`JDK 要求：${project?.jdkRequirement?.versionSpec ?? '-'}`)
  lines.push('')
  lines.push('--- 环境 ---')
  lines.push(`状态：${environment?.status ?? '-'}`)
  lines.push(`JAVA_HOME：${environment?.javaHome ?? '-'}`)
  lines.push(`Java 版本：${environment?.javaVersion ?? '-'}`)
  lines.push(`Maven：${environment?.mavenVersion ?? '-'}（${environment?.mavenPath ?? '-'}）`)
  lines.push(`Wrapper：${environment?.hasMavenWrapper ? '有' : '无'}，启用：${environment?.useMavenWrapper ? '是' : '否'}`)
  lines.push(`settings.xml：${environment?.settingsXmlPath ?? '-'}`)
  lines.push(`本地仓库：${environment?.localRepoPath ?? '-'}`)
  lines.push(`错误：${environment?.errors?.join(' | ') || '无'}`)
  lines.push('')
  lines.push('--- 构建 ---')
  lines.push(`状态：${buildStatus}`)
  lines.push(`目标模块：${buildOptions.selectedModulePath || '全部项目'}`)
  lines.push(`命令：${buildOptions.editableCommand || '-'}`)
  lines.push(`参数：goals=${buildOptions.goals.join(' ')} profiles=${buildOptions.profiles.join(',')} customArgs=${buildOptions.customArgs.join(' ')}`)
  lines.push(`命令锁定：${buildOptions.commandLocked ? '是' : '否'}`)
  lines.push(`最近错误：${error ?? '无'}`)
  lines.push('')
  if (diagnosis) {
    lines.push('--- 构建诊断 ---')
    lines.push(`类型：${diagnosis.category}`)
    lines.push(`摘要：${diagnosis.summary}`)
    lines.push(`可能原因：${diagnosis.possibleCauses.join('；')}`)
    lines.push(`建议动作：${diagnosis.suggestedActions.join('；')}`)
    lines.push('')
  }
  lines.push(`--- 最近 ${Math.min(logs.length, 300)} 条日志 ---`)
  for (const event of logs.slice(-300)) {
    lines.push(`[${event.stream}] ${event.line}`)
  }
  return lines.join('\n')
}

export function DataToolsMenu() {
  const [busy, setBusy] = useState(false)

  const run = async (label: string, task: () => Promise<void>) => {
    if (!isTauriRuntime()) {
      notifyError(label, '请在桌面应用中使用本功能。')
      return
    }
    setBusy(true)
    try {
      await task()
    } catch (error) {
      notifyError(`${label}失败`, describeError(error))
    } finally {
      setBusy(false)
    }
  }

  const backup = async () => {
    const target = await selectSavePath('保存数据备份', `packflow-backup-${timestamp()}.sqlite3`)
    if (!target) return
    const path = await api.backupAppData(target)
    notifySuccess('已备份本地数据', path)
  }

  const restore = async () => {
    const source = await selectLocalFile('选择数据备份文件')
    if (!source) return
    await api.restoreAppData(source)
    notifySuccess('已恢复本地数据', '建议重启应用后重新加载项目。')
  }

  const exportDiagnostics = async () => {
    const content = await buildDiagnosticContent()
    const target = await selectSavePath('导出诊断包', `packflow-diagnostics-${timestamp()}.txt`)
    if (!target) return
    const path = await api.exportDiagnostics(target, content)
    notifySuccess('已导出诊断包', path)
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label="数据与诊断" disabled={busy}>
          <Database />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-44 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--popover)] py-1 shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
        >
          <div className="px-3 py-1 text-[11px] text-[var(--muted-foreground)]">数据与诊断</div>
          <DropdownMenu.Separator className="my-1 h-px bg-[var(--border)]" />
          <DropdownMenu.Item
            className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[13px] outline-none data-[highlighted]:bg-[var(--accent)]"
            onSelect={() => void run('备份数据', backup)}
          >
            <Download className="size-3.5" />
            备份本地数据
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[13px] outline-none data-[highlighted]:bg-[var(--accent)]"
            onSelect={() => void run('恢复数据', restore)}
          >
            <Upload className="size-3.5" />
            从备份恢复
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[13px] outline-none data-[highlighted]:bg-[var(--accent)]"
            onSelect={() => void run('导出诊断包', exportDiagnostics)}
          >
            <ShieldCheck className="size-3.5" />
            导出诊断包
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-[var(--border)]" />
          <DropdownMenu.Item
            className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[13px] outline-none data-[highlighted]:bg-[var(--accent)]"
            onSelect={() => void run('打开数据目录', () => api.openAppDataDir())}
          >
            <FolderOpen className="size-3.5" />
            打开数据目录
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
