'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Package, Tag,
  Megaphone, MessageSquare, Image as ImageIcon,
  Newspaper, Rocket, Info, Stethoscope, ChevronDown,
} from 'lucide-react'

const navGroups = [
  {
    label: 'Overview',
    defaultOpen: true,
    items: [
      { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Catalog',
    defaultOpen: true,
    items: [
      { href: '/admin/products',   label: 'Products',    icon: Package },
      { href: '/admin/categories', label: 'Categories',  icon: Tag },
    ],
  },
  {
    label: 'Content',
    defaultOpen: true,
    items: [
      { href: '/admin/banners',           label: 'Banners',           icon: ImageIcon },
      { href: '/admin/announcements',     label: 'Announcements',     icon: Megaphone },
      { href: '/admin/news',              label: 'News & Articles',   icon: Newspaper },
      { href: '/admin/upcoming-launches', label: 'Upcoming Launches', icon: Rocket },
      { href: '/admin/about',             label: 'About Page',        icon: Info },
    ],
  },
  {
    label: 'Support',
    defaultOpen: false,
    items: [
      { href: '/admin/chat', label: 'Chat Support', icon: MessageSquare },
    ],
  },
  {
    label: 'ERP',
    defaultOpen: false,
    items: [
      { href: '/erp/dashboard', label: 'Field Force / ERP', icon: Stethoscope },
    ],
  },
]

function NavGroup({
  group,
  pathname,
  initialOpen,
  onNavigate,
}: {
  group: typeof navGroups[number]
  pathname: string
  initialOpen: boolean
  onNavigate?: () => void
}) {
  const hasActive = group.items.some(
    item => pathname === item.href || pathname.startsWith(item.href + '/')
  )
  const [open, setOpen] = useState(initialOpen || hasActive)

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-1 mb-0.5 group"
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/20 group-hover:text-white/35 transition-colors duration-150">
          {group.label}
        </span>
        <ChevronDown
          size={10}
          className={`text-white/15 group-hover:text-white/30 transition-all duration-200 ${open ? '' : '-rotate-90'}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="space-y-0.5 pb-1">
              {group.items.map(({ href, label, icon: Icon }) => {
                const isActive = pathname === href || pathname.startsWith(href + '/')
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onNavigate}
                    className={`
                      group/item flex items-center gap-2.5 px-3 py-1.75 rounded-lg
                      text-[13px] font-medium transition-all duration-150
                      ${isActive
                        ? 'bg-emerald-600 text-white shadow-[0_0_14px_rgba(99,102,241,0.45)]'
                        : 'text-white/45 hover:text-white/85 hover:bg-white/5.5'
                      }
                    `}
                  >
                    <Icon
                      size={14}
                      className={`shrink-0 transition-colors duration-150 ${
                        isActive
                          ? 'text-emerald-200'
                          : 'text-white/30 group-hover/item:text-white/60'
                      }`}
                    />
                    <span>{label}</span>
                    {isActive && (
                      <span className="ml-auto w-1 h-1 rounded-full bg-emerald-200/70 shrink-0" />
                    )}
                  </Link>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function AdminNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <nav
      className="flex-1 overflow-y-auto py-2 px-3 space-y-1
        [&::-webkit-scrollbar]:w-0.75
        [&::-webkit-scrollbar-track]:bg-transparent
        [&::-webkit-scrollbar-thumb]:rounded-full
        [&::-webkit-scrollbar-thumb]:bg-white/10
        hover:[&::-webkit-scrollbar-thumb]:bg-white/20"
    >
      {navGroups.map(group => (
        <NavGroup
          key={group.label}
          group={group}
          pathname={pathname}
          initialOpen={group.defaultOpen}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  )
}
