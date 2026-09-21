import {Globe, RefreshCw, Wifi, WifiOff} from 'lucide-react'
import {useCallback, useEffect, useState} from 'react'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {MonoText} from '@/components/ui/mono-text'
import {StatusPill} from '@/components/ui/status-pill'
import {api} from '@/services/tauri-api'
import {describeError} from '@/store/useFeedbackStore'
import type {NetworkInfo} from '@/types/domain'

const REFRESH_INTERVAL_MS = 60_000

export function NetworkStatusCard() {
  const [info, setInfo] = useState<NetworkInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const result = await api.getNetworkInfo()
      setInfo(result)
      setError(null)
    } catch (err) {
      setError(describeError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0)
    const timer = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(timer)
    }
  }, [refresh])

  const location = [info?.country, info?.province, info?.city].filter(Boolean).join(' · ')

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Globe className="size-4 text-[var(--muted-foreground)]" />
            网络状态
          </span>
          <Button
            variant="ghost"
            size="iconSm"
            aria-label="刷新网络状态"
            onClick={() => void refresh()}
            disabled={loading}
          >
            <RefreshCw className={loading ? 'animate-spin' : ''} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <WifiOff className="size-4 text-[var(--error)]" />
              <StatusPill tone="error">网络不可用</StatusPill>
            </div>
            <span className="text-[12px] text-[var(--muted-foreground)]">{error}</span>
          </div>
        ) : info ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <Wifi className="size-4 text-[var(--success)]" />
              <StatusPill tone="success">已连接</StatusPill>
              <MonoText className="text-[12px]">{info.ip}</MonoText>
            </div>
            {location ? (
              <span className="text-[12px] text-[var(--muted-foreground)]">{location}</span>
            ) : null}
            <div className="flex flex-wrap gap-1.5">
              {info.isp ? <StatusPill>ISP：{info.isp}</StatusPill> : null}
              {info.timeZone ? <StatusPill>时区：{info.timeZone}</StatusPill> : null}
              {info.network ? <StatusPill>网段：{info.network}</StatusPill> : null}
            </div>
          </div>
        ) : (
          <div className="flex min-h-16 items-center justify-center text-[13px] text-[var(--muted-foreground)]">
            正在获取网络信息…
          </div>
        )}
      </CardContent>
    </Card>
  )
}