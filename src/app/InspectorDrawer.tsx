import {Copy, Maximize2, PanelRightOpen} from 'lucide-react'
import {useEffect, useMemo, useState} from 'react'
import {AnimatePresence} from 'motion/react'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {StatusPill} from '@/components/ui/status-pill'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs'
import {BuildLogPanel} from '@/components/BuildLogPanel/BuildLogPanel'
import {motion, slideInRight} from '@/lib/motion'
import {useAppStore} from '@/store/useAppStore'
import {type InspectorTab, useNavigationStore} from '@/store/navigationStore'
import {diagnosisCategoryText} from '@/utils/format'
import {useInspectorAvailable} from './inspectorAvailability'

export function InspectorDrawer() {
  const inspectorOpen = useNavigationStore((state) => state.inspectorOpen)
  const inspectorTab = useNavigationStore((state) => state.inspectorTab)
  const setInspectorOpen = useNavigationStore((state) => state.setInspectorOpen)
  const setInspectorTab = useNavigationStore((state) => state.setInspectorTab)
  const buildStatus = useAppStore((state) => state.buildStatus)
  const diagnosis = useAppStore((state) => state.diagnosis)
  const logs = useAppStore((state) => state.logs)
  const artifacts = useAppStore((state) => state.artifacts)
  const selectedModules = useAppStore((state) => state.selectedModules)
  const [expanded, setExpanded] = useState(false)

  // 只有构建页或已有构建上下文时才出现，避免在首页/产物页展示无关面板
  const available = useInspectorAvailable()

  useEffect(() => {
    if (!available) return
    if (buildStatus === 'RUNNING') {
      setInspectorOpen(true)
      setInspectorTab('logs')
    }
    if (buildStatus === 'FAILED') {
      setInspectorOpen(true)
      setInspectorTab('diagnosis')
    }
  }, [available, buildStatus, setInspectorOpen, setInspectorTab])

  useEffect(() => {
    if (!inspectorOpen || expanded) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setInspectorOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [expanded, inspectorOpen, setInspectorOpen])

  useEffect(() => {
    if (!available && inspectorOpen) {
      setInspectorOpen(false)
    }
  }, [available, inspectorOpen, setInspectorOpen])

  const logContent = useMemo(() => <BuildLogPanel fill />, [])

  const diagnosisText = useMemo(() => {
    if (!diagnosis) return ''
    return [
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
      ...diagnosis.keywordLines.map((line) => `> ${line}`),
    ].join('\n')
  }, [diagnosis])

  const diagnosisContent = useMemo(() => {
    return (
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>构建诊断</CardTitle>
          <Button
            variant="secondary"
            size="sm"
            className="h-7 gap-1.5"
            disabled={!diagnosis}
            onClick={() => void navigator.clipboard?.writeText(diagnosisText)}
          >
            <Copy className="size-3.5" />
            复制
          </Button>
        </CardHeader>
        <CardContent>
          {diagnosis ? (
            <div className="flex flex-col gap-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone="error">{diagnosisCategoryText[diagnosis.category]}</StatusPill>
                <span className="text-[13px] font-medium">{diagnosis.summary}</span>
              </div>
              <div className="text-[13px] font-medium">建议动作</div>
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {diagnosis.suggestedActions.map((item) => (
                  <li key={item} className="text-[13px] text-[var(--muted-foreground)]">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="flex min-h-24 items-center justify-center text-[13px] text-[var(--muted-foreground)]">
              构建失败后自动生成诊断
            </div>
          )}
        </CardContent>
      </Card>
    )
  }, [diagnosis, diagnosisText])

  const detailsContent = useMemo(() => {
    return (
      <Card>
        <CardHeader>
          <CardTitle>构建上下文</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
            <dt className="text-[var(--muted-foreground)]">构建状态</dt>
            <dd className="m-0">{buildStatus}</dd>
            <dt className="text-[var(--muted-foreground)]">日志行数</dt>
            <dd className="m-0">{logs.length}</dd>
            <dt className="text-[var(--muted-foreground)]">选中模块</dt>
            <dd className="m-0">{selectedModules.length || '全部项目'}</dd>
            <dt className="text-[var(--muted-foreground)]">当前产物</dt>
            <dd className="m-0">{artifacts.length}</dd>
          </dl>
        </CardContent>
      </Card>
    )
  }, [buildStatus, logs.length, selectedModules.length, artifacts.length])

  if (!available) return null

  return (
    <>
      <AnimatePresence>
        {inspectorOpen ? (
          <motion.div
            key="inspector-overlay"
            className="absolute inset-0 z-20 bg-black/20 lg:hidden"
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            transition={{duration: 0.15, ease: [0.2, 0, 0, 1]}}
            onClick={() => setInspectorOpen(false)}
            aria-hidden
          />
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {inspectorOpen ? (
          <motion.aside
            key="inspector-drawer"
            className="absolute inset-y-0 right-0 z-30 flex w-[min(520px,90vw)] flex-col overflow-hidden border-l border-[var(--border)] bg-[var(--card)] lg:relative lg:z-auto lg:w-[380px] xl:w-[480px]"
            {...slideInRight}
          >
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--border)] pl-4 pr-2">
              <span className="text-[13px] font-semibold">检查器</span>
              <div className="flex items-center gap-0.5">
                <Button variant="ghost" size="iconSm" aria-label="全屏查看" onClick={() => setExpanded(true)}>
                  <Maximize2 />
                </Button>
                <Button
                  variant="ghost"
                  size="iconSm"
                  aria-label="收起检查器"
                  onClick={() => setInspectorOpen(false)}
                >
                  <PanelRightOpen className="rotate-180" />
                </Button>
              </div>
            </div>
            <Tabs
              value={inspectorTab}
              onValueChange={(key) => setInspectorTab(key as InspectorTab)}
              className="flex min-h-0 flex-1 flex-col"
            >
              <TabsList className="mx-4 mt-2 h-8 shrink-0 rounded-none border-b border-[var(--border)] bg-transparent p-0">
                <TabsTrigger value="logs" className="rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-[var(--primary)] data-[state=active]:bg-transparent">
                  日志
                </TabsTrigger>
                <TabsTrigger value="diagnosis" className="rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-[var(--primary)] data-[state=active]:bg-transparent">
                  构建诊断
                </TabsTrigger>
                <TabsTrigger value="details" className="rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-[var(--primary)] data-[state=active]:bg-transparent">
                  构建详情
                </TabsTrigger>
              </TabsList>
              <TabsContent value="logs" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden p-3">
                <div className="min-h-0 flex-1">{logContent}</div>
              </TabsContent>
              <TabsContent value="diagnosis" className="mt-0 min-h-0 flex-1 overflow-y-auto p-4">
                {diagnosisContent}
              </TabsContent>
              <TabsContent value="details" className="mt-0 min-h-0 flex-1 overflow-y-auto p-4">
                {detailsContent}
              </TabsContent>
            </Tabs>
          </motion.aside>
        ) : null}
      </AnimatePresence>
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="flex h-[85vh] max-w-[90vw] flex-col p-0">
          <DialogHeader className="border-b border-[var(--border)] px-5 py-3">
            <DialogTitle>检查器</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-hidden p-4">{logContent}</div>
        </DialogContent>
      </Dialog>
    </>
  )
}
