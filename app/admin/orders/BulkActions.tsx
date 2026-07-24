'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const ALL_STATUSES = [
  'pending',
  'confirmed',
  'cod_upfront_paid',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
]

interface Order {
  id: string
  total: number
  status: string
  payment_status: string | null
  metadata: Record<string, any> | null
  created_at: string
  user_id: string
  customerName: string | null
  delivery_awb: string | null
  delivery_partner: string | null
}

interface Props {
  initialOrders: Order[]
  statusFilter: string
  searchQuery: string
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

const PM_BADGES: Record<string, { label: string; cls: string }> = {
  online:      { label: 'Online',      cls: 'bg-blue-100 text-blue-700' },
  cod:         { label: 'COD',         cls: 'bg-orange-100 text-orange-700' },
  cod_upfront: { label: 'COD Upfront', cls: 'bg-teal-100 text-teal-700' },
  upi:         { label: 'UPI',         cls: 'bg-purple-100 text-purple-700' },
  partial_cod: { label: 'Partial COD', cls: 'bg-amber-100 text-amber-700' },
}

type SortKey = 'id' | 'customerName' | 'total' | 'status' | 'payment' | 'created_at'
type SortDir = 'asc' | 'desc'

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span className={`ml-1 inline-flex flex-col leading-none ${active ? 'text-gray-900' : 'text-gray-300'}`}>
      <span className={`text-[8px] ${active && dir === 'asc' ? 'text-gray-900' : 'text-gray-300'}`}>▲</span>
      <span className={`text-[8px] ${active && dir === 'desc' ? 'text-gray-900' : 'text-gray-300'}`}>▼</span>
    </span>
  )
}

export default function BulkActions({ initialOrders, statusFilter, searchQuery }: Props) {
  const router = useRouter()
  const [orders, setOrders]       = useState<Order[]>(initialOrders)
  const [selected, setSelected]   = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState('')
  const [applying, setApplying]   = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [sortKey, setSortKey]     = useState<SortKey>('created_at')
  const [sortDir, setSortDir]     = useState<SortDir>('desc')

  useEffect(() => {
    setOrders(initialOrders)
    setSelected(new Set())
  }, [initialOrders])

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  // Search filter
  const filtered = searchQuery
    ? orders.filter(o =>
        o.id.toLowerCase().startsWith(searchQuery.toLowerCase()) ||
        (o.customerName ?? '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : orders

  // Sort
  const displayed = [...filtered].sort((a, b) => {
    let av: any, bv: any
    switch (sortKey) {
      case 'id':           av = a.id;           bv = b.id;           break
      case 'customerName': av = (a.customerName ?? '').toLowerCase(); bv = (b.customerName ?? '').toLowerCase(); break
      case 'total':        av = Number(a.total); bv = Number(b.total); break
      case 'status':       av = a.status;        bv = b.status;       break
      case 'payment':      av = (a.metadata as any)?.payment_method ?? ''; bv = (b.metadata as any)?.payment_method ?? ''; break
      case 'created_at':   av = a.created_at;    bv = b.created_at;   break
      default:             return 0
    }
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  function toggleAll() {
    if (selected.size === displayed.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(displayed.map(o => o.id)))
    }
  }

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function applyBulk() {
    if (!bulkStatus || selected.size === 0) return
    setApplying(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/orders/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected), status: bulkStatus }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Bulk update failed')

      setOrders(prev =>
        prev.map(o => selected.has(o.id) ? { ...o, status: bulkStatus } : o)
      )
      setSelected(new Set())
      setBulkStatus('')
      router.refresh()
    } catch (e: any) {
      setError(e.message ?? 'Bulk update failed')
    } finally {
      setApplying(false)
    }
  }

  const allChecked  = displayed.length > 0 && selected.size === displayed.length
  const someChecked = selected.size > 0 && selected.size < displayed.length

  function ColHeader({ label, colKey, align = 'left' }: { label: string; colKey: SortKey; align?: 'left' | 'right' }) {
    return (
      <th
        className={`px-4 py-3 text-xs font-medium text-gray-500 cursor-pointer select-none hover:text-gray-900 whitespace-nowrap text-${align}`}
        onClick={() => handleSort(colKey)}
      >
        <span className="inline-flex items-center gap-0.5">
          {label}
          <SortIcon active={sortKey === colKey} dir={sortDir} />
        </span>
      </th>
    )
  }

  return (
    <>
      {/* ── Desktop table (md+) ── */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={el => { if (el) el.indeterminate = someChecked }}
                    onChange={toggleAll}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                </th>
                <ColHeader label="Order ID"  colKey="id" />
                <ColHeader label="Customer"  colKey="customerName" />
                <ColHeader label="Total"     colKey="total" align="right" />
                <ColHeader label="Status"    colKey="status" />
                <ColHeader label="Payment"   colKey="payment" />
                <th className="px-4 py-3 text-xs font-medium text-gray-500 whitespace-nowrap">Shipment</th>
                <ColHeader label="Date"      colKey="created_at" />
                <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map(order => {
                const pm = (order.metadata as any)?.payment_method as string | undefined
                const pmBadge = pm ? PM_BADGES[pm] : null
                return (
                  <tr key={order.id} className={`border-b border-gray-100 hover:bg-gray-50 ${selected.has(order.id) ? 'bg-blue-50' : ''}`}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(order.id)}
                        onChange={() => toggleOne(order.id)}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <a href={`/admin/orders/${order.id}`} className="font-mono text-blue-600 hover:underline text-xs font-medium">
                        #{order.id.slice(0, 8).toUpperCase()}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-[180px] truncate">
                      {order.customerName ?? <span className="text-gray-400 italic">Unknown</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      ₹{Number(order.total).toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-700'}`}>
                        {order.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        {pmBadge
                          ? <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${pmBadge.cls}`}>{pmBadge.label}</span>
                          : <span className="text-gray-300 text-xs">—</span>
                        }
                        {order.payment_status === 'upi_pending' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Unverified</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {order.delivery_awb ? (
                        <div>
                          <p className="font-mono text-xs text-gray-700">{order.delivery_awb}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{order.delivery_partner}</p>
                        </div>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {new Date(order.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <a href={`/admin/orders/${order.id}`} className="text-xs text-blue-600 hover:underline">
                        View
                      </a>
                    </td>
                  </tr>
                )
              })}
              {displayed.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-gray-400">No orders found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Mobile card list (< md) ── */}
      <div className="md:hidden space-y-3">
        {displayed.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-gray-400 text-sm">
            No orders found.
          </div>
        )}
        {displayed.map(order => {
          const pm = (order.metadata as any)?.payment_method as string | undefined
          const pmBadge = pm ? PM_BADGES[pm] : null
          return (
            <div key={order.id} className={`bg-white rounded-xl border border-gray-200 p-4 ${selected.has(order.id) ? 'border-blue-300 bg-blue-50' : ''}`}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected.has(order.id)}
                    onChange={() => toggleOne(order.id)}
                    className="w-4 h-4 text-blue-600 rounded shrink-0"
                  />
                  <a href={`/admin/orders/${order.id}`} className="font-mono text-blue-600 font-semibold text-sm">
                    #{order.id.slice(0, 8).toUpperCase()}
                  </a>
                </div>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-700'}`}>
                  {order.status.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Customer</span>
                  <span className="text-sm text-gray-700 font-medium truncate max-w-45">
                    {order.customerName ?? <span className="text-gray-400 italic">Unknown</span>}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Total</span>
                  <span className="text-sm font-bold text-gray-900">₹{Number(order.total).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Date</span>
                  <span className="text-xs text-gray-400">
                    {new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                {pmBadge && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Payment</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${pmBadge.cls}`}>{pmBadge.label}</span>
                  </div>
                )}
                {order.payment_status === 'upi_pending' && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">UPI Status</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Unverified</span>
                  </div>
                )}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100">
                <a href={`/admin/orders/${order.id}`} className="text-sm text-blue-600 font-semibold hover:underline">
                  View Order →
                </a>
              </div>
            </div>
          )
        })}
      </div>

      {/* Floating bulk actions bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white rounded-xl shadow-xl px-5 py-3 flex items-center gap-4 z-50">
          <span className="text-sm font-medium">{selected.size} order{selected.size !== 1 ? 's' : ''} selected</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Update Status:</span>
            <select
              value={bulkStatus}
              onChange={e => setBulkStatus(e.target.value)}
              className="text-sm bg-gray-800 border border-gray-600 text-white rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select…</option>
              {ALL_STATUSES.map(s => (
                <option key={s} value={s} className="capitalize">{s}</option>
              ))}
            </select>
            <button
              onClick={applyBulk}
              disabled={!bulkStatus || applying}
              className="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50 transition-colors"
            >
              {applying ? 'Applying…' : 'Apply'}
            </button>
          </div>
          <button
            onClick={() => setSelected(new Set())}
            className="text-gray-400 hover:text-white text-lg leading-none"
          >
            ×
          </button>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}
    </>
  )
}
