import {Info} from 'lucide-react'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Checkbox} from '@/components/ui/checkbox'
import {Input} from '@/components/ui/input'
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip'
import {useAppStore} from '@/store/useAppStore'
import {splitArgs} from '@/utils/format'

function HelpTip({help}: {help: string}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex text-[var(--muted-foreground)]" aria-label="说明">
          <Info className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{help}</TooltipContent>
    </Tooltip>
  )
}

const commonArgs = [
  {
    label: '强制更新依赖快照',
    value: '-U',
    tip: '强制检查远程仓库中的 SNAPSHOT 和 release 更新。',
  },
  {
    label: '离线构建',
    value: '-o',
    tip: '不访问远程仓库，仅使用本地 Maven 仓库。',
  },
  {
    label: '显示完整错误',
    value: '-e',
    tip: '构建失败时输出完整异常栈。',
  },
  {
    label: '调试日志',
    value: '-X',
    tip: '输出 Maven debug 日志，日志会明显变多。',
  },
  {
    label: '安静模式',
    value: '-q',
    tip: '减少 Maven 输出，排查问题时不建议使用。',
  },
  {
    label: '跳过集成测试',
    value: '-DskipITs',
    tip: '常见于 Failsafe 集成测试阶段。',
  },
]

const goalOptions = [
  {label: '清理 clean', value: 'clean'},
  {label: '打包 package', value: 'package'},
  {label: '安装到本地仓库 install', value: 'install'},
  {label: '校验 verify', value: 'verify'},
]

export function BuildOptionsPanel() {
  const buildOptions = useAppStore((state) => state.buildOptions)
  const setBuildOption = useAppStore((state) => state.setBuildOption)
  const setGoals = useAppStore((state) => state.setGoals)
  const setCommonArgs = useAppStore((state) => state.setCommonArgs)
  const setExtraArgs = useAppStore((state) => state.setExtraArgs)

  // 预设开关与手写参数分开存储，互不覆盖；顺序由 store 归一化保证
  const checkedCommonArgs = buildOptions.commonArgs ?? []
  const extraArgs = buildOptions.extraArgs ?? []

  const toggleCommonArg = (value: string, checked: boolean) => {
    setCommonArgs(
      checked
        ? [...checkedCommonArgs, value]
        : checkedCommonArgs.filter((arg) => arg !== value),
    )
  }

  const toggleGoal = (value: string, checked: boolean) => {
    setGoals(
      checked
        ? [...buildOptions.goals, value]
        : buildOptions.goals.filter((goal) => goal !== value),
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>打包参数</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3.5">
        <p className="m-0 text-[13px] text-[var(--muted-foreground)]">
          默认已启用「同时构建依赖模块」和「跳过测试」，其余参数按需勾选。目标按 Maven 生命周期自动排序。
        </p>

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium">构建目标</span>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {goalOptions.map((opt) => (
              <label key={opt.value} className="flex cursor-pointer items-center gap-2 text-[13px]">
                <Checkbox
                  checked={buildOptions.goals.includes(opt.value)}
                  onCheckedChange={(checked) => toggleGoal(opt.value, checked === true)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium">常用开关</span>
          <label className="flex cursor-pointer items-center gap-2 text-[13px]">
            <Checkbox
              checked={buildOptions.alsoMake}
              onCheckedChange={(v) => setBuildOption('alsoMake', v === true)}
            />
            同时构建依赖模块 (-am)
            <HelpTip help="同时构建目标模块依赖的上游模块。" />
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[13px]">
            <Checkbox
              checked={buildOptions.skipTests}
              onCheckedChange={(v) => setBuildOption('skipTests', v === true)}
            />
            跳过测试 (-Dmaven.test.skip=true)
            <HelpTip help="跳过测试编译和执行，适合本地快速打包。" />
          </label>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium">附加参数</span>
          {commonArgs.map((arg) => (
            <label key={arg.value} className="flex cursor-pointer items-center gap-2 text-[13px]">
              <Checkbox
                checked={checkedCommonArgs.includes(arg.value)}
                onCheckedChange={(checked) => toggleCommonArg(arg.value, checked === true)}
              />
              {arg.label} ({arg.value})
              <HelpTip help={arg.tip} />
            </label>
          ))}
        </div>

        <label className="flex flex-col gap-1.5 text-[13px]">
          <span className="flex items-center gap-1.5 font-medium">
            Profiles
            <HelpTip help="填写 Maven profile，多个用逗号或空格分隔，最终会生成 -P 参数。" />
          </span>
          <Input
            placeholder="例如 dev,test"
            value={buildOptions.profiles.join(',')}
            onChange={(event) => setBuildOption('profiles', splitArgs(event.target.value))}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px]">
          <span className="flex items-center gap-1.5 font-medium">
            自定义
            <HelpTip help="追加到 Maven 命令末尾的参数，例如 -DskipDocker 或 -Drevision=1.0.0。线程数请在「高级参数」中设置。" />
          </span>
          <Input
            placeholder="例如 -DskipDocker"
            value={extraArgs.join(' ')}
            onChange={(event) => setExtraArgs(splitArgs(event.target.value))}
          />
        </label>
      </CardContent>
    </Card>
  )
}
