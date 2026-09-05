'use client'

import Link from 'next/link'

// The storefront is a browse-only B2B catalogue now — no accounts, no
// purchases, no stock/price shown publicly. This dashboard just surfaces
// catalogue and content health.

export interface DashboardProps {
  totalProducts: number
  publishedNews: number
  activeLaunches: number
}

function StatCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string
  accent: 'emerald' | 'blue' | 'violet'
}) {
  const accentMap = {
    emerald: { text: 'text-emerald-700' },
    blue:    { text: 'text-blue-600' },
    violet:  { text: 'text-teal-600' },
  }
  const a = accentMap[accent]

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">{label}</p>
      <p className={`text-2xl font-bold leading-none ${a.text}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1.5">{sub}</p>}
    </div>
  )
}

export default function DashboardChart(props: DashboardProps) {
  const { totalProducts, publishedNews, activeLaunches } = props

  const now  = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const dateStr  = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{greeting}</h1>
        <p className="text-sm text-gray-400 mt-0.5">{dateStr}</p>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Products" value={String(totalProducts)} sub="Active in catalogue" accent="emerald" />
        <StatCard label="News & Articles" value={String(publishedNews)} sub="Published" accent="blue" />
        <StatCard label="Upcoming Launches" value={String(activeLaunches)} sub="Active" accent="violet" />
      </div>

      {/* Quick links */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
        {[
          { href: '/admin/products/new',       label: 'Add Product',       icon: '➕' },
          { href: '/admin/products',           label: 'Products',          icon: '📦' },
          { href: '/admin/categories',         label: 'Categories',        icon: '🏷️' },
          { href: '/admin/news',               label: 'News & Articles',   icon: '📰' },
          { href: '/admin/upcoming-launches',  label: 'Upcoming Launches', icon: '🚀' },
          { href: '/admin/about',              label: 'About Page',        icon: 'ℹ️' },
        ].map(l => (
          <Link key={l.href} href={l.href}
            className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors">
            <span className="text-base">{l.icon}</span>
            <span className="text-xs font-medium text-gray-700">{l.label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
