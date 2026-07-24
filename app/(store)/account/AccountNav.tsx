'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_LINKS = [
  { label: 'Profile',       href: '/account' },
  { label: 'Orders',        href: '/account/orders' },
  { label: 'Addresses',     href: '/account/addresses' },
  { label: 'Notifications', href: '/account/notifications' },
]

export default function AccountNav() {
  const pathname = usePathname()

  return (
    <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible -mx-4 px-4 md:mx-0 md:px-0 pb-1 md:pb-0">
      {NAV_LINKS.map(link => {
        const isActive =
          link.href === '/account'
            ? pathname === '/account'
            : pathname.startsWith(link.href)
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`px-4 py-2.5 rounded-xl text-sm font-medium transition whitespace-nowrap shrink-0 md:shrink ${
              isActive
                ? 'bg-black text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
