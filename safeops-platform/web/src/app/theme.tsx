import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

type Theme = 'light' | 'dark'
const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'light', toggle: () => {} })

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  )

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    // Remembering the choice is a convenience. Storage can be blocked (a locked-down or
    // private browser), and that must not take the app down with it.
    try { localStorage.setItem('safeops.theme', theme) } catch { /* not remembered */ }
  }, [theme])

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])
  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
