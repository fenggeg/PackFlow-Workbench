import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card"
import {Checkbox} from "@/components/ui/checkbox"
import {Input} from "@/components/ui/input"
import {Tooltip, TooltipContent, TooltipTrigger,} from "@/components/ui/tooltip"
import {Info} from "lucide-react"
import {useAppStore} from "../../store/useAppStore"

const AddonHelp = ({ label, help }: { label: string; help: string }) => (
  <div className="flex items-center gap-1">
    <span>{label}</span>
    <Tooltip>
      <TooltipTrigger asChild>
        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
      </TooltipTrigger>
      <TooltipContent>{help}</TooltipContent>
    </Tooltip>
  </div>
)

const splitArgs = (value: string) =>
  value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)

const commonArgs = [
  {
    label: "强制更新依赖快照",
    value: "-U",
    tip: "强制检查远程仓库中的 SNAPSHOT 和 release 更新。",
  },
  {
    label: "离线构建",
    value: "-o",
    tip: "不访问远程仓库，仅使用本地 Maven 仓库。",
  },
  {
    label: "显示完整错误",
    value: "-e",
    tip: "构建失败时输出完整异常栈。",
  },
  {
    label: "调试日志",
    value: "-X",
    tip: "输出 Maven debug 日志，日志会明显变多。",
  },
  {
    label: "安静模式",
    value: "-q",
    tip: "减少 Maven 输出，排查问题时不建议使用。",
  },
  {
    label: "跳过集成测试",
    value: "-DskipITs",
    tip: "常见于 Failsafe 集成测试阶段。",
  },
]

const commonArgValues = commonArgs.map((item) => item.value)

export function BuildOptionsPanel() {
  const buildOptions = useAppStore((state) => state.buildOptions)
  const setBuildOption = useAppStore((state) => state.setBuildOption)
  const checkedCommonArgs = buildOptions.customArgs.filter((arg) =>
    commonArgValues.includes(arg),
  )
  const manualCustomArgs = buildOptions.customArgs.filter(
    (arg) => !commonArgValues.includes(arg),
  )

  const setCommonArgs = (values: string[]) => {
    setBuildOption("customArgs", [...manualCustomArgs, ...values])
  }

  const setManualArgs = (value: string) => {
    setBuildOption("customArgs", [...checkedCommonArgs, ...splitArgs(value)])
  }

  const goalOptions = [
    { label: "清理 clean", value: "clean" },
    { label: "打包 package", value: "package" },
    { label: "安装到本地仓库 install", value: "install" },
    { label: "校验 verify", value: "verify" },
  ]

  return (
    <Card className="panel-card">
      <CardHeader className="py-3">
        <CardTitle className="text-base">打包参数</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3.5">
        <span className="text-sm text-muted-foreground">
          默认已启用"同时构建依赖模块"和"跳过测试"，其余参数按需勾选。
        </span>

        <div className="option-block flex flex-col gap-1.5">
          <span className="text-sm font-medium">构建目标</span>
          <div className="flex flex-wrap gap-4">
            {goalOptions.map((opt) => (
              <label key={opt.value} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <Checkbox
                  checked={buildOptions.goals.includes(opt.value)}
                  onCheckedChange={(checked) => {
                    const next = checked
                      ? [...buildOptions.goals, opt.value]
                      : buildOptions.goals.filter((g) => g !== opt.value)
                    setBuildOption("goals", next)
                  }}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        <div className="option-block flex flex-col gap-1.5">
          <span className="text-sm font-medium">常用开关</span>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <Checkbox
                checked={buildOptions.alsoMake}
                onCheckedChange={(checked) =>
                  setBuildOption("alsoMake", checked === true)
                }
              />
              同时构建依赖模块 (-am){" "}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>同时构建目标模块依赖的上游模块。</TooltipContent>
              </Tooltip>
            </label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <Checkbox
                checked={buildOptions.skipTests}
                onCheckedChange={(checked) =>
                  setBuildOption("skipTests", checked === true)
                }
              />
              跳过测试 (-Dmaven.test.skip=true){" "}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>跳过测试编译和执行，适合本地快速打包。</TooltipContent>
              </Tooltip>
            </label>
          </div>
        </div>

        <div className="option-block flex flex-col gap-1.5">
          <span className="text-sm font-medium">附加参数</span>
          <div className="flex flex-col gap-2">
            {commonArgs.map((arg) => (
              <label
                key={arg.value}
                className="flex items-center gap-1.5 text-sm cursor-pointer"
              >
                <Checkbox
                  checked={checkedCommonArgs.includes(arg.value)}
                  onCheckedChange={(checked) => {
                    const next = checked
                      ? [...checkedCommonArgs, arg.value]
                      : checkedCommonArgs.filter((v) => v !== arg.value)
                    setCommonArgs(next)
                  }}
                />
                {arg.label} ({arg.value}){" "}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>{arg.tip}</TooltipContent>
                </Tooltip>
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <AddonHelp
            label="Profiles"
            help="填写 Maven profile，多个用逗号或空格分隔，最终会生成 -P 参数。"
          />
          <Input
            placeholder="例如 dev,test"
            value={buildOptions.profiles.join(",")}
            onChange={(event) =>
              setBuildOption("profiles", splitArgs(event.target.value))
            }
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <AddonHelp
            label="自定义"
            help="追加到 Maven 命令末尾的参数，例如 -DskipDocker 或 -Drevision=1.0.0。"
          />
          <Input
            placeholder="例如 -DskipDocker"
            value={manualCustomArgs.join(" ")}
            onChange={(event) => setManualArgs(event.target.value)}
          />
        </div>
      </CardContent>
    </Card>
  )
}