'use client'
import { createContext, useContext, useEffect, useState, useCallback } from 'react'

type AdminTheme = 'dark' | 'light'

const Ctx = createContext<{ theme: AdminTheme; toggle: () => void }>({
  theme: 'dark',
  toggle: () => {},
})

export const useAdminTheme = () => useContext(Ctx)

export function AdminThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<AdminTheme>('dark')

  useEffect(() => {
    const stored = localStorage.getItem('admin-theme') as AdminTheme | null
    if (stored === 'dark' || stored === 'light') setTheme(stored)
  }, [])

  const toggle = useCallback(() => {
    setTheme(t => {
      const next = t === 'dark' ? 'light' : 'dark'
      localStorage.setItem('admin-theme', next)
      return next
    })
  }, [])

  return (
    <Ctx.Provider value={{ theme, toggle }}>
      <div data-admin-theme={theme} className="contents">
        {children}
      </div>
    </Ctx.Provider>
  )
}
