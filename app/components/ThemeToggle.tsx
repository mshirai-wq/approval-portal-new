'use client'

import { Sun, Moon } from 'lucide-react'
import { useTheme } from './ThemeProvider'

export function ThemeToggle() {
  const { theme, toggle } = useTheme()

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
      className="fixed top-4 right-4 z-50 p-2.5 rounded-full bg-slate-800/80 text-slate-100 border border-slate-700/50 hover:bg-slate-700/80 transition-colors backdrop-blur-sm shadow-lg"
    >
      {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  )
}
