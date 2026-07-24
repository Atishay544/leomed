'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DayPoint {
  date: string
  revenue: number
  deliveryCost: number
  returns: number
  shipped: number
}

export interface OutForDeliveryOrder {
  id: string
  orderId: string
  awb: string
  partner: string
  customerName: string
  customerPhone: string
  total: number
  deliveryCost: number
}

export interface PartnerStat {
  name: string
  shipped: number
  delivered: number
  inTransit: number
  returned: number
  totalCost: number
  successRate: number
}

export interface DeliveryOrder {
  id: string
  orderId: string
  awb: string | null
  partner: string | null
  service: string | null
  status: string
  customerName: string
  customerPhone: string
  total: number
  deliveryCost: number
  date: string
  trackingStatus: string | null
}

export interface BulkOrder {
  id: string
  orderId: string
  status: string
  customerName: string
  customerPhone: string
  customerPin: string
  total: number
  deliveryCost: number
  awb: string | null
  partner: string | null
  service: string | null
  date: string
  weightGrams: number
  isCOD: boolean
  paymentMethod: string
  trackingStatus: string | null
}

interface Props {
  partners: string[]
  timeSeries: DayPoint[]
  partnerStats: PartnerStat[]
  outForDelivery: OutForDeliveryOrder[]
  orders: DeliveryOrder[]
  bulkOrders: BulkOrder[]
  datePreset?: string
  totalStats: {
    totalShipped: number
    inTransit: number
    outForDelivery: number
    delivered: number
    returned: number
    totalCost: number
    totalRevenue: number
    successRate: number
    avgCost: number
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

function fmtW(g: number) {
  return g >= 1000 ? `${(g / 1000).toFixed(2)}kg` : `${g}g`
}

const STATUS_COLORS: Record<string, string> = {
  shipped:          'bg-indigo-100 text-indigo-700',
  delivered:        'bg-green-100 text-green-700',
  cancelled:        'bg-red-100 text-red-700',
  refunded:         'bg-red-100 text-red-700',
  processing:       'bg-purple-100 text-purple-700',
  confirmed:        'bg-blue-100 text-blue-700',
  pending:          'bg-gray-100 text-gray-600',
  cod_upfront_paid: 'bg-yellow-100 text-yellow-700',
}

const NEEDS_BOOKING = new Set(['pending', 'confirmed', 'cod_upfront_paid', 'processing'])

// ── Mini SVG Chart ────────────────────────────────────────────────────────────

function MiniChart({ data }: { data: DayPoint[] }) {
  const W = 260, H = 80
  const pad = { t: 8, r: 8, b: 20, l: 0 }
  const IW = W - pad.l - pad.r
  const IH = H - pad.t - pad.b

  if (!data.length) return <div className="h-20 flex items-center justify-center text-xs text-gray-400">No data</div>

  const recentData = data.slice(-30)
  const maxVal     = Math.max(...recentData.flatMap(d => [d.revenue, d.deliveryCost]), 1)
  const xStep      = IW / Math.max(recentData.length - 1, 1)

  const line = (key: keyof DayPoint, stroke: string) => {
    const pts = recentData.map((d, i) =>
      `${pad.l + i * xStep},${pad.t + IH - (Number(d[key]) / maxVal) * IH}`
    ).join(' ')
    return <polyline fill="none" stroke={stroke} strokeWidth={1.5} points={pts} />
  }

  const labelStep = Math.max(1, Math.floor(recentData.length / 4))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      {recentData.map((d, i) => i % labelStep === 0 && (
        <text key={i} x={pad.l + i * xStep} y={H - 2} textAnchor="middle" fontSize={7} fill="#9ca3af">
          {d.date.slice(5)}
        </text>
      ))}
      {line('revenue', '#22c55e')}
      {line('deliveryCost', '#3b82f6')}
    </svg>
  )
}

// ── Rate badge ────────────────────────────────────────────────────────────────

interface Rate { service: string; rate: number; is_live: boolean; chargedGrams?: number }

// ── NDR modal ─────────────────────────────────────────────────────────────────

function NDRModal({ orderId, awb, onClose, onDone }: { orderId: string; awb: string; onClose: () => void; onDone: () => void }) {
  const [action, setAction] = useState<'RE-ATTEMPT' | 'RTO'>('RE-ATTEMPT')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setLoading(true); setError('')
    try {
      const res  = await fetch(`/api/admin/orders/${orderId}/ndr`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'NDR action failed'); return }
      onDone()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl p-5 w-full max-w-sm shadow-xl">
        <h3 className="font-semibold text-gray-900 mb-1">NDR Action</h3>
        <p className="text-xs text-gray-500 mb-4">AWB: {awb}</p>
        <div className="flex gap-2 mb-4">
          {(['RE-ATTEMPT', 'RTO'] as const).map(a => (
            <button key={a} onClick={() => setAction(a)}
              className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${action === a ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
            >{a}</button>
          ))}
        </div>
        {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={loading}
            className="flex-1 py-2 bg-orange-600 text-white rounded-lg text-xs font-medium hover:bg-orange-700 disabled:opacity-50">
            {loading ? 'Submitting…' : 'Submit NDR'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Cancel modal ──────────────────────────────────────────────────────────────

function CancelModal({ orderId, awb, carrier, onClose, onDone }: { orderId: string; awb: string; carrier: string; onClose: () => void; onDone: () => void }) {
  const [loading, setLoading]       = useState(false)
  const [forceLoading, setForceLoading] = useState(false)
  const [error, setError]           = useState('')
  const [carrierRejected, setCarrierRejected] = useState(false)

  async function confirm() {
    setLoading(true); setError(''); setCarrierRejected(false)
    try {
      const res  = await fetch(`/api/admin/orders/${orderId}/cancel-shipment`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        setError(data.error ?? 'Cancellation failed')
        setCarrierRejected(true)
        return
      }
      onDone()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function forceClear() {
    setForceLoading(true); setError('')
    try {
      const res  = await fetch(`/api/admin/orders/${orderId}/force-clear-awb`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) { setError(data.error ?? 'Force clear failed'); return }
      onDone()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setForceLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl p-5 w-full max-w-sm shadow-xl">
        <h3 className="font-semibold text-gray-900 mb-1">Cancel Shipment</h3>
        <p className="text-xs text-gray-500 mb-1">AWB <span className="font-mono text-gray-700">{awb}</span> via {carrier}</p>
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-4">This cannot be undone once accepted by the carrier.</p>
        {error && (
          <div className="mb-3">
            <p className="text-xs text-red-600">{error}</p>
            {carrierRejected && (
              <div className="mt-2 p-2.5 bg-orange-50 border border-orange-200 rounded-lg">
                <p className="text-xs text-orange-800 font-medium mb-1">Carrier API rejected — cancel from Delhivery dashboard instead.</p>
                <p className="text-xs text-orange-700 mb-2">Or use Force Clear to remove the AWB from this order so you can rebook.</p>
                <button onClick={forceClear} disabled={forceLoading}
                  className="w-full py-1.5 bg-orange-600 text-white rounded-lg text-xs font-medium hover:bg-orange-700 disabled:opacity-50">
                  {forceLoading ? 'Clearing…' : 'Force Clear AWB (rebook later)'}
                </button>
              </div>
            )}
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50">Keep Shipment</button>
          <button onClick={confirm} disabled={loading}
            className="flex-1 py-2 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 disabled:opacity-50">
            {loading ? 'Cancelling…' : 'Yes, Cancel'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Pickup modal ──────────────────────────────────────────────────────────────

function PickupModal({ orderId, awb, onClose, onDone }: {
  orderId: string; awb: string; onClose: () => void; onDone: () => void
}) {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const [date, setDate]     = useState(tomorrow)
  const [time, setTime]     = useState('10:00')
  const [qty, setQty]       = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')

  async function submit() {
    if (!date || !time) { setError('Date and time are required'); return }
    setLoading(true); setError('')
    try {
      const res  = await fetch(`/api/admin/orders/${orderId}/pickup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pickup_date: date, pickup_time: time, quantity: qty }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) { setError(data.error ?? 'Pickup request failed'); return }
      onDone()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl p-5 w-full max-w-sm shadow-xl">
        <h3 className="font-semibold text-gray-900 mb-1">Request Pickup</h3>
        <p className="text-xs text-gray-500 mb-4 font-mono">AWB: {awb}</p>
        <div className="space-y-3 mb-4">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Pickup Date</label>
            <input type="date" value={date} min={tomorrow} onChange={e => setDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Pickup Time</label>
            <input type="time" value={time} onChange={e => setTime(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">No. of Packages</label>
            <input type="number" min={1} max={50} value={qty} onChange={e => setQty(Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400" />
          </div>
        </div>
        {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={loading}
            className="flex-1 py-2 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-700 disabled:opacity-50">
            {loading ? 'Scheduling…' : 'Schedule Pickup'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Per-row action state ───────────────────────────────────────────────────────

interface RowState {
  rates?: Rate[]
  rateLoading?: boolean
  rateError?: string
  bookLoading?: boolean
  bookError?: string
  bookSuccess?: string
  trackLoading?: boolean
  trackStatus?: string
  trackError?: string
  pickupDone?: boolean
  awb?: string | null
  cancelDone?: boolean
  syncLoading?: boolean
  syncResult?: string
}

// ── Bulk orders table ─────────────────────────────────────────────────────────

function BulkTable({ orders }: { orders: BulkOrder[] }) {
  const [rowState, setRowState]   = useState<Record<string, RowState>>({})
  const [selected, setSelected]   = useState<Set<string>>(new Set())
  const [filterTab, setFilterTab] = useState<'all' | 'unbooked' | 'shipped'>('all')
  const [ndrModal, setNdrModal]     = useState<{ orderId: string; awb: string } | null>(null)
  const [cancelModal, setCancelModal] = useState<{ orderId: string; awb: string; carrier: string } | null>(null)
  const [pickupModal, setPickupModal] = useState<{ orderId: string; awb: string } | null>(null)
  const [pkgDims, setPkgDims] = useState<Record<string, { w: number; h: number; l: number }>>({})

  const patch = useCallback((id: string, update: Partial<RowState>) => {
    setRowState(prev => ({ ...prev, [id]: { ...prev[id], ...update } }))
  }, [])

  // Auto-sync all shipped-with-AWB orders on mount (max 15 at a time to avoid rate-limit)
  const autoSyncRan = useRef(false)
  useEffect(() => {
    if (autoSyncRan.current) return
    autoSyncRan.current = true
    const toSync = orders
      .filter(o => o.awb && o.status === 'shipped')
      .slice(0, 15)
    toSync.forEach(order => {
      patch(order.id, { syncLoading: true })
      fetch(`/api/admin/orders/${order.id}/sync-status`, { method: 'POST' })
        .then(r => r.json())
        .then(data => {
          if (data.cleared) {
            patch(order.id, { syncLoading: false, awb: null, cancelDone: true, syncResult: `Cancelled on Delhivery` })
          } else {
            patch(order.id, { syncLoading: false, trackStatus: data.liveStatus })
          }
        })
        .catch(() => patch(order.id, { syncLoading: false }))
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    if (filterTab === 'unbooked') return orders.filter(o => !o.awb && NEEDS_BOOKING.has(o.status))
    if (filterTab === 'shipped')  return orders.filter(o => o.awb && o.status === 'shipped')
    return orders
  }, [orders, filterTab])

  const allSelected = filtered.length > 0 && filtered.every(o => selected.has(o.id))

  function toggleAll() {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(filtered.map(o => o.id)))
  }

  async function fetchRates(order: BulkOrder) {
    patch(order.id, { rateLoading: true, rateError: undefined, rates: undefined })
    const dims = pkgDims[order.id]
    try {
      const res  = await fetch(`/api/admin/orders/${order.id}/shipping-rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weightGrams: order.weightGrams,
          length:      dims?.l ?? 12,
          width:       dims?.w ?? 12,
          height:      dims?.h ?? 12,
        }),
      })
      const data = await res.json()
      if (!res.ok) { patch(order.id, { rateLoading: false, rateError: data.error ?? 'Rate fetch failed' }); return }
      patch(order.id, { rateLoading: false, rates: data.rates ?? [] })
    } catch (e: any) {
      patch(order.id, { rateLoading: false, rateError: e.message })
    }
  }

  async function bookShipment(order: BulkOrder, rate: Rate) {
    patch(order.id, { bookLoading: true, bookError: undefined })
    try {
      const res  = await fetch(`/api/admin/orders/${order.id}/book-shipment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carrier_id: rate.service === 'Express' ? undefined : undefined, service: rate.service }),
      })
      const data = await res.json()
      if (!res.ok) { patch(order.id, { bookLoading: false, bookError: data.error ?? 'Booking failed' }); return }
      patch(order.id, { bookLoading: false, awb: data.waybill, bookSuccess: `AWB: ${data.waybill}` })
    } catch (e: any) {
      patch(order.id, { bookLoading: false, bookError: e.message })
    }
  }

  async function trackOrder(order: BulkOrder) {
    const awb = rowState[order.id]?.awb ?? order.awb
    if (!awb) return
    patch(order.id, { trackLoading: true, trackStatus: undefined })
    try {
      const res  = await fetch(`/api/admin/orders/${order.id}/track`)
      const data = await res.json()
      if (!res.ok) { patch(order.id, { trackLoading: false, trackError: data.error ?? 'Track failed' }); return }
      patch(order.id, { trackLoading: false, trackStatus: data.status ?? 'Unknown' })
    } catch (e: any) {
      patch(order.id, { trackLoading: false, trackError: e.message })
    }
  }

  async function syncStatus(order: BulkOrder) {
    patch(order.id, { syncLoading: true, syncResult: undefined })
    try {
      const res  = await fetch(`/api/admin/orders/${order.id}/sync-status`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { patch(order.id, { syncLoading: false, syncResult: `Error: ${data.error ?? 'Sync failed'}` }); return }
      if (data.cleared) {
        // AWB was cancelled on Delhivery — clear it locally too
        patch(order.id, { syncLoading: false, awb: null, cancelDone: true, syncResult: `Cancelled on Delhivery (${data.liveStatus})` })
      } else {
        patch(order.id, { syncLoading: false, trackStatus: data.liveStatus, syncResult: data.liveStatus })
      }
    } catch (e: any) {
      patch(order.id, { syncLoading: false, syncResult: `Error: ${e.message}` })
    }
  }

  const unbooked = orders.filter(o => !o.awb && NEEDS_BOOKING.has(o.status)).length
  const shipped  = orders.filter(o => o.awb && o.status === 'shipped').length

  return (
    <div>
      {/* Tab filter */}
      <div className="flex gap-1 mb-3">
        {[
          { key: 'all',      label: `All (${orders.length})` },
          { key: 'unbooked', label: `Unbooked (${unbooked})` },
          { key: 'shipped',  label: `In Transit (${shipped})` },
        ].map(t => (
          <button key={t.key} onClick={() => setFilterTab(t.key as any)}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors border ${
              filterTab === t.key ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >{t.label}</button>
        ))}
        {selected.size > 0 && (
          <span className="ml-auto text-xs text-gray-500 self-center">{selected.size} selected</span>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-2 py-2.5 w-6">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded" />
              </th>
              <th className="px-3 py-2.5 text-left text-gray-500 font-medium whitespace-nowrap">Order</th>
              <th className="px-3 py-2.5 text-left text-gray-500 font-medium">Customer</th>
              <th className="px-3 py-2.5 text-left text-gray-500 font-medium whitespace-nowrap">Weight</th>
              <th className="px-3 py-2.5 text-left text-gray-500 font-medium whitespace-nowrap">Rate / Book</th>
              <th className="px-3 py-2.5 text-left text-gray-500 font-medium">Status</th>
              <th className="px-3 py-2.5 text-left text-gray-500 font-medium">AWB</th>
              <th className="px-3 py-2.5 text-left text-gray-500 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No orders</td></tr>
            ) : filtered.map(order => {
              const rs  = rowState[order.id] ?? {}
              const awb = rs.awb ?? order.awb
              const dims = pkgDims[order.id]

              return (
                <tr key={order.id} className={`hover:bg-gray-50 ${selected.has(order.id) ? 'bg-blue-50' : ''}`}>
                  {/* Checkbox */}
                  <td className="px-2 py-2">
                    <input type="checkbox" checked={selected.has(order.id)}
                      onChange={() => setSelected(prev => { const s = new Set(prev); s.has(order.id) ? s.delete(order.id) : s.add(order.id); return s })}
                      className="rounded" />
                  </td>

                  {/* Order ID */}
                  <td className="px-3 py-2">
                    <Link href={`/admin/orders/${order.id}`} className="font-mono text-gray-600 hover:text-blue-600">
                      #{order.orderId.slice(-7).toUpperCase()}
                    </Link>
                    <p className="text-gray-400 mt-0.5">{order.date}</p>
                  </td>

                  {/* Customer */}
                  <td className="px-3 py-2">
                    <p className="text-gray-800 font-medium truncate max-w-25">{order.customerName}</p>
                    {order.customerPhone && (
                      <a href={`tel:${order.customerPhone}`} className="text-gray-400 hover:text-green-600">{order.customerPhone}</a>
                    )}
                    <p className="text-gray-400">{order.customerPin}</p>
                  </td>

                  {/* Weight + dims */}
                  <td className="px-3 py-2">
                    <p className="text-gray-700">{fmtW(order.weightGrams)}</p>
                    <div className="flex gap-0.5 mt-1">
                      {['l', 'w', 'h'].map(k => (
                        <input key={k} type="number" min={1} placeholder={k.toUpperCase()}
                          value={(dims as any)?.[k] ?? ''}
                          onChange={e => setPkgDims(prev => ({ ...prev, [order.id]: { ...prev[order.id], [k]: Number(e.target.value) } }))}
                          className="w-10 border border-gray-200 rounded px-1 py-0.5 text-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-400"
                        />
                      ))}
                      <span className="text-gray-400 self-center">cm</span>
                    </div>
                  </td>

                  {/* Rate / Book */}
                  <td className="px-3 py-2 min-w-35">
                    {!awb ? (
                      <div>
                        {!rs.rates ? (
                          <button onClick={() => fetchRates(order)} disabled={rs.rateLoading}
                            className="px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 whitespace-nowrap">
                            {rs.rateLoading ? 'Loading…' : 'Get Rate'}
                          </button>
                        ) : (
                          <div className="space-y-1">
                            {rs.rates.map(r => (
                              <div key={r.service} className="flex items-center gap-1.5">
                                <span className={`text-gray-700 ${r.is_live ? '' : 'opacity-60'}`}>
                                  {r.service} — {fmt(r.rate)}
                                  {!r.is_live && <span className="ml-1 text-gray-400">(est.)</span>}
                                </span>
                                <button onClick={() => bookShipment(order, r)} disabled={rs.bookLoading}
                                  className="px-2 py-0.5 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-50">
                                  {rs.bookLoading ? '…' : 'Book'}
                                </button>
                              </div>
                            ))}
                            <button onClick={() => patch(order.id, { rates: undefined })} className="text-gray-400 hover:text-gray-600 text-xs mt-0.5">↺ Refresh</button>
                          </div>
                        )}
                        {rs.rateError && <p className="text-red-600 mt-1 text-xs leading-tight">{rs.rateError}</p>}
                        {rs.bookError && <p className="text-red-600 mt-1 text-xs leading-tight">{rs.bookError}</p>}
                        {rs.bookSuccess && <p className="text-green-700 font-mono mt-1 text-xs">{rs.bookSuccess}</p>}
                      </div>
                    ) : (
                      <div>
                        <p className="text-gray-500">{fmt(order.deliveryCost || 0)}</p>
                        <p className="text-gray-400">{order.partner} · {order.service}</p>
                      </div>
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {order.status.replace(/_/g, ' ')}
                    </span>
                    {rs.trackStatus && (
                      <p className="text-indigo-600 mt-0.5">{rs.trackStatus}</p>
                    )}
                    {order.trackingStatus && !rs.trackStatus && (
                      <p className="text-amber-600 mt-0.5">{order.trackingStatus}</p>
                    )}
                    {rs.trackError && <p className="text-red-500 mt-0.5">{rs.trackError}</p>}
                  </td>

                  {/* AWB */}
                  <td className="px-3 py-2 font-mono text-gray-500">
                    {awb ?? '—'}
                  </td>

                  {/* Actions */}
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {/* Track */}
                      {awb && (
                        <button onClick={() => trackOrder(order)} disabled={rs.trackLoading}
                          className="px-2 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded hover:bg-indigo-100 disabled:opacity-50 whitespace-nowrap">
                          {rs.trackLoading ? '…' : 'Track'}
                        </button>
                      )}
                      {/* NDR */}
                      {awb && (order.status === 'shipped' || order.trackingStatus) && (
                        <button onClick={() => setNdrModal({ orderId: order.id, awb })}
                          className="px-2 py-1 bg-orange-50 text-orange-700 border border-orange-200 rounded hover:bg-orange-100 whitespace-nowrap">
                          NDR
                        </button>
                      )}
                      {/* Pickup — requires AWB (booked) first, then opens date/time modal */}
                      {awb && !rs.pickupDone && (
                        <button onClick={() => setPickupModal({ orderId: order.id, awb })}
                          className="px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded hover:bg-amber-100 whitespace-nowrap">
                          Pickup
                        </button>
                      )}
                      {rs.pickupDone && (
                        <span className="px-2 py-1 bg-green-50 text-green-700 rounded text-xs">Pickup ✓</span>
                      )}
                      {/* Cancel */}
                      {awb && !rs.cancelDone && (
                        <button onClick={() => setCancelModal({ orderId: order.id, awb, carrier: order.partner ?? 'Carrier' })}
                          className="px-2 py-1 bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100 whitespace-nowrap">
                          Cancel
                        </button>
                      )}
                      {rs.cancelDone && <span className="text-red-500 text-xs">Cancelled</span>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* NDR modal */}
      {ndrModal && (
        <NDRModal
          orderId={ndrModal.orderId}
          awb={ndrModal.awb}
          onClose={() => setNdrModal(null)}
          onDone={() => { setNdrModal(null) }}
        />
      )}

      {/* Cancel modal */}
      {cancelModal && (
        <CancelModal
          orderId={cancelModal.orderId}
          awb={cancelModal.awb}
          carrier={cancelModal.carrier}
          onClose={() => setCancelModal(null)}
          onDone={() => {
            patch(cancelModal.orderId, { cancelDone: true, awb: null })
            setCancelModal(null)
          }}
        />
      )}

      {/* Pickup modal — date + time + quantity required */}
      {pickupModal && (
        <PickupModal
          orderId={pickupModal.orderId}
          awb={pickupModal.awb}
          onClose={() => setPickupModal(null)}
          onDone={() => {
            patch(pickupModal.orderId, { pickupDone: true })
            setPickupModal(null)
          }}
        />
      )}
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color, alert }: { label: string; value: string; sub: string; color: string; alert?: boolean }) {
  const palette: Record<string, string> = {
    blue:   'bg-blue-50 text-blue-700',
    indigo: 'bg-indigo-50 text-indigo-700',
    green:  'bg-green-50 text-green-700',
    red:    'bg-red-50 text-red-700',
    amber:  'bg-amber-50 text-amber-700',
    gray:   'bg-gray-50 text-gray-700',
  }
  return (
    <div className={`rounded-xl p-3 ${palette[color] ?? palette.gray} ${alert ? 'ring-2 ring-amber-400' : ''}`}>
      <p className="text-xs font-medium opacity-70">{label}</p>
      <p className="text-xl font-bold mt-0.5">{value}</p>
      <p className="text-xs opacity-60">{sub}</p>
    </div>
  )
}

// ── Cost calculator ───────────────────────────────────────────────────────────

function CostCalc() {
  const [weight, setWeight] = useState(500)
  const [rate, setRate]     = useState(0)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3">
      <p className="text-xs font-semibold text-gray-700 mb-2">Cost Calculator</p>
      <div className="flex gap-1.5 items-center mb-2">
        <input type="number" min={500} step={100} value={weight} onChange={e => setWeight(Number(e.target.value))}
          className="w-20 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400" />
        <span className="text-xs text-gray-400">g →</span>
        <input type="number" min={0} step={10} value={rate} onChange={e => setRate(Number(e.target.value))}
          placeholder="Rate ₹"
          className="w-20 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400" />
      </div>
      {rate > 0 && (
        <div className="text-xs text-gray-600 space-y-0.5">
          <p>10 orders: <strong>{fmt(rate * 10)}</strong></p>
          <p>50 orders: <strong>{fmt(rate * 50)}</strong></p>
          <p>100 orders: <strong>{fmt(rate * 100)}</strong></p>
        </div>
      )}
    </div>
  )
}

// ── Main dashboard ────────────────────────────────────────────────────────────

const DELIVERY_DATE_PRESETS_UI = [
  { key: '7d',  label: '7d'  },
  { key: '14d', label: '14d' },
  { key: '30d', label: '30d' },
  { key: '90d', label: '90d' },
]

export default function DeliveryDashboard({
  partners, timeSeries, partnerStats, outForDelivery, orders, bulkOrders, totalStats, datePreset = '90d',
}: Props) {
  const [days, setDays]   = useState<number>(30)
  const [partner, setPartner] = useState<string>('All')

  const filteredSeries = useMemo(() => {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
    return timeSeries.filter(d => d.date >= cutoff)
  }, [timeSeries, days])

  const filteredStats = useMemo(() => {
    if (partner === 'All') return totalStats
    const ps = partnerStats.find(p => p.name === partner)
    if (!ps) return totalStats
    return {
      totalShipped:   ps.shipped,
      inTransit:      ps.inTransit,
      outForDelivery: 0,
      delivered:      ps.delivered,
      returned:       ps.returned,
      totalCost:      ps.totalCost,
      totalRevenue:   0,
      successRate:    ps.successRate,
      avgCost:        ps.shipped > 0 ? ps.totalCost / ps.shipped : 0,
    }
  }, [partner, partnerStats, totalStats])

  const displayOfd = partner === 'All' ? outForDelivery : outForDelivery.filter(o => o.partner === partner)

  return (
    <div className="flex gap-4 items-start min-h-0">

      {/* ── LEFT: Main operations panel ──────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-4">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Delivery Management</h1>
            <p className="text-xs text-gray-500">Book · Track · NDR · Pickup · Cancel — all in one place</p>
          </div>
          <div className="flex items-center gap-1.5">
            {DELIVERY_DATE_PRESETS_UI.map(({ key, label }) => (
              <a key={key} href={`/admin/delivery?date=${key}`}
                className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${datePreset === key ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {label}
              </a>
            ))}
          </div>
        </div>

        {/* Partner tabs */}
        <div className="flex flex-wrap gap-1.5">
          {['All', ...partners].map(p => (
            <button key={p} onClick={() => setPartner(p)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium border transition-colors ${partner === p ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
            >
              {p}
              {p !== 'All' && (
                <span className="ml-1.5 opacity-60">{partnerStats.find(s => s.name === p)?.shipped ?? 0}</span>
              )}
            </button>
          ))}
        </div>

        {/* Out for delivery alert */}
        {displayOfd.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-amber-700 font-semibold text-xs">Out for Delivery — Call customers</span>
              <span className="bg-amber-200 text-amber-800 text-xs font-bold px-1.5 py-0.5 rounded-full">{displayOfd.length}</span>
            </div>
            <div className="space-y-1.5">
              {displayOfd.slice(0, 5).map(o => (
                <div key={o.id} className="flex items-center justify-between bg-white border border-amber-100 rounded-lg px-3 py-1.5">
                  <div>
                    <p className="text-xs font-medium text-gray-800">{o.customerName}</p>
                    <p className="text-xs text-gray-400">{o.awb} · {fmt(o.total)}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Link href={`/admin/orders/${o.id}`} className="text-xs text-blue-600 hover:underline">View</Link>
                    {o.customerPhone && (
                      <a href={`tel:${o.customerPhone}`} className="px-2 py-1 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 font-medium">Call</a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bulk orders table */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-800">Orders</h2>
          </div>
          <BulkTable orders={bulkOrders} />
        </div>

        {/* Carrier performance */}
        {partnerStats.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Carrier Performance</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    {['Carrier', 'Shipped', 'Delivered', 'In Transit', 'Returned', 'Success', 'Total Cost', 'Avg'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {partnerStats.map(ps => (
                    <tr key={ps.name} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-900">{ps.name}</td>
                      <td className="px-3 py-2 text-gray-700">{ps.shipped}</td>
                      <td className="px-3 py-2 text-green-700">{ps.delivered}</td>
                      <td className="px-3 py-2 text-indigo-700">{ps.inTransit}</td>
                      <td className="px-3 py-2 text-red-700">{ps.returned}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <div className="w-16 bg-gray-100 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full bg-green-500" style={{ width: `${ps.successRate}%` }} />
                          </div>
                          <span className="text-gray-600">{ps.successRate}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-gray-700">{fmt(ps.totalCost)}</td>
                      <td className="px-3 py-2 text-gray-500">{ps.shipped > 0 ? fmt(ps.totalCost / ps.shipped) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── RIGHT: Analytics sidebar ──────────────────────────────────────── */}
      <div className="w-64 shrink-0 space-y-3 sticky top-4">

        {/* Revenue card */}
        <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
          <p className="text-xs font-semibold text-gray-700">Revenue ({days}d)</p>
          <div className="space-y-1.5">
            <StatCard label="Shipped Revenue" value={fmt(filteredStats.totalRevenue)} sub="from delivered orders" color="green" />
            <StatCard label="Delivery Cost" value={fmt(filteredStats.totalCost)} sub={`avg ${fmt(filteredStats.avgCost)}/order`} color="blue" />
            <StatCard label="Success Rate" value={`${filteredStats.successRate}%`} sub={`${filteredStats.delivered} of ${filteredStats.totalShipped}`} color="indigo" />
          </div>
        </div>

        {/* Cost calculator */}
        <CostCalc />

        {/* Mini chart */}
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-semibold text-gray-700">30-day Trend</p>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-green-500 inline-block" /> Rev</span>
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-500 inline-block" /> Cost</span>
            </div>
          </div>
          <MiniChart data={filteredSeries} />
        </div>

        {/* Status breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <p className="text-xs font-semibold text-gray-700 mb-2">Shipment Status</p>
          <div className="space-y-1.5">
            {[
              { label: 'In Transit', value: filteredStats.inTransit, color: 'bg-indigo-400' },
              { label: 'Out for Delivery', value: filteredStats.outForDelivery, color: 'bg-amber-400' },
              { label: 'Delivered', value: filteredStats.delivered, color: 'bg-green-400' },
              { label: 'Returned', value: filteredStats.returned, color: 'bg-red-400' },
            ].map(s => (
              <div key={s.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${s.color}`} />
                  <span className="text-xs text-gray-600">{s.label}</span>
                </div>
                <span className="text-xs font-semibold text-gray-800">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
