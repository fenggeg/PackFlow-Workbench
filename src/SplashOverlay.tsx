import type {CSSProperties} from 'react'

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#f8fafc',
  zIndex: 99999,
  opacity: 1,
  transition: 'opacity 0.35s ease-out',
  pointerEvents: 'auto',
}

const iconBoxStyle: CSSProperties = {
  width: 64,
  height: 64,
  borderRadius: 16,
  background: 'linear-gradient(135deg,#16a34a,#15803d)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: 24,
  boxShadow: '0 8px 24px rgba(22,163,74,0.25)',
}

const titleStyle: CSSProperties = {
  fontFamily: "Inter,'Segoe UI','Microsoft YaHei',system-ui,sans-serif",
  fontSize: 20,
  fontWeight: 600,
  color: '#111827',
  letterSpacing: '-0.025em',
}

const spinnerStyle: CSSProperties = {
  marginTop: 32,
  width: 36,
  height: 36,
  border: '3px solid #e5e7eb',
  borderTopColor: '#16a34a',
  borderRadius: '50%',
  animation: 'splash-spin-fb 0.8s linear infinite',
}

export function SplashOverlay({visible}: {visible: boolean}) {
  return (
    <div
      style={{
        ...overlayStyle,
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <div style={iconBoxStyle}>
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
      </div>
      <div style={titleStyle}>打包部署工作台</div>
      <div style={spinnerStyle} />
    </div>
  )
}
