import {ArrowDownToLine, Copy, Download, Maximize2, Regex, Square, Trash2, WrapText} from 'lucide-react'
import {useEffect, useMemo, useRef, useState} from 'react'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {StatusPill} from '@/components/ui/status-pill'
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip'
import {LogConsole} from '@/components/common/LogConsole'
import {usePreferencesStore} from '@/store/usePreferencesStore'
import {useBuildSessionStore} from '@/store/useBuildSessionStore'
import {useAppStore} from '@/store/useAppStore'
import {describeError, notify, notifyError, notifyInfo, notifySuccess} from '@/store/useFeedbackStore'
import {api, selectSavePath} from '@/services/tauri-api'
import {timestampSuffix} from '@/utils/download'
import type {BuildStatus} from '@/types/domain'
import {classifyBuildLogEvent, classifyLogLine, diagnosisCategoryText} from '@/utils/format'

type LogFilter = 'all' | 'error' | 'warn' | 'success'

const statusText: Record<BuildStatus, string> = {
  IDLE: '未开始',
  RUNNING: '构建中',
  SUCCESS: '构建成功',
  FAILED: '构建失败',
  CANCELLED: '已停止',
}

const statusTone: Record<BuildStatus, 'neutral' | 'processing' | 'success' | 'error' | 'warning'> = {
  IDLE: 'neutral',
  RUNNING: 'processing',
  SUCCESS: 'success',
  FAILED: 'error',
  CANCELLED: 'warning',
}

export function BuildLogPanel({fill = false, onExpand}: {fill?: boolean; onExpand?: () => void}) {
  const logs = useAppStore((state) => state.logs)
  const diagnosis = useAppStore((state) => state.diagnosis)
  const buildStatus = useBuildSessionStore((state) => state.status)
  const buildCancelling = useBuildSessionStore((state) => state.cancelling)
  const cancelBuild = useAppStore((state) => state.cancelBuild)
  const clearBuildLogs = useAppStore((state) => state.clearBuildLogs)
  const logFocusRequest = useAppStore((state) => state.logFocusRequest)

  const panelRef = useRef<HTMLDivElement>(null)
  const [keyword, setKeyword] = useState('')
  const [regexMode, setRegexMode] = useState(false)
  const [logFilter, setLogFilter] = useState<LogFilter>('all')
  // 换行与自动滚动是持久化偏好：面板内开关与设置页读写同一份，跨会话记忆
  const wrapLines = usePreferencesStore((state) => state.logWrap)
  const setWrapLines = usePreferencesStore((state) => state.setLogWrap)
  const autoScroll = usePreferencesStore((state) => state.logAutoScroll)
  const setAutoScroll = usePreferencesStore((state) => state.setLogAutoScroll)

  const currentLogCount = logs.length

  const scrollToBottom = () => {
    if (panelRef.current) panelRef.current.scrollTop = panelRef.current.scrollHeight
  }

  useEffect(() => {
    if (autoScroll) scrollToBottom()
  }, [autoScroll, currentLogCount, setAutoScroll])

  // 诊断结果「定位错误」：滚动到首个匹配的日志行并短暂高亮。
  // 定位时必须关闭自动跟随，否则会被后续日志立刻拉回底部。
  useEffect(() => {
    if (!logFocusRequest) return
    const container = panelRef.current
    if (!container) return
    const nodes = Array.from(container.querySelectorAll<HTMLElement>('[data-log-index]'))
    const target = nodes.find((node) => (node.textContent ?? '').includes(logFocusRequest.line))
    if (!target) {
      // 错误行滚出渲染窗口（LogConsole 默认只渲染最近几百行）时不再静默失效
      notifyInfo('未能定位到该行', '目标日志行不在当前渲染范围内，请清除过滤或关闭自动跟随后再试。')
      return
    }
    setAutoScroll(false)
    target.scrollIntoView({block: 'center'})
    target.classList.add('log-line-focus')
    const timer = setTimeout(() => target.classList.remove('log-line-focus'), 2400)
    return () => {
      clearTimeout(timer)
      target.classList.remove('log-line-focus')
    }
  }, [logFocusRequest, setAutoScroll])

  const keywordValue = keyword.trim()
  /**
   * 正则匹配器：null 表示未启用正则，undefined 表示正则非法。
   * 非法正则不参与过滤，界面会给出提示，而不是让整个日志区变空。
   */
  const regexMatcher = useMemo(() => {
    if (!regexMode || !keywordValue) return null
    try {
      return new RegExp(keywordValue, 'i')
    } catch {
      return undefined
    }
  }, [keywordValue, regexMode])
  const regexInvalid = regexMatcher === undefined

  const visibleBuildLogs = useMemo(
    () =>
      logs.filter((event) => {
        if (logFilter !== 'all' && classifyBuildLogEvent(event) !== logFilter) return false
        if (keywordValue) {
          if (regexInvalid) return false
          if (regexMatcher) {
            if (!regexMatcher.test(event.line)) return false
          } else if (!event.line.toLowerCase().includes(keywordValue.toLowerCase())) {
            return false
          }
        }
        return true
      }),
    [keywordValue, logFilter, logs, regexInvalid, regexMatcher],
  )

  const visibleBuildLogLines = useMemo(
    () => visibleBuildLogs.map((event) => event.line),
    [visibleBuildLogs],
  )

  const writeClipboard = async (text: string, successMessage: string) => {
    try {
      await navigator.clipboard?.writeText(text)
      notifySuccess(successMessage)
    } catch (error) {
      notifyError('复制日志失败', describeError(error))
    }
  }

  const copyLogs = () => {
    void writeClipboard(
      logs.map((event) => event.line).join('\n'),
      `已复制 ${logs.length} 行完整日志`,
    )
  }

  const filtered = logFilter !== 'all' || keywordValue.length > 0

  const copyVisibleLogs = () => {
    void writeClipboard(
      visibleBuildLogLines.join('\n'),
      `已复制 ${visibleBuildLogLines.length} 行（当前筛选结果）`,
    )
  }

  const downloadLogs = async () => {
    const text = logs.map((event) => event.line).join('\n')
    if (!text) return
    // 原生保存对话框：用户自选位置，保存后在哪一目了然；
    // 之前用浏览器式 blob 下载，桌面壳里落点不可控也找不到文件
    const target = await selectSavePath('导出构建日志', `build-log-${timestampSuffix()}.txt`)
    if (!target) return
    try {
      await api.exportDiagnostics(target, text)
      // 长路径需要更长的阅读时间
      notify({tone: 'success', title: '日志已导出', description: `保存位置：${target}`, duration: 8000})
    } catch (error) {
      notifyError('导出日志失败', describeError(error))
    }
  }

  const copyDiagnosis = async () => {
    if (!diagnosis) return
    const content = [
      `错误类型：${diagnosisCategoryText[diagnosis.category]}`,
      `摘要：${diagnosis.summary}`,
      '',
      '可能原因：',
      ...diagnosis.possibleCauses.map((item) => `- ${item}`),
      '',
      '建议动作：',
      ...diagnosis.suggestedActions.map((item) => `- ${item}`),
      '',
      '关键日志：',
      ...diagnosis.keywordLines.map((item) => `> ${item}`),
    ].join('\n')
    try {
      await navigator.clipboard?.writeText(content)
      notifySuccess('已复制诊断结果')
    } catch (error) {
      notifyError('复制诊断失败', describeError(error))
    }
  }

  return (
    <div className={fill ? 'flex h-full min-h-0 w-full flex-col gap-3' : 'flex w-full flex-col gap-3'}>
      <Card className={fill ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : undefined}>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle>日志输出</CardTitle>
          <div className="flex flex-wrap items-center gap-0.5">
            <StatusPill tone={statusTone[buildStatus]}>{statusText[buildStatus]}</StatusPill>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="iconSm"
                  className="text-[var(--error)]"
                  disabled={buildStatus !== 'RUNNING' || buildCancelling}
                  aria-label="停止构建"
                  onClick={() => void cancelBuild()}
                >
                  <Square />
                </Button>
              </TooltipTrigger>
              <TooltipContent>停止构建</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="iconSm" aria-label="清空日志" onClick={clearBuildLogs}>
                  <Trash2 />
                </Button>
              </TooltipTrigger>
              <TooltipContent>清空日志</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="iconSm"
                  disabled={currentLogCount === 0}
                  aria-label="复制全部日志"
                  onClick={copyLogs}
                >
                  <Copy />
                </Button>
              </TooltipTrigger>
              <TooltipContent>复制全部日志</TooltipContent>
            </Tooltip>
            {filtered ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="iconSm"
                    disabled={visibleBuildLogLines.length === 0}
                    aria-label="复制筛选结果"
                    onClick={copyVisibleLogs}
                  >
                    <Copy className="text-[var(--info)]" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>复制筛选结果（{visibleBuildLogLines.length} 行）</TooltipContent>
              </Tooltip>
            ) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={wrapLines ? 'primary' : 'ghost'}
                  size="iconSm"
                  aria-label={wrapLines ? '关闭自动换行' : '开启自动换行'}
                  onClick={() => setWrapLines(!wrapLines)}
                >
                  <WrapText />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{wrapLines ? '关闭自动换行（保留原始对齐）' : '开启自动换行'}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="iconSm"
                  disabled={currentLogCount === 0}
                  aria-label="下载日志"
                  onClick={() => void downloadLogs()}
                >
                  <Download />
                </Button>
              </TooltipTrigger>
              <TooltipContent>下载日志</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={autoScroll ? 'primary' : 'ghost'}
                  size="iconSm"
                  aria-label={autoScroll ? '关闭自动滚动' : '开启自动滚动'}
                  onClick={() => setAutoScroll(!autoScroll)}
                >
                  <ArrowDownToLine />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{autoScroll ? '关闭自动滚动' : '开启自动滚动'}</TooltipContent>
            </Tooltip>
            {!autoScroll ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="iconSm" aria-label="回到底部" onClick={scrollToBottom}>
                    <ArrowDownToLine className="rotate-180" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>回到底部</TooltipContent>
              </Tooltip>
            ) : null}
            {onExpand ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="iconSm" aria-label="全屏查看" onClick={onExpand}>
                    <Maximize2 />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>全屏查看日志</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className={fill ? 'flex min-h-0 flex-1 flex-col gap-2.5' : 'flex min-h-0 flex-col gap-2.5'}>
          <div className="flex gap-1.5">
            <Select value={logFilter} onValueChange={(v) => setLogFilter(v as LogFilter)}>
              <SelectTrigger className="h-8 w-[100px] shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="error">错误</SelectItem>
                <SelectItem value="warn">告警</SelectItem>
                <SelectItem value="success">成功</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder={regexMode ? '搜索日志（正则）' : '搜索日志关键词'}
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              className="min-w-0 flex-1"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={regexMode ? 'primary' : 'ghost'}
                  size="iconSm"
                  aria-label="正则搜索"
                  aria-pressed={regexMode}
                  onClick={() => setRegexMode((value) => !value)}
                >
                  <Regex />
                </Button>
              </TooltipTrigger>
              <TooltipContent>按正则搜索</TooltipContent>
            </Tooltip>
          </div>
          {regexInvalid ? (
            <p className="m-0 text-[11px] text-[var(--error)]">
              正则表达式无效，已暂停过滤；修正后可继续搜索。
            </p>
          ) : null}
          <p className="m-0 text-[11px] text-[var(--muted-foreground)]">
            可用鼠标拖动选择日志，随后按 Ctrl+C、右键复制，或点击日志区右上角「复制选中」。
          </p>
          <div className={fill ? 'min-h-0 flex-1' : 'h-[min(42vh,420px)] min-h-56'}>
            <LogConsole
              ref={panelRef}
              lines={visibleBuildLogLines}
              classifyLine={classifyLogLine}
              emptyTitle="准备开始构建"
              emptyDescription="请选择模块并点击开始打包。"
              keyPrefix="build-log"
              wrap={wrapLines}
              highlight={keyword}
              highlightRegex={regexMode}
              onUserScroll={(atBottom) => {
                // 用户向上翻阅时自动暂停跟随，避免抢滚动条
                if (!atBottom) setAutoScroll(false)
              }}
            />
          </div>
        </CardContent>
      </Card>

      {diagnosis ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>诊断面板</CardTitle>
            <Button variant="ghost" size="iconSm" aria-label="复制诊断结果" onClick={() => void copyDiagnosis()}>
              <Copy />
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone="error">{diagnosisCategoryText[diagnosis.category]}</StatusPill>
              <span className="text-[13px] font-medium">{diagnosis.summary}</span>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium">可能原因</span>
                <ul className="m-0 list-none p-0">
                  {diagnosis.possibleCauses.map((item) => (
                    <li key={item} className="border-b border-[var(--border)] py-1.5 text-[13px] text-[var(--muted-foreground)] last:border-b-0">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium">建议动作</span>
                <ul className="m-0 list-none p-0">
                  {diagnosis.suggestedActions.map((item) => (
                    <li key={item} className="border-b border-[var(--border)] py-1.5 text-[13px] text-[var(--muted-foreground)] last:border-b-0">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium">高价值关键字行</span>
              <div data-allow-context-menu className="max-h-40 overflow-y-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--console-bg)] p-2">
                {diagnosis.keywordLines.slice(0, 6).map((line, index) => (
                  <pre
                    key={`${diagnosis.id}-${index}`}
                    className="m-0 whitespace-pre-wrap break-all px-1 py-px font-[family-name:var(--font-mono)] text-[12px] leading-5 text-[var(--console-text)]"
                  >
                    {line}
                  </pre>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
