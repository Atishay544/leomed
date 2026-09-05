'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X, LogOut, Stethoscope, ExternalLink } from 'lucide-react'
import { navGroupsFor, MR_BOTTOM_NAV } from './nav-config'
import { ROLE_LABELS } from '@/lib/erp/permissions'
import type { ErpSession } from '@/lib/erp/types'

function initialsOf(name: string) {
  return name.split(/\s+/).map(p => p[0] ?? '').join('').toUpperCase().slice(0, 2) || '?'
}

function isActive(pathname: string, href: string) {
  // /erp/mr must not light up for /erp/mr/doctor-visits, but
  // /erp/masters/doctors must stay lit on /erp/masters/doctors/new.
  if (href === '/erp/mr') return pathname === href
  return pathname === href || pathname.startsWith(href + '/')
}

export default function ErpShell({
  session,
  logout,
  children,
}: {
  session: ErpSession
  logout: () => Promise<void>
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const groups = navGroupsFor(session.role)
  const isMr = session.role === 'MR'

  // The drawer is closed by the link that was tapped (see closeDrawer below)
  // rather than by an effect watching the path — an effect would re-render
  // just to hide it, which React flags as a cascading render.
  const closeDrawer = () => setDrawerOpen(false)

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [drawerOpen])

  const sidebar = (
    <>
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg
                          bg-linear-to-br from-emerald-500 to-teal-700 ring-1 ring-white/10">
            <Stethoscope size={15} className="text-white" strokeWidth={2.4} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold leading-tight text-white">Leomed Pharma</p>
            <p className="text-[10px] uppercase tracking-[0.12em] text-white/35">Field Force ERP</p>
          </div>
          <button
            onClick={closeDrawer}
            className="ml-auto rounded-lg p-1 text-white/40 hover:bg-white/5 hover:text-white/80 lg:hidden"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="mx-4 h-px bg-white/8" />

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {groups.map(group => (
          <div key={group.label}>
            <p className="px-3 pb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.13em] text-white/25">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map(item => {
                const active = isActive(pathname, item.href)
                const Icon = item.icon
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={closeDrawer}
                      aria-current={active ? 'page' : undefined}
                      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] transition-colors ${
                        active
                          ? 'bg-emerald-500/12 font-semibold text-emerald-300'
                          : 'font-medium text-white/45 hover:bg-white/5 hover:text-white/85'
                      }`}
                    >
                      <Icon size={15} className="shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="mx-4 h-px bg-white/8" />

      <div className="px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full
                          bg-linear-to-br from-emerald-600 to-teal-800 text-[11px] font-bold
                          text-white ring-1 ring-white/10">
            {initialsOf(session.name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-semibold leading-tight text-white/90">
              {session.name}
            </p>
            <p className="truncate text-[10px] text-white/35">
              {ROLE_LABELS[session.role]}{session.mrCode ? ` · ${session.mrCode}` : ''}
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-1.5">
          <form action={logout} className="flex-1">
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[12px]
                         font-medium text-white/40 transition-colors hover:bg-white/5 hover:text-white/85"
            >
              <LogOut size={13} className="shrink-0" />
              Sign out
            </button>
          </form>
          <Link
            href="/"
            onClick={closeDrawer}
            title="Open the storefront"
            className="rounded-lg p-2 text-white/30 transition-colors hover:bg-white/5 hover:text-white/70"
          >
            <ExternalLink size={13} />
          </Link>
        </div>
      </div>
    </>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <aside
        className="hidden w-56 shrink-0 select-none flex-col lg:flex"
        style={{ background: 'linear-gradient(178deg, #0c1512 0%, #0d1714 55%, #0a1210 100%)' }}
      >
        {sidebar}
      </aside>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm lg:hidden"
          onClick={closeDrawer}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-50 flex h-full w-72 select-none flex-col
                    transition-transform duration-300 ease-in-out lg:hidden
                    ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ background: 'linear-gradient(178deg, #0c1512 0%, #0d1714 55%, #0a1210 100%)' }}
        aria-label="ERP navigation"
        aria-hidden={!drawerOpen}
      >
        {sidebar}
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-between border-b border-gray-200
                           bg-white px-4 py-2.5 lg:hidden">
          <button
            onClick={() => setDrawerOpen(true)}
            className="rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100"
            aria-label="Open menu"
          >
            <Menu size={19} />
          </button>
          <span className="text-[13px] font-semibold text-gray-800">Leomed Pharma</span>
          <div className="flex h-7 w-7 items-center justify-center rounded-full
                          bg-linear-to-br from-emerald-600 to-teal-800 text-[10px] font-bold text-white">
            {initialsOf(session.name)}
          </div>
        </header>

        <main className={`flex-1 overflow-y-auto ${isMr ? 'pb-20 lg:pb-0' : ''}`}>
          <div className="mx-auto max-w-7xl p-4 md:p-6 lg:p-8">{children}</div>
        </main>

        {/* MRs work one-handed on a phone; the four things they do live here. */}
        {isMr && (
          <nav
            className="fixed bottom-0 left-0 right-0 z-30 grid grid-cols-4 border-t border-gray-200
                       bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
            aria-label="Quick navigation"
          >
            {MR_BOTTOM_NAV.map(item => {
              const active = isActive(pathname, item.href)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors ${
                    active ? 'text-emerald-700' : 'text-gray-400'
                  }`}
                >
                  <Icon size={19} strokeWidth={active ? 2.4 : 1.9} />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        )}
      </div>
    </div>
  )
}
