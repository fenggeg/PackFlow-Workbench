import {Button, Card, message, Space, Typography} from 'antd'
import {CodeOutlined, ReloadOutlined} from '@ant-design/icons'
import {useCallback, useEffect, useRef, useState} from 'react'
import {Terminal} from 'xterm'
import {FitAddon} from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import {api} from '../../../services/tauri-api'
import type {ServerProfile} from '../../../types/domain'

const {Text} = Typography

interface RemoteTerminalTabProps {
  server: ServerProfile
  onConnected?: () => Promise<void>
}

interface TerminalMenuState {
  open: boolean
  x: number
  y: number
}

export function RemoteTerminalTab({server, onConnected}: RemoteTerminalTabProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [connected, setConnected] = useState(false)
  const [menu, setMenu] = useState<TerminalMenuState>({open: false, x: 0, y: 0})
  const initializedRef = useRef(false)

  const focusTerminal = useCallback(() => {
    queueMicrotask(() => {
      xtermRef.current?.focus()
    })
  }, [])

  const copySelection = useCallback(async () => {
    const terminal = xtermRef.current
    const selection = terminal?.getSelection()
    if (!selection) {
      message.info('请先选中要复制的终端内容')
      return
    }
    try {
      await navigator.clipboard.writeText(selection)
      terminal?.clearSelection()
      message.success('已复制选中内容')
    } catch (error) {
      message.error(`复制失败：${error}`)
    }
  }, [])

  const pasteFromClipboard = useCallback(async () => {
    const terminal = xtermRef.current
    if (!terminal || !sessionIdRef.current) {
      return
    }
    try {
      const text = await navigator.clipboard.readText()
      if (!text) {
        return
      }
      const bytes = Array.from(new TextEncoder().encode(text))
      await api.writeTerminalInput(sessionIdRef.current, bytes)
      terminal.focus()
    } catch (error) {
      message.error(`粘贴失败：${error}`)
    }
  }, [])

  const cleanup = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    if (sessionIdRef.current) {
      void api.closeTerminalSession(sessionIdRef.current)
      sessionIdRef.current = null
    }
    if (xtermRef.current) {
      xtermRef.current.dispose()
      xtermRef.current = null
    }
    fitAddonRef.current = null
    setConnected(false)
    setMenu({open: false, x: 0, y: 0})
    initializedRef.current = false
  }, [])

  const startPolling = useCallback((sessionId: string, terminal: Terminal) => {
    pollIntervalRef.current = setInterval(async () => {
      try {
        const output = await api.readTerminalOutput(sessionId)
        if (output.length > 0) {
          const text = new TextDecoder().decode(new Uint8Array(output))
          terminal.write(text)
        }
      } catch (error) {
        console.error('读取终端输出失败：', error)
      }
    }, 50)
  }, [])

  const connect = useCallback(async () => {
    if (!terminalRef.current || initializedRef.current) return

    cleanup()
    setConnecting(true)
    initializedRef.current = true

    try {
      const terminal = new Terminal({
        cursorBlink: true,
        cursorStyle: 'bar',
        fontSize: 14,
        fontFamily: 'Consolas, Monaco, "Courier New", monospace',
        allowTransparency: true,
        disableStdin: false,
        theme: {
          background: '#1e1e1e',
          foreground: '#d4d4d4',
          cursor: '#d4d4d4',
          selectionBackground: '#264f78',
          black: '#000000',
          red: '#f44747',
          green: '#4ec9b0',
          yellow: '#ffa500',
          blue: '#569cd6',
          magenta: '#c586c0',
          cyan: '#4fc1ff',
          white: '#d4d4d4',
          brightBlack: '#808080',
          brightRed: '#f44747',
          brightGreen: '#4ec9b0',
          brightYellow: '#ffa500',
          brightBlue: '#569cd6',
          brightMagenta: '#c586c0',
          brightCyan: '#4fc1ff',
          brightWhite: '#ffffff',
        },
      })

      terminal.attachCustomKeyEventHandler((event) => {
        if (event.type !== 'keydown') {
          return true
        }

        const key = event.key.toLowerCase()
        const ctrlOrMeta = event.ctrlKey || event.metaKey
        if (ctrlOrMeta && key === 'c' && terminal.hasSelection()) {
          void copySelection()
          return false
        }
        if (ctrlOrMeta && event.shiftKey && key === 'c') {
          void copySelection()
          return false
        }
        if (ctrlOrMeta && event.shiftKey && key === 'v') {
          void pasteFromClipboard()
          return false
        }
        return true
      })

      const fitAddon = new FitAddon()
      terminal.loadAddon(fitAddon)

      terminal.open(terminalRef.current)

      await new Promise((resolve) => setTimeout(resolve, 100))
      fitAddon.fit()
      terminal.focus()

      const cols = terminal.cols
      const rows = terminal.rows

      const sessionId = await api.createTerminalSession(server.id, cols, rows)
      sessionIdRef.current = sessionId
      xtermRef.current = terminal
      fitAddonRef.current = fitAddon

      terminal.onData((data) => {
        if (sessionIdRef.current) {
          const bytes = Array.from(new TextEncoder().encode(data))
          void api.writeTerminalInput(sessionIdRef.current, bytes)
        }
      })

      terminal.onResize(({cols, rows}) => {
        if (sessionIdRef.current) {
          void api.resizeTerminal(sessionIdRef.current, cols, rows)
        }
      })

      startPolling(sessionId, terminal)

      setConnected(true)
      message.success('终端连接成功')
      focusTerminal()
      void onConnected?.()
    } catch (error) {
      message.error(`连接失败：${error}`)
      cleanup()
    } finally {
      setConnecting(false)
    }
  }, [server.id, cleanup, copySelection, focusTerminal, onConnected, pasteFromClipboard, startPolling])

  useEffect(() => {
    queueMicrotask(() => void connect())
    return cleanup
  }, [connect, cleanup])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(() => {
      if (fitAddonRef.current && xtermRef.current) {
        try {
          fitAddonRef.current.fit()
        } catch {
          // ignore fit errors during resize
        }
      }
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!menu.open) {
      return undefined
    }
    const close = () => setMenu((current) => ({...current, open: false}))
    window.addEventListener('click', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', close)
    }
  }, [menu.open])

  return (
    <Card
      title={
        <Space>
          <CodeOutlined />
          <span>远程终端</span>
          <Text type="secondary">{server.host}</Text>
          {connected && <Text type="success">已连接</Text>}
          {connecting && <Text type="warning">连接中...</Text>}
        </Space>
      }
      size="small"
      extra={
        <Space>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={() => {
              cleanup()
              void connect()
            }}
            loading={connecting}
          >
            重新连接
          </Button>
          <Button
            size="small"
            danger
            onClick={cleanup}
            disabled={!connected}
          >
            断开
          </Button>
        </Space>
      }
    >
      <div
        ref={containerRef}
        onMouseDown={focusTerminal}
        onContextMenu={(event) => {
          event.preventDefault()
          focusTerminal()
          setMenu({open: true, x: event.clientX, y: event.clientY})
        }}
        style={{
          height: '500px',
          overflow: 'hidden',
          borderRadius: '4px',
          border: '1px solid #303030',
        }}
      >
        <div
          ref={terminalRef}
          style={{
            width: '100%',
            height: '100%',
          }}
        />
        {menu.open ? (
          <div
            className="terminal-context-menu"
            style={{left: menu.x, top: menu.y}}
            onMouseDown={(event) => event.preventDefault()}
          >
            <button type="button" onClick={() => { setMenu({...menu, open: false}); void copySelection() }}>
              复制选中内容
            </button>
            <button type="button" onClick={() => { setMenu({...menu, open: false}); void pasteFromClipboard() }}>
              粘贴
            </button>
            <button type="button" onClick={() => { xtermRef.current?.selectAll(); setMenu({...menu, open: false}) }}>
              全选
            </button>
            <button type="button" onClick={() => { xtermRef.current?.clear(); setMenu({...menu, open: false}); focusTerminal() }}>
              清屏
            </button>
          </div>
        ) : null}
      </div>
    </Card>
  )
}
