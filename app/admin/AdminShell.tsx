'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, ExternalLink, Menu, X } from 'lucide-react'
import AdminNav from './AdminNav'
import { AdminThemeToggle } from './AdminThemeToggle'

interface AdminShellProps {
  children: React.ReactNode
  displayName: string
  email: string
  initials: string
}

export default function AdminShell({ children, displayName, email, initials }: AdminShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Close drawer on route change (handled via AdminNav onNavigate prop)
  const closeDrawer = () => setDrawerOpen(false)

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [drawerOpen])

  const sidebarContent = (
    <>
      {/* User header */}
      <div className="px-4 pt-5 pb-3.5">
        <div className="flex items-center gap-3">
          <div className="
            w-8 h-8 rounded-full shrink-0 flex items-center justify-center
            text-white text-[11px] font-bold tracking-wide
            bg-linear-to-br from-emerald-600 via-teal-600 to-green-800
            shadow-[0_0_12px_rgba(16,185,129,0.5)] ring-1 ring-white/10
          ">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white text-[13px] font-semibold truncate leading-tight">{displayName}</p>
            <p className="text-white/30 text-[10px] truncate mt-0.5">{email}</p>
          </div>
          {/* Close button — mobile only */}
          <button
            onClick={closeDrawer}
            className="lg:hidden p-1 rounded-lg text-white/35 hover:text-white/75 hover:bg-white/5 transition-colors"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center gap-1.5 mt-3">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
          <span className="text-[9.5px] font-semibold uppercase tracking-[0.13em] text-white/20">
            Admin Portal
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 h-px bg-white/5.5" />

      {/* Navigation */}
      <AdminNav onNavigate={closeDrawer} />

      {/* Divider */}
      <div className="mx-4 h-px bg-white/5.5" />

      {/* Back to Store + Theme toggle */}
      <div className="px-4 py-3 flex items-center gap-1">
        <Link
          href="/"
          onClick={closeDrawer}
          className="
            group flex items-center gap-2 px-3 py-2 rounded-lg flex-1
            text-[12px] font-medium text-white/35
            hover:text-white/75 hover:bg-white/5.5
            transition-all duration-150
          "
        >
          <ArrowLeft
            size={13}
            className="shrink-0 transition-transform duration-150 group-hover:-translate-x-0.5"
          />
          <span>Back to Store</span>
          <ExternalLink
            size={10}
            className="ml-auto shrink-0 opacity-0 group-hover:opacity-50 transition-opacity duration-150"
          />
        </Link>
        <AdminThemeToggle />
      </div>
    </>
  )

  return (
    <div className="admin-wrapper flex h-screen overflow-hidden bg-gray-100 dark:bg-[#0c0e17]">

      {/* ── Desktop Sidebar (lg+) ── */}
      <aside
        className="hidden lg:flex w-55 shrink-0 h-full flex-col select-none"
        style={{ background: 'linear-gradient(175deg, #0d0f1c 0%, #10121f 60%, #0e1019 100%)' }}
      >
        {sidebarContent}
      </aside>

      {/* ── Mobile drawer backdrop ── */}
      {drawerOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={closeDrawer}
          aria-hidden="true"
        />
      )}

      {/* ── Mobile drawer ── */}
      <aside
        className={`
          lg:hidden fixed top-0 left-0 z-50 h-full w-72 flex flex-col select-none
          transform transition-transform duration-300 ease-in-out
          ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
        style={{ background: 'linear-gradient(175deg, #0d0f1c 0%, #10121f 60%, #0e1019 100%)' }}
        aria-label="Admin navigation"
      >
        {sidebarContent}
      </aside>

      {/* ── Right side: mobile header + main content ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Mobile top header bar */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-white/5 bg-white dark:bg-[#0c0e17] shrink-0">
          <button
            onClick={() => setDrawerOpen(true)}
            className="p-2 rounded-lg text-gray-600 dark:text-white/50 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <span className="text-sm font-semibold text-gray-800 dark:text-white/80">Leomed Pharma Admin</span>
          <AdminThemeToggle />
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto admin-main">
          <div className="p-4 md:p-8">
            {children}
          </div>
        </main>
      </div>

    </div>
  )
}
