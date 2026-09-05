'use client'

import Link from 'next/link'

// The storefront is browse-only — checkout, orders, delivery, and visitor
// tracking were removed, so this dashboard reports only what's still live:
// the catalog and signed-up customers. Historical order/revenue data still
// sits untouched in the database; it just has no admin screen to surface it
// from anymore, so it isn't shown here either.

export interface LowStockProduct {
  id: string
  name: string
  stock: number
}

export interface DashboardProps {
  newCustomers30d: number
  totalCustomers: number
  totalProducts: number
  lowStock: LowStockProduct[]
}

function StatCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string
  accent: 'emerald' | 'blue'
}) {
  const accentMap = {
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
    blue:    { bg: 'bg-blue-50',    text: 'text-blue-600' },
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
  const { newCustomers30d, totalCustomers, totalProducts, lowStock } = props

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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard label="Products" value={String(totalProducts)} sub="Active in catalog" accent="emerald" />
        <StatCard label="Customers" value={totalCustomers.toLocaleString('en-IN')}
          sub={`+${newCustomers30d} in last 30 days`} accent="blue" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Low stock */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-gray-800">Low Stock</p>
            <Link href="/admin/products" className="text-xs text-emerald-700 font-medium hover:underline">Manage →</Link>
          </div>
          {lowStock.length > 0 ? (
            <div className="space-y-2.5">
              {lowStock.map(p => (
                <div key={p.id} className="flex items-center justify-between gap-2">
                  <span className="text-sm text-gray-600 truncate">{p.name}</span>
                  <span className={`text-xs font-bold shrink-0 px-2 py-0.5 rounded-full ${
                    p.stock === 0 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'
                  }`}>
                    {p.stock === 0 ? 'Out of stock' : `${p.stock} left`}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">All products well-stocked.</p>
          )}
        </div>

        {/* Quick links */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 grid grid-cols-2 gap-2 content-start">
          {[
            { href: '/admin/products/new', label: 'Add Product', icon: '➕' },
            { href: '/admin/products',     label: 'Products',    icon: '📦' },
            { href: '/admin/customers',    label: 'Customers',   icon: '👥' },
            { href: '/admin/categories',   label: 'Categories',  icon: '🏷️' },
          ].map(l => (
            <Link key={l.href} href={l.href}
              className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors">
              <span className="text-base">{l.icon}</span>
              <span className="text-xs font-medium text-gray-700">{l.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
