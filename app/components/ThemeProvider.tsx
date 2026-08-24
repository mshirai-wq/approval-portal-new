'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

type Theme = 'dark' | 'light'

interface ThemeContextType {
  theme: Theme
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  toggle: () => {}
})

function getSavedTheme(): Theme | null {
  if (typeof window === 'undefined') return null
  try {
    const saved = localStorage.getItem('theme')
    return saved === 'light' || saved === 'dark' ? saved : null
  } catch {
    return null
  }
}

function setSavedTheme(theme: Theme) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem('theme', theme)
  } catch {
    // ストレージが無効/満杯の場合は無視
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    const initial = getSavedTheme() ?? 'dark'
    setTheme(initial)
    document.documentElement.classList.toggle('light', initial === 'light')
  }, [])

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    setSavedTheme(next)
    document.documentElement.classList.toggle('light', next === 'light')
  }

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
