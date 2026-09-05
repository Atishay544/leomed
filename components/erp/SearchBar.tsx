'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Loader2, Search, X } from 'lucide-react'

/**
 * Server-side search box. The term goes into the URL, so the query runs in
 * PostgreSQL against a trigram index — the page never holds the full table in
 * the browser to filter it there (spec §55).
 */
export default function SearchBar({
  placeholder = 'Search…',
  paramName = 'q',
}: {
  placeholder?: string
  paramName?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const current = searchParams.get(paramName) ?? ''
  const [value, setValue] = useState(current)
  const firstRender = useRef(true)

  // Follow browser navigation (back button, a cleared filter elsewhere).
  useEffect(() => { setValue(current) }, [current])

  useEffect(() => {
    // Don't re-navigate to the URL we just arrived on.
    if (firstRender.current) { firstRender.current = false; return }
    if (value === current) return

    // Typing shouldn't fire a query per keystroke.
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (value.trim()) params.set(paramName, value.trim())
      else params.delete(paramName)
      // A new search always starts at page one — page 7 of the old result set
      // is meaningless against the new one.
      params.delete('page')
      startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }))
    }, 350)

    return () => clearTimeout(timer)
  }, [value, current, pathname, paramName, router, searchParams])

  return (
    <div className="relative w-full sm:max-w-xs">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
        {pending ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
      </span>
      <input
        type="search"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-8 text-base
                   text-gray-900 placeholder:text-gray-400 focus:border-emerald-600
                   focus:ring-2 focus:ring-emerald-600/20 focus:outline-none sm:text-[13px]"
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-700"
          aria-label="Clear search"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
