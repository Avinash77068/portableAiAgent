import { useEffect } from 'react'

export type ThemeMode = 'dark' | 'light' | 'system'

export function useTheme(theme: ThemeMode) {
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const applyTheme = (nextMode: ThemeMode) => {
      const resolved = nextMode === 'system' ? (mediaQuery.matches ? 'dark' : 'light') : nextMode
      document.documentElement.dataset.theme = resolved
    }
    applyTheme(theme)
    const listener = () => {
      if (theme === 'system') applyTheme('system')
    }
    mediaQuery.addEventListener('change', listener)
    return () => mediaQuery.removeEventListener('change', listener)
  }, [theme])
}
