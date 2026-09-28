import {Check, RotateCcw} from 'lucide-react'
import {useState} from 'react'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {PageHeader} from '@/components/ui/page-header'
import {NavigationSettings} from '@/components/NavigationSettings/NavigationSettings'
import {usePreferencesStore} from '@/store/usePreferencesStore'
import {useUpdateStore} from '@/store/useUpdateStore'
import {useThemeStore, type ThemeMode} from '@/store/useThemeStore'
import {notifySuccess} from '@/store/useFeedbackStore'
import {cn} from '@/lib/utils'

/** 设置行：标题 + 说明 + 右侧开关，样式与导航栏设置里的开关保持一致 */
function SwitchRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string
  description?: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13px] font-medium text-[var(--foreground)]">{title}</span>
        {description ? (
          <span className="text-[12px] text-[var(--muted-foreground)]">{description}</span>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors',
          checked ? 'bg-[var(--primary)]' : 'bg-[var(--border-strong)]',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-4 rounded-full bg-[var(--background)] transition-all',
            checked ? 'right-0.5' : 'left-0.5',
          )}
        />
      </button>
    </div>
  )
}

const themeOptions: Array<{value: ThemeMode; label: string}> = [
  {value: 'light', label: '浅色'},
  {value: 'dark', label: '深色'},
  {value: 'system', label: '跟随系统'},
]

export function SettingsPage() {
  const mode = useThemeStore((state) => state.mode)
  const setThemeMode = useThemeStore((state) => state.setMode)
  const logWrap = usePreferencesStore((state) => state.logWrap)
  const setLogWrap = usePreferencesStore((state) => state.setLogWrap)
  const logAutoScroll = usePreferencesStore((state) => state.logAutoScroll)
  const setLogAutoScroll = usePreferencesStore((state) => state.setLogAutoScroll)
  const desktopNotification = usePreferencesStore((state) => state.desktopNotification)
  const setDesktopNotification = usePreferencesStore((state) => state.setDesktopNotification)
  const completionSound = usePreferencesStore((state) => state.completionSound)
  const setCompletionSound = usePreferencesStore((state) => state.setCompletionSound)
  const autoCheckUpdate = usePreferencesStore((state) => state.autoCheckUpdate)
  const setAutoCheckUpdate = usePreferencesStore((state) => state.setAutoCheckUpdate)
  const resetPreferences = usePreferencesStore((state) => state.resetToDefault)
  const currentVersion = useUpdateStore((state) => state.currentVersion)
  const updateInfo = useUpdateStore((state) => state.update)
  const updateChecking = useUpdateStore((state) => state.checking)
  const checkUpdate = useUpdateStore((state) => state.checkUpdate)
  const openUpdateDialog = useUpdateStore((state) => state.openDialog)
  const [navOpen, setNavOpen] = useState(false)

  return (
    <section className="mx-auto w-full max-w-[1180px] p-4 lg:p-6">
      <PageHeader title="设置" description="个性化工作台行为，偏好自动保存在本机。" />
      <div className="grid items-start gap-3 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
        <Card>
          <CardHeader>
            <CardTitle>外观</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[13px] font-medium text-[var(--foreground)]">主题</span>
                <span className="text-[12px] text-[var(--muted-foreground)]">跟随系统时自动切换浅色 / 深色</span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {themeOptions.map((option) => (
                  <Button
                    key={option.value}
                    variant={mode === option.value ? 'primary' : 'ghost'}
                    size="sm"
                    onClick={() => setThemeMode(option.value)}
                    aria-pressed={mode === option.value}
                  >
                    {mode === option.value ? <Check className="size-3.5" /> : null}
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>构建日志</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5">
            <SwitchRow
              title="日志自动换行"
              description="长行折行显示，保留原始对齐时可通过日志工具栏临时切换"
              checked={logWrap}
              onChange={setLogWrap}
            />
            <SwitchRow
              title="自动滚动跟随"
              description="有新输出时自动滚到日志底部；向上翻阅会自动暂停跟随"
              checked={logAutoScroll}
              onChange={setLogAutoScroll}
            />
          </CardContent>
        </Card>

        </div>
        <div className="flex flex-col gap-3">
        <Card>
          <CardHeader>
            <CardTitle>通知与提醒</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5">
            <SwitchRow
              title="构建结束系统通知"
              description="打包完成或失败时发送系统通知（需要允许通知权限）"
              checked={desktopNotification}
              onChange={setDesktopNotification}
            />
            <SwitchRow
              title="构建结束提示音"
              description="完成播放高音提示，失败播放低音提示"
              checked={completionSound}
              onChange={setCompletionSound}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>更新</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[13px] font-medium text-[var(--foreground)]">当前版本</span>
                <span className="truncate font-[family-name:var(--font-mono)] text-[12px] text-[var(--muted-foreground)]">
                  v{currentVersion || '未知'}
                </span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                disabled={updateChecking}
                onClick={() => void checkUpdate(false)}
              >
                {updateChecking ? '检查中…' : '检查更新'}
              </Button>
            </div>
            {updateInfo ? (
              <div className="flex items-center justify-between gap-4 rounded-[var(--radius)] border border-[var(--info)]/40 bg-[var(--info)]/5 px-3 py-2.5">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[13px] font-medium text-[var(--foreground)]">
                    发现新版本 v{updateInfo.version}
                  </span>
                  <span className="text-[12px] text-[var(--muted-foreground)]">点击查看更新日志并安装</span>
                </div>
                <Button variant="primary" size="sm" onClick={() => openUpdateDialog()}>
                  查看更新
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>通用</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5">
            <SwitchRow
              title="自动检查更新"
              description="启动时与运行期间静默检查新版本；仍可在顶部手动检查"
              checked={autoCheckUpdate}
              onChange={setAutoCheckUpdate}
            />
            <div className="flex items-center justify-between gap-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[13px] font-medium text-[var(--foreground)]">导航栏</span>
                <span className="text-[12px] text-[var(--muted-foreground)]">调整功能顺序、显隐与启动默认页</span>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setNavOpen(true)}>
                自定义导航栏
              </Button>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[13px] font-medium text-[var(--foreground)]">恢复默认偏好</span>
                <span className="text-[12px] text-[var(--muted-foreground)]">重置本页的日志、通知与更新开关（不影响主题与导航栏）</span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  resetPreferences()
                  notifySuccess('已恢复默认偏好')
                }}
              >
                <RotateCcw className="size-3.5" />
                恢复默认
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
      <NavigationSettings open={navOpen} onClose={() => setNavOpen(false)} />
    </section>
  )
}
