import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// 仅屏蔽窗口空白区域的右键菜单；输入控件与标记了 data-allow-context-menu 的区域保留（日志/命令需要右键复制）
document.addEventListener('contextmenu', (event) => {
  const target = event.target as HTMLElement | null
  if (!target) return
  if (target.closest('input, textarea, [contenteditable="true"], [data-allow-context-menu]')) return
  event.preventDefault()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
