'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'

import { useRouter, usePathname } from 'next/navigation'
import { Search, Menu, X, ChevronDown } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

// Max categories shown inline before collapsing into "More ▾"
const VISIBLE_LIMIT = 4

const STATIC_LINKS = [
  { href: '/about',              label: 'About' },
  { href: '/upcoming-launches',  label: 'Upcoming' },
  { href: '/news',               label: 'News' },
]

export default function Header({ categories }: { categories: any[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const [searchQ, setSearchQ] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Close "More" dropdown on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false)
      }
    }
    if (moreOpen) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [moreOpen])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (searchQ.trim()) router.push(`/search?q=${encodeURIComponent(searchQ.trim())}`)
  }

  const visibleCats = categories.slice(0, VISIBLE_LIMIT)
  const overflowCats = categories.slice(VISIBLE_LIMIT)

  return (
    <>
      <header className="glassmorphism border-b border-border" style={{ boxShadow: '0 1px 8px rgba(0,0,0,0.06)' }}>
        <div className="max-w-350 mx-auto px-4 sm:px-6 lg:px-10 h-20 flex items-center gap-4">

          {/* Mobile menu toggle */}
          <button
            className="md:hidden text-gray-700 hover:text-black transition p-2 -ml-2 rounded-lg min-w-11 min-h-11 flex items-center justify-center"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          {/* Logo */}
          <Link href="/" className="shrink-0">
            <Image src="/logo.jpeg" alt="Leomed Pharma" width={200} height={200} className="h-16 w-auto object-contain" priority />
          </Link>

          {/* Category nav (desktop) */}
          <nav className="hidden md:flex items-center gap-1 ml-4">
            {/* Visible categories (up to VISIBLE_LIMIT) */}
            {visibleCats.map(cat => (
              <CategoryLink key={cat.id} cat={cat} pathname={pathname} />
            ))}

            {/* "More ▾" overflow dropdown */}
            {overflowCats.length > 0 && (
              <div ref={moreRef} className="relative">
                <button
                  onClick={() => setMoreOpen(v => !v)}
                  className={`flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200 ${
                    moreOpen
                      ? 'text-emerald-600 bg-emerald-50'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  More
                  <ChevronDown size={13} className={`opacity-60 transition-transform duration-200 ${moreOpen ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {moreOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.15 }}
                      className="absolute top-full left-0 mt-1 bg-white border border-gray-100 shadow-xl rounded-2xl py-2 min-w-52 z-50"
                    >
                      {overflowCats.map((cat: any) => (
                        <div key={cat.id}>
                          <Link
                            href={`/category/${cat.slug}`}
                            prefetch={false}
                            onClick={() => setMoreOpen(false)}
                            className={`flex items-center justify-between px-4 py-2.5 text-sm font-medium transition-colors duration-150 ${
                              pathname === `/category/${cat.slug}`
                                ? 'text-emerald-600 bg-emerald-50/60'
                                : 'text-gray-700 hover:text-emerald-600 hover:bg-emerald-50/60'
                            }`}
                          >
                            {cat.name}
                            {cat.children?.length > 0 && (
                              <ChevronDown size={12} className="opacity-40 -rotate-90" />
                            )}
                          </Link>
                          {cat.children?.length > 0 && (
                            <div className="pl-3 pb-1">
                              {cat.children.map((sub: any) => (
                                <Link
                                  key={sub.id}
                                  href={`/category/${sub.slug}`}
                                  prefetch={false}
                                  onClick={() => setMoreOpen(false)}
                                  className="block px-4 py-1.5 text-xs text-gray-500 hover:text-emerald-600 hover:bg-emerald-50/40 rounded-lg transition-colors duration-150"
                                >
                                  {sub.name}
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                      <div className="border-t border-gray-100 mt-1 pt-1">
                        <Link
                          href="/products"
                          prefetch={false}
                          onClick={() => setMoreOpen(false)}
                          className="block px-4 py-2.5 text-sm font-medium text-gray-700 hover:text-emerald-600 hover:bg-emerald-50/60 transition-colors duration-150"
                        >
                          All Products →
                        </Link>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* All Products link — only show inline when few categories */}
            {overflowCats.length === 0 && (
              <Link
                href="/products"
                prefetch={false}
                className={`relative px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200 ${
                  pathname === '/products'
                    ? 'text-emerald-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                All Products
                {pathname === '/products' && (
                  <motion.span
                    layoutId="nav-underline"
                    className="absolute bottom-0 left-3 right-3 h-0.5 bg-emerald-600 rounded-full"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
              </Link>
            )}

            {STATIC_LINKS.map(link => (
              <Link
                key={link.href}
                href={link.href}
                prefetch={false}
                className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200 ${
                  pathname === link.href
                    ? 'text-emerald-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1 max-w-md hidden md:flex items-center bg-gray-100 hover:bg-gray-200/70 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-300 transition-all duration-200 rounded-full px-3.5 py-2 gap-2 ml-2">
            <Search size={14} className="text-gray-400 shrink-0" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search products..."
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              className="flex-1 text-sm outline-none bg-transparent text-gray-700 placeholder-gray-400"
            />
          </form>

          <div className="ml-auto flex items-center gap-1">
            {/* Search (mobile) */}
            <button
              className="md:hidden p-2 text-muted-fg hover:text-foreground transition min-w-11 min-h-11 flex items-center justify-center rounded-xl"
              aria-label="Search"
              onClick={() => router.push('/search')}
            >
              <Search size={20} />
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="md:hidden border-t border-border bg-background overflow-hidden"
            >
              <div className="px-4 py-4 space-y-0.5">
                {categories.map(cat => (
                  <MobileCategoryItem
                    key={cat.id}
                    cat={cat}
                    pathname={pathname}
                    onClose={() => setMobileOpen(false)}
                  />
                ))}
                <Link
                  href="/products"
                  prefetch={false}
                  className={`block py-2.5 px-3 text-sm font-medium rounded-lg transition-colors duration-150 ${
                    pathname === '/products'
                      ? 'text-emerald-600 bg-emerald-50'
                      : 'text-gray-700 hover:text-black hover:bg-gray-50'
                  }`}
                  onClick={() => setMobileOpen(false)}
                >
                  All Products
                </Link>
                {STATIC_LINKS.map(link => (
                  <Link
                    key={link.href}
                    href={link.href}
                    prefetch={false}
                    className={`block py-2.5 px-3 text-sm font-medium rounded-lg transition-colors duration-150 ${
                      pathname === link.href
                        ? 'text-emerald-600 bg-emerald-50'
                        : 'text-gray-700 hover:text-black hover:bg-gray-50'
                    }`}
                    onClick={() => setMobileOpen(false)}
                  >
                    {link.label}
                  </Link>
                ))}
                <form onSubmit={handleSearch} className="flex items-center bg-gray-100 rounded-full px-3 py-2 gap-2 mt-3">
                  <Search size={14} className="text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchQ}
                    onChange={e => setSearchQ(e.target.value)}
                    className="flex-1 text-sm outline-none bg-transparent"
                  />
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>
    </>
  )
}

// ── Desktop category link with sub-dropdown on hover ─────────────────────────
function CategoryLink({ cat, pathname }: { cat: any; pathname: string }) {
  const isActive = pathname === `/category/${cat.slug}`
  return (
    <div className="relative group">
      <Link
        href={`/category/${cat.slug}`}
        prefetch={false}
        className={`relative px-3 py-2 text-sm font-medium flex items-center gap-0.5 rounded-lg transition-colors duration-200 ${
          isActive
            ? 'text-emerald-600'
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
        }`}
      >
        {cat.name}
        {cat.children?.length > 0 && (
          <ChevronDown size={13} className="opacity-60 group-hover:rotate-180 transition-transform duration-200" />
        )}
        {isActive && (
          <motion.span
            layoutId="nav-underline"
            className="absolute bottom-0 left-3 right-3 h-0.5 bg-emerald-600 rounded-full"
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
          />
        )}
      </Link>

      {cat.children?.length > 0 && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-100 shadow-xl rounded-2xl py-2 min-w-48 hidden group-hover:block z-50 animate-in fade-in slide-in-from-top-1 duration-150">
          {cat.children.map((sub: any) => (
            <Link
              key={sub.id}
              href={`/category/${sub.slug}`}
              prefetch={false}
              className="flex items-center px-4 py-2.5 text-sm text-gray-600 hover:text-emerald-600 hover:bg-emerald-50/60 transition-colors duration-150"
            >
              {sub.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Mobile category item — collapsible if it has children ────────────────────
function MobileCategoryItem({ cat, pathname, onClose }: { cat: any; pathname: string; onClose: () => void }) {
  const [open, setOpen] = useState(false)
  const isActive = pathname.startsWith(`/category/${cat.slug}`)

  if (!cat.children?.length) {
    return (
      <Link
        href={`/category/${cat.slug}`}
        prefetch={false}
        className={`block py-2.5 px-3 text-sm font-medium rounded-lg transition-colors duration-150 ${
          isActive ? 'text-emerald-600 bg-emerald-50' : 'text-gray-700 hover:text-black hover:bg-gray-50'
        }`}
        onClick={onClose}
      >
        {cat.name}
      </Link>
    )
  }

  return (
    <div>
      <button
        className={`w-full flex items-center justify-between py-2.5 px-3 text-sm font-medium rounded-lg transition-colors duration-150 ${
          isActive ? 'text-emerald-600 bg-emerald-50' : 'text-gray-700 hover:text-black hover:bg-gray-50'
        }`}
        onClick={() => setOpen(v => !v)}
      >
        {cat.name}
        <ChevronDown size={14} className={`opacity-50 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden pl-3"
          >
            <Link
              href={`/category/${cat.slug}`}
              prefetch={false}
              className="block py-2 px-3 text-sm text-gray-500 hover:text-emerald-600 rounded-lg transition-colors duration-150"
              onClick={onClose}
            >
              All {cat.name}
            </Link>
            {cat.children.map((sub: any) => (
              <Link
                key={sub.id}
                href={`/category/${sub.slug}`}
                prefetch={false}
                className={`block py-2 px-3 text-sm rounded-lg transition-colors duration-150 ${
                  pathname === `/category/${sub.slug}`
                    ? 'text-emerald-600 font-medium'
                    : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'
                }`}
                onClick={onClose}
              >
                {sub.name}
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
