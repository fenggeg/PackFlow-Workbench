import {Moon, Sun} from 'lucide-react'
import {useEffect} from 'react'
import {Button} from '@/components/ui/button'
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip'
import {applyTheme, resolveDark, useThemeStore} from '@/store/useThemeStore'

export function ThemeToggle() {
  const mode = useThemeStore((state) => state.mode)
  const toggle = useThemeStore((state) => state.toggle)
  const isDark = resolveDark(mode)

  useEffect(() => {
    applyTheme(mode)
    if (mode !== 'system' || typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [mode])

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="iconSm"
          aria-label={isDark ? '切换为浅色主题' : '切换为深色主题'}
          onClick={toggle}
        >
          {isDark ? <Sun /> : <Moon />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{isDark ? '浅色主题' : '深色主题'}</TooltipContent>
    </Tooltip>
  )
}
