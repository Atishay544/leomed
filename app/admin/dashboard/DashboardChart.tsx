'use client'

import { useState, useRef } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DayPoint {
  date: string
  revenue: number
  orders: number
}

export interface RecentOrder {
  id: string
  total: number
  status: string
  customerName: string | null
  created_at: string
}

export interface LowStockProduct {
  id: string
  name: string
  stock: number
}

export interface DashboardProps {
  revenueToday: number;    revenueYesterday: number
  revenue7d: number;       revenuePrev7d: number
  revenue30d: number;      revenuePrev30d: number
  ordersToday: number;     ordersYesterday: number
  orders7d: number;        ordersPrev7d: number
  orders30d: number;       ordersPrev30d: number
  aov30d: number;          aovPrev30d: number
  newCustomers30d: number; totalCustomers: number
  visitorsToday: number;   visitors30d: number
  ordersByStatus: Record<string, number>
  dailySeries: DayPoint[]
  recentOrders: RecentOrder[]
  lowStock: LowStockProduct[]
  activePartners: number
  pendingAction: number
  liveVisitorSlot?: React.ReactNode
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

function fmtShort(n: number) {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`
  if (n >= 100000)   return `₹${(n / 100000).toFixed(1)}L`
  if (n >= 1000)     return `₹${(n / 1000).toFixed(1)}K`
  return fmt(n)
}

function trendOf(curr: number, prev: number) {
  if (prev === 0) return { pct: curr > 0 ? 100 : 0, up: curr >= 0 }
  const pct = Math.round(((curr - prev) / prev) * 100)
  return { pct: Math.abs(pct), up: pct >= 0 }
}

const STATUS_COLORS: Record<string, string> = {
  pending:          'bg-yellow-100 text-yellow-800',
  confirmed:        'bg-blue-100 text-blue-800',
  cod_upfront_paid: 'bg-teal-100 text-teal-800',
  processing:       'bg-purple-100 text-purple-800',
  shipped:          'bg-indigo-100 text-indigo-800',
  delivered:        'bg-green-100 text-green-800',
  cancelled:        'bg-red-100 text-red-800',
  refunded:         'bg-gray-100 text-gray-700',
}

const STATUS_DOT: Record<string, string> = {
  pending:          'bg-yellow-400',
  confirmed:        'bg-blue-400',
  cod_upfront_paid: 'bg-teal-400',
  processing:       'bg-purple-400',
  shipped:          'bg-indigo-400',
  delivered:        'bg-green-400',
  cancelled:        'bg-red-400',
  refunded:         'bg-gray-400',
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, curr, prev, accent }: {
  label: string; value: string; sub?: string
  curr?: number; prev?: number
  accent: 'indigo' | 'blue' | 'violet' | 'emerald' | 'rose' | 'amber'
}) {
  const accentMap = {
    indigo:  { bg: 'bg-green-50',   text: 'text-green-700',   bar: 'bg-green-600'   },
    blue:    { bg: 'bg-blue-50',    text: 'text-blue-600',    bar: 'bg-blue-500'    },
    violet:  { bg: 'bg-teal-50',    text: 'text-teal-600',    bar: 'bg-teal-500'    },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', bar: 'bg-emerald-500' },
    rose:    { bg: 'bg-rose-50',    text: 'text-rose-600',    bar: 'bg-rose-500'    },
    amber:   { bg: 'bg-amber-50',   text: 'text-amber-600',   bar: 'bg-amber-500'   },
  }
  const a = accentMap[accent]
  const tr = curr !== undefined && prev !== undefined ? trendOf(curr, prev) : null

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">{label}</p>
      <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      {tr && (
        <div className="mt-3 flex items-center gap-1.5">
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${tr.up ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
            {tr.up ? '↑' : '↓'} {tr.pct}%
          </span>
          <span className="text-xs text-gray-400">vs prior period</span>
        </div>
      )}
    </div>
  )
}

// ── SVG Revenue Chart ─────────────────────────────────────────────────────────

function RevenueChart({ data }: { data: DayPoint[] }) {
  const [view, setView] = useState<7 | 30>(30)
  const [tooltip, setTooltip] = useState<{ idx: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const W = 780, H = 200
  const pad = { t: 16, r: 16, b: 32, l: 58 }
  const IW = W - pad.l - pad.r
  const IH = H - pad.t - pad.b

  const pts = view === 7 ? data.slice(-7) : data
  const maxRev = Math.max(...pts.map(d => d.revenue), 100)

  const toX = (i: number) => pad.l + (i / Math.max(pts.length - 1, 1)) * IW
  const toY = (v: number) => pad.t + IH * (1 - v / maxRev)

  const coords: [number, number][] = pts.map((d, i) => [toX(i), toY(d.revenue)])

  function smooth(ps: [number, number][]): string {
    if (ps.length < 2) return ps[0] ? `M ${ps[0][0]} ${ps[0][1]}` : ''
    let d = `M ${ps[0][0]} ${ps[0][1]}`
    for (let i = 1; i < ps.length; i++) {
      const [px, py] = ps[i - 1], [cx, cy] = ps[i]
      const mx = (px + cx) / 2
      d += ` C ${mx} ${py},${mx} ${cy},${cx} ${cy}`
    }
    return d
  }

  const linePath = smooth(coords)
  const areaPath = coords.length > 1
    ? `${linePath} L ${coords[coords.length - 1][0]} ${pad.t + IH} L ${coords[0][0]} ${pad.t + IH} Z`
    : ''

  // Y grid ticks — round to nice numbers
  const rawStep = maxRev / 4
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const niceStep = Math.ceil(rawStep / mag) * mag
  const yTicks = [0, niceStep, niceStep * 2, niceStep * 3, niceStep * 4].filter(v => v <= maxRev * 1.1)

  const xStep = view === 7 ? 1 : Math.ceil(pts.length / 7)

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const sx = ((e.clientX - rect.left) / rect.width) * W
    const idx = Math.max(0, Math.min(pts.length - 1, Math.round(((sx - pad.l) / IW) * (pts.length - 1))))
    setTooltip({ idx })
  }

  const tip = tooltip !== null ? pts[tooltip.idx] : null
  const tipX = tooltip !== null ? toX(tooltip.idx) : 0
  const tipXPct = `${((tipX - pad.l) / IW) * 100}%`

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-semibold text-gray-800">Revenue</p>
          <p className="text-xs text-gray-400">
            {fmtShort(pts.reduce((s, d) => s + d.revenue, 0))} over {view} days ·{' '}
            {pts.reduce((s, d) => s + d.orders, 0)} orders
          </p>
        </div>
        <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
          {([7, 30] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {v}d
            </button>
          ))}
        </div>
      </div>

      <div className="relative select-none">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible"
          style={{ height: 200 }} onMouseMove={onMouseMove} onMouseLeave={() => setTooltip(null)}>
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#6366f1" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Y grid */}
          {yTicks.map((v, i) => {
            const y = toY(v)
            return (
              <g key={i}>
                <line x1={pad.l} y1={y} x2={pad.l + IW} y2={y} stroke="#f1f5f9" strokeWidth={1} />
                <text x={pad.l - 6} y={y + 4} textAnchor="end" fontSize={9.5} fill="#94a3b8">{fmtShort(v)}</text>
              </g>
            )
          })}

          {/* Area + line */}
          {areaPath && <path d={areaPath} fill="url(#areaGrad)" />}
          {linePath  && <path d={linePath} fill="none" stroke="#6366f1" strokeWidth={2.5} strokeLinecap="round" />}

          {/* X labels */}
          {pts.map((d, i) => i % xStep === 0 && (
            <text key={i} x={toX(i)} y={H - 6} textAnchor="middle" fontSize={9.5} fill="#94a3b8">
              {view === 7
                ? new Date(d.date).toLocaleDateString('en-IN', { weekday: 'short' })
                : d.date.slice(5).replace('-', '/')}
            </text>
          ))}

          {/* Hover crosshair */}
          {tooltip !== null && (
            <>
              <line x1={tipX} y1={pad.t} x2={tipX} y2={pad.t + IH}
                stroke="#6366f1" strokeWidth={1} strokeDasharray="4 3" opacity={0.5} />
              <circle cx={tipX} cy={toY(pts[tooltip.idx]?.revenue ?? 0)} r={5}
                fill="#6366f1" stroke="white" strokeWidth={2.5} />
            </>
          )}
        </svg>

        {/* Tooltip card */}
        {tip && (
          <div className="absolute top-0 pointer-events-none z-10"
            style={{ left: tipXPct, transform: 'translateX(-50%)' }}>
            <div className="bg-gray-900 text-white text-xs rounded-xl px-3 py-2 shadow-xl whitespace-nowrap">
              <p className="font-semibold text-gray-300 mb-0.5">
                {new Date(tip.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </p>
              <p className="text-emerald-300 font-bold">{fmt(tip.revenue)}</p>
              <p className="text-gray-400">{tip.orders} order{tip.orders !== 1 ? 's' : ''}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function DashboardChart(props: DashboardProps & { liveVisitorSlot?: ReactNode }) {
  const {
    revenueToday, revenueYesterday,
    revenue7d, revenuePrev7d,
    revenue30d, revenuePrev30d,
    ordersToday, ordersYesterday,
    orders7d, ordersPrev7d,
    orders30d, ordersPrev30d,
    aov30d, aovPrev30d,
    newCustomers30d, totalCustomers,
    visitorsToday, visitors30d,
    ordersByStatus,
    dailySeries,
    recentOrders,
    lowStock,
    activePartners,
    pendingAction,
    liveVisitorSlot,
  } = props

  const [period, setPeriod] = useState<'today' | '7d' | '30d'>('30d')

  const rev  = period === 'today' ? revenueToday  : period === '7d' ? revenue7d  : revenue30d
  const revP = period === 'today' ? revenueYesterday : period === '7d' ? revenuePrev7d : revenuePrev30d
  const ord  = period === 'today' ? ordersToday   : period === '7d' ? orders7d   : orders30d
  const ordP = period === 'today' ? ordersYesterday : period === '7d' ? ordersPrev7d : ordersPrev30d
  const aov  = ord > 0 ? rev / ord : 0
  const aovP = period === '30d' ? aovPrev30d : 0

  const now  = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const dateStr  = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const statusOrder = ['confirmed', 'cod_upfront_paid', 'processing', 'shipped', 'delivered', 'pending', 'cancelled', 'refunded']
  const statusEntries = statusOrder
    .map(s => [s, ordersByStatus[s] ?? 0] as [string, number])
    .filter(([, v]) => v > 0)
  const statusTotal = statusEntries.reduce((s, [, v]) => s + v, 0)

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{greeting}</h1>
          <p className="text-sm text-gray-400 mt-0.5">{dateStr}</p>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 shrink-0">
          {([['today', 'Today'], ['7d', '7 days'], ['30d', '30 days']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setPeriod(k)}
              className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${period === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* ── Pending attention banner ── */}
      {pendingAction > 0 && (
        <Link href="/admin/orders?status=confirmed"
          className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 hover:bg-amber-100 transition-colors group">
          <div className="flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
            </span>
            <span className="text-sm font-semibold text-amber-800">
              {pendingAction} order{pendingAction > 1 ? 's' : ''} need{pendingAction === 1 ? 's' : ''} attention
            </span>
            <span className="text-xs text-amber-600 hidden sm:block">Confirmed · ready to ship</span>
          </div>
          <span className="text-xs font-semibold text-amber-700 group-hover:underline">View orders →</span>
        </Link>
      )}

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard label="Revenue" value={fmtShort(rev)} sub={period === 'today' ? 'Today' : `Last ${period}`}
          curr={rev} prev={revP} accent="indigo" />
        <KpiCard label="Orders" value={String(ord)} sub={period === 'today' ? 'Today' : `Last ${period}`}
          curr={ord} prev={ordP} accent="blue" />
        <KpiCard label="Avg Order Value" value={fmtShort(aov)} sub="Per order"
          curr={aov} prev={aovP} accent="violet" />
        <KpiCard label="New Customers" value={String(newCustomers30d)} sub={`${totalCustomers.toLocaleString('en-IN')} total`}
          accent="emerald" />
      </div>

      {/* ── Chart + Status breakdown ── */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Revenue chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <RevenueChart data={dailySeries} />
        </div>

        {/* Order status */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-gray-800">Orders by Status</p>
            <Link href="/admin/orders?status=all" className="text-xs text-emerald-700 font-medium hover:underline">All →</Link>
          </div>
          <div className="space-y-3 flex-1">
            {statusEntries.length === 0
              ? <p className="text-sm text-gray-400">No orders yet.</p>
              : statusEntries.map(([status, count]) => (
              <div key={status}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${STATUS_DOT[status] ?? 'bg-gray-400'}`} />
                    <span className="text-xs font-medium text-gray-600 capitalize">{status.replace(/_/g, ' ')}</span>
                  </div>
                  <span className="text-xs font-bold text-gray-800">{count}</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${STATUS_DOT[status] ?? 'bg-gray-400'}`}
                    style={{ width: statusTotal > 0 ? `${(count / statusTotal) * 100}%` : '0%' }} />
                </div>
              </div>
            ))}
          </div>
          {/* Visitor stats */}
          <div className="mt-4 pt-4 border-t border-gray-50 space-y-3">
            {/* Live now */}
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">Live now</p>
              {liveVisitorSlot ?? <span className="text-sm font-bold text-gray-800">—</span>}
            </div>
            {/* Historical */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">Today</p>
                <p className="text-lg font-bold text-gray-800">{visitorsToday.toLocaleString('en-IN')}</p>
                <p className="text-[10px] text-gray-400">unique visitors</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">30 days</p>
                <p className="text-lg font-bold text-gray-800">{visitors30d.toLocaleString('en-IN')}</p>
                <p className="text-[10px] text-gray-400">unique visitors</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Recent orders + sidebar ── */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Recent orders */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <p className="text-sm font-semibold text-gray-800">Recent Orders</p>
            <Link href="/admin/orders" className="text-xs text-emerald-700 font-medium hover:underline">View all →</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <tbody>
                {recentOrders.map(order => (
                  <tr key={order.id} className="border-b border-gray-50 hover:bg-gray-50/70 transition-colors">
                    <td className="px-5 py-3 w-28">
                      <Link href={`/admin/orders/${order.id}`}
                        className="font-mono text-xs text-emerald-700 hover:text-emerald-800 font-semibold">
                        #{order.id.slice(0, 8).toUpperCase()}
                      </Link>
                    </td>
                    <td className="px-3 py-3 max-w-[130px]">
                      <span className="text-sm text-gray-600 truncate block">
                        {order.customerName ?? <span className="text-gray-300 italic text-xs">Guest</span>}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-sm font-semibold text-gray-900">{fmt(order.total)}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize whitespace-nowrap ${STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-700'}`}>
                        {order.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="text-xs text-gray-400 whitespace-nowrap">
                        {new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </span>
                    </td>
                  </tr>
                ))}
                {recentOrders.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-10 text-center text-gray-400 text-sm">No orders yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Low stock */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
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

          {/* Carrier status */}
          <div className={`rounded-2xl border p-4 ${activePartners > 0 ? 'bg-green-50 border-green-100' : 'bg-amber-50 border-amber-100'}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2 h-2 rounded-full ${activePartners > 0 ? 'bg-green-500' : 'bg-amber-400'}`} />
              <p className={`text-xs font-semibold ${activePartners > 0 ? 'text-green-800' : 'text-amber-800'}`}>
                {activePartners > 0 ? `${activePartners} carrier${activePartners > 1 ? 's' : ''} active` : 'No carrier configured'}
              </p>
            </div>
            <p className={`text-xs mb-2 ${activePartners > 0 ? 'text-green-700' : 'text-amber-700'}`}>
              {activePartners > 0 ? 'Live rates & booking enabled.' : 'Add Delhivery to book shipments.'}
            </p>
            <Link href={activePartners > 0 ? '/admin/delivery' : '/admin/carriers'}
              className={`text-xs font-semibold underline ${activePartners > 0 ? 'text-green-700' : 'text-amber-800'}`}>
              {activePartners > 0 ? 'Go to Delivery →' : 'Set up carrier →'}
            </Link>
          </div>

          {/* Quick links */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 grid grid-cols-2 gap-2">
            {[
              { href: '/admin/products/new', label: 'Add Product', icon: '➕' },
              { href: '/admin/orders',       label: 'All Orders',  icon: '📦' },
              { href: '/admin/customers',    label: 'Customers',   icon: '👥' },
              { href: '/admin/delivery',     label: 'Delivery',    icon: '🚚' },
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
    </div>
  )
}
