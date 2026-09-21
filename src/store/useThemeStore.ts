import {create} from 'zustand'
import {persist} from 'zustand/middleware'

export type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeState {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
  toggle: () => void
}

const prefersDark = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches

export const resolveDark = (mode: ThemeMode) => (mode === 'system' ? prefersDark() : mode === 'dark')

export const applyTheme = (mode: ThemeMode) => {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', resolveDark(mode))
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'system',
      setMode: (mode) => {
        set({mode})
        applyTheme(mode)
      },
      toggle: () => {
        const next: ThemeMode = resolveDark(get().mode) ? 'light' : 'dark'
        set({mode: next})
        applyTheme(next)
      },
    }),
    {name: 'app-theme'},
  ),
)
