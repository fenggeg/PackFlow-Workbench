import {useMemo} from "react"
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card"
import {Input} from "@/components/ui/input"
import {Textarea} from "@/components/ui/textarea"
import {useAppStore} from "../../store/useAppStore"

const splitArgs = (value: string) =>
  value
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)

const withoutThreadArg = (args: string[]) =>
  args.filter((arg) => arg !== "-T" && !arg.startsWith("-T"))

const getThreadCount = (args: string[]) => {
  const inline = args.find((arg) => /^-T\S+/.test(arg))
  if (inline) {
    const value = Number(inline.slice(2))
    return Number.isFinite(value) ? value : undefined
  }

  const flagIndex = args.indexOf("-T")
  if (flagIndex >= 0) {
    const value = Number(args[flagIndex + 1])
    return Number.isFinite(value) ? value : undefined
  }

  return undefined
}

export function AdvancedOptionsPanel() {
  const buildOptions = useAppStore((state) => state.buildOptions)
  const setBuildOption = useAppStore((state) => state.setBuildOption)
  const customArgs = buildOptions.customArgs
  const threadCount = useMemo(() => getThreadCount(customArgs), [customArgs])
  const properties = buildOptions.properties

  const setProperty = (key: string, value?: string) => {
    const next = { ...properties }
    if (value?.trim()) {
      next[key] = value.trim()
    } else {
      delete next[key]
    }
    setBuildOption("properties", next)
  }

  const setThreadCount = (value: string) => {
    const num = value === "" ? null : Number(value)
    const nextArgs = withoutThreadArg(customArgs)
    if (num) {
      nextArgs.push(`-T${num}`)
    }
    setBuildOption("customArgs", nextArgs)
  }

  return (
    <Card className="panel-card">
      <CardHeader className="py-3">
        <CardTitle className="text-base">高级参数</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3.5">
        <p className="text-sm text-muted-foreground">
          这里的配置会参与最终命令生成，适合覆盖本地仓库、线程数或追加 Maven 原生参数。
        </p>

        <div className="option-block flex flex-col gap-1.5">
          <span className="text-sm font-medium">本地仓库覆盖</span>
          <Input
            placeholder="例如 D:\maven-repo"
            value={String(properties["maven.repo.local"] ?? "")}
            onChange={(event) =>
              setProperty("maven.repo.local", event.target.value)
            }
          />
        </div>

        <div className="option-block flex flex-col gap-1.5">
          <span className="text-sm font-medium">版本号 / revision</span>
          <Input
            placeholder="例如 1.0.0-SNAPSHOT"
            value={String(properties.revision ?? "")}
            onChange={(event) => setProperty("revision", event.target.value)}
          />
        </div>

        <div className="option-block flex flex-col gap-1.5">
          <span className="text-sm font-medium">并行构建线程数</span>
          <Input
            type="number"
            min={1}
            max={16}
            placeholder="不启用"
            value={threadCount ?? ""}
            onChange={(event) => setThreadCount(event.target.value)}
          />
        </div>

        <div className="option-block flex flex-col gap-1.5">
          <span className="text-sm font-medium">追加 Maven 参数</span>
          <Textarea
            rows={4}
            className="command-textarea"
            placeholder="例如 -DskipDocker -Denv=dev"
            value={customArgs.join(" ")}
            onChange={(event) =>
              setBuildOption("customArgs", splitArgs(event.target.value))
            }
          />
        </div>
      </CardContent>
    </Card>
  )
}