import {Minus, Square, X} from 'lucide-react'
import {useState} from 'react'
import {cn} from '@/lib/utils'
import {isTauriRuntime} from '@/services/tauri-api'

type WindowAction = 'minimize' | 'maximize' | 'close'

async function handleWindowAction(action: WindowAction) {
  if (!isTauriRuntime()) return
  try {
    const {getCurrentWindow} = await import('@tauri-apps/api/window')
    const win = getCurrentWindow()
    if (action === 'minimize') await win.minimize()
    else if (action === 'maximize') {
      const maximized = await win.isMaximized()
      if (maximized) await win.unmaximize()
      else await win.maximize()
    } else await win.close()
  } catch {
    // ignore when not running under Tauri
  }
}

export function TitleBarControls() {
  const [hover, setHover] = useState<'min' | 'max' | 'close' | null>(null)

  return (
    <div className="flex h-full items-stretch">
      <button
        type="button"
        aria-label="最小化"
        className={cn(
          'flex w-11 items-center justify-center transition-colors duration-150',
          hover === 'min' ? 'bg-[var(--accent)]' : 'bg-transparent',
        )}
        onMouseEnter={() => setHover('min')}
        onMouseLeave={() => setHover(null)}
        onClick={() => void handleWindowAction('minimize')}
      >
        <Minus className="size-3.5 text-[var(--muted-foreground)]" />
      </button>
      <button
        type="button"
        aria-label="最大化"
        className={cn(
          'flex w-11 items-center justify-center transition-colors duration-150',
          hover === 'max' ? 'bg-[var(--accent)]' : 'bg-transparent',
        )}
        onMouseEnter={() => setHover('max')}
        onMouseLeave={() => setHover(null)}
        onClick={() => void handleWindowAction('maximize')}
      >
        <Square className="size-3 text-[var(--muted-foreground)]" />
      </button>
      <button
        type="button"
        aria-label="关闭"
        className={cn(
          'flex w-11 items-center justify-center transition-colors duration-150',
          hover === 'close' ? 'bg-[var(--error)]' : 'bg-transparent',
        )}
        onMouseEnter={() => setHover('close')}
        onMouseLeave={() => setHover(null)}
        onClick={() => void handleWindowAction('close')}
      >
        <X className={cn('size-3.5', hover === 'close' ? 'text-white' : 'text-[var(--muted-foreground)]')} />
      </button>
    </div>
  )
}
