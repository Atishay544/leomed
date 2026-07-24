'use client'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sun, Moon } from 'lucide-react'
import { useAdminTheme } from './AdminThemeProvider'

export function AdminThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useAdminTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  if (!mounted) return <div className="w-8 h-8 rounded-xl shrink-0" />

  return (
    <button
      onClick={toggle}
      className={`relative p-2 rounded-xl transition-all duration-200 overflow-hidden shrink-0
        text-white/35 hover:text-white/75 hover:bg-white/5.5 ${className}`}
      aria-label="Toggle theme"
    >
      <AnimatePresence mode="wait" initial={false}>
        {theme === 'dark' ? (
          <motion.span
            key="moon"
            initial={{ rotate: -90, scale: 0, opacity: 0 }}
            animate={{ rotate: 0,   scale: 1, opacity: 1 }}
            exit={{    rotate:  90, scale: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="block"
          >
            <Moon size={18} />
          </motion.span>
        ) : (
          <motion.span
            key="sun"
            initial={{ rotate: 90,  scale: 0, opacity: 0 }}
            animate={{ rotate: 0,   scale: 1, opacity: 1 }}
            exit={{    rotate: -90, scale: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="block"
          >
            <Sun size={18} />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  )
}
