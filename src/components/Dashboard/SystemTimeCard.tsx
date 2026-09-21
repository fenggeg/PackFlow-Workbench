import {Clock} from 'lucide-react'
import {useEffect, useState} from 'react'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {MonoText} from '@/components/ui/mono-text'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

const formatTime = (date: Date) =>
  date.toLocaleTimeString('zh-CN', {hour12: false})

const formatDate = (date: Date) =>
  `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 星期${WEEKDAYS[date.getDay()]}`

export function SystemTimeCard() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <Clock className="size-4 text-[var(--muted-foreground)]" />
          系统时间
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-1">
          <MonoText className="text-[24px] font-semibold leading-8 tracking-[-0.01em] text-[var(--foreground)]">
            {formatTime(now)}
          </MonoText>
          <span className="text-[12px] text-[var(--muted-foreground)]">{formatDate(now)}</span>
        </div>
      </CardContent>
    </Card>
  )
}