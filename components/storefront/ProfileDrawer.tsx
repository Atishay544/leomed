'use client'
import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { X, Package, Heart, MapPin, Bell, LogOut, User, ChevronRight, LayoutDashboard } from 'lucide-react'
import { useAuth } from '@/lib/hooks/useAuth'

const menuItems = [
  { icon: Package,  label: 'My Orders',    href: '/account/orders' },
  { icon: Heart,    label: 'Wishlist',      href: '/wishlist' },
  { icon: MapPin,   label: 'Addresses',     href: '/account/addresses' },
  { icon: Bell,     label: 'Notifications', href: '/account/notifications' },
  { icon: User,     label: 'Profile',       href: '/account' },
]

export default function ProfileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, isAdmin, signOut } = useAuth()
  const drawerRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onClose])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function handler(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const initials = user?.email?.[0]?.toUpperCase() ?? 'U'
  const email = user?.email ?? ''
  const name = user?.user_metadata?.full_name ?? email.split('@')[0]

  async function handleSignOut() {
    await signOut()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Drawer */}
      <div ref={drawerRef}
        className="relative w-80 max-w-full bg-white h-full shadow-2xl flex flex-col animate-slide-in-right">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">My Account</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full text-gray-500 hover:text-gray-900 transition">
            <X size={18} />
          </button>
        </div>

        {/* User info */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-gray-100">
          <div className="w-11 h-11 rounded-full bg-gray-900 text-white flex items-center justify-center text-base font-bold shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 truncate">{name}</p>
            <p className="text-xs text-gray-400 truncate mt-0.5">{email}</p>
          </div>
        </div>

        {/* Admin Portal link */}
        {isAdmin && (
          <Link href="/admin/dashboard" onClick={onClose} prefetch={false}
            className="flex items-center gap-3 mx-4 my-3 px-4 py-2.5 bg-gray-900 text-white rounded-xl hover:bg-black transition">
            <LayoutDashboard size={16} className="shrink-0" />
            <span className="flex-1 text-sm font-semibold">Admin Portal</span>
          </Link>
        )}

        {/* Menu */}
        <nav className="flex-1 overflow-y-auto py-1">
          {menuItems.map(({ icon: Icon, label, href }) => (
            <Link key={href} href={href} onClick={onClose} prefetch={false}
              className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition group">
              <Icon size={16} className="text-gray-400 group-hover:text-gray-900 transition shrink-0" />
              <span className="flex-1 text-sm font-medium text-gray-700 group-hover:text-gray-900 transition">{label}</span>
              <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-500 transition" />
            </Link>
          ))}
        </nav>

        {/* Sign out */}
        <div className="border-t border-gray-100 px-5 py-4">
          <button onClick={handleSignOut}
            className="flex items-center gap-2.5 w-full py-2 text-sm font-medium text-gray-500 hover:text-red-600 transition">
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
