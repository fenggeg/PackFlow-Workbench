import {CalendarDays, RefreshCw} from 'lucide-react'
import {useCallback, useEffect, useMemo, useState} from 'react'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {MonoText} from '@/components/ui/mono-text'
import {StatusPill} from '@/components/ui/status-pill'
import {fetchHolidays, type HolidayItem} from '@/services/holidayService'

const REFRESH_INTERVAL_MS = 60 * 60 * 1000

const toDate = (dateStr: string) => {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const diffDays = (from: Date, to: Date) => {
  const ms = to.getTime() - from.getTime()
  return Math.round(ms / (24 * 60 * 60 * 1000))
}

const startOfToday = () => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export function HolidayCountdownCard() {
  const [items, setItems] = useState<HolidayItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const year = new Date().getFullYear()
      const data = await fetchHolidays(year)
      setItems(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
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

  const upcoming = useMemo(() => {
    const today = startOfToday()
    return items
      .filter((item) => diffDays(today, toDate(item.date)) >= 0)
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [items])

  const nextHoliday = upcoming.find((item) => item.type === 'holiday')

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="size-4 text-[var(--muted-foreground)]" />
            节假日倒计时
          </span>
          <Button
            variant="ghost"
            size="iconSm"
            aria-label="刷新节假日"
            onClick={() => void refresh()}
            disabled={loading}
          >
            <RefreshCw className={loading ? 'animate-spin' : ''} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="flex min-h-16 items-center justify-center text-[13px] text-[var(--error)]">
            {error}
          </div>
        ) : loading && upcoming.length === 0 ? (
          <div className="flex min-h-16 items-center justify-center text-[13px] text-[var(--muted-foreground)]">
            正在获取节假日信息…
          </div>
        ) : upcoming.length === 0 ? (
          <div className="flex min-h-16 items-center justify-center text-[13px] text-[var(--muted-foreground)]">
            今年暂无节假日安排
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {nextHoliday ? (
              <div className="flex items-center gap-2">
                <StatusPill tone="success">{nextHoliday.name}</StatusPill>
                <MonoText className="text-[20px] font-semibold leading-7 text-[var(--foreground)]">
                  {diffDays(startOfToday(), toDate(nextHoliday.date))} 天后
                </MonoText>
                <span className="text-[12px] text-[var(--muted-foreground)]">
                  {nextHoliday.date}
                </span>
              </div>
            ) : null}
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {upcoming.slice(0, 6).map((item) => {
                const days = diffDays(startOfToday(), toDate(item.date))
                const isToday = days === 0
                return (
                  <li
                    key={item.date}
                    className="flex items-center justify-between gap-2 text-[12px]"
                  >
                    <span className="flex items-center gap-1.5">
                      <StatusPill tone={item.type === 'holiday' ? 'success' : 'warning'}>
                        {item.type === 'holiday' ? '休' : '班'}
                      </StatusPill>
                      <span className="text-[var(--foreground)]">{item.name}</span>
                      <span className="text-[var(--muted-foreground)]">{item.date}</span>
                    </span>
                    <span className="text-[var(--muted-foreground)]">
                      {isToday ? '今天' : `${days} 天后`}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}