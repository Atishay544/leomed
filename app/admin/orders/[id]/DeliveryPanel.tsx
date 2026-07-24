'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Rate {
  carrier_id: string
  carrier_name: string
  carrier_slug: string
  service: string
  estimated_days: string
  rate: number
  is_live: boolean
  chargedGrams?: number
}

interface Scan {
  date: string
  status: string
  location: string
  instructions: string
}

interface TrackData {
  status: string
  edd: string | null
  scans: Scan[]
}

const TERMINAL_STATUSES = new Set(['shipped', 'delivered', 'cancelled', 'refunded'])

interface Props {
  orderId: string
  orderStatus: string
  toPin: string
  totalAmount: number
  currentPartner: string | null
  currentAwb: string | null
  currentRate: number | null
  currentService: string | null
}

export default function DeliveryPanel({
  orderId, orderStatus, toPin, totalAmount,
  currentPartner, currentAwb, currentRate, currentService,
}: Props) {
  const shippingLocked = TERMINAL_STATUSES.has(orderStatus)
  const router = useRouter()
  const [rates, setRates]         = useState<Rate[]>([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [warning, setWarning]     = useState<string | null>(null)
  const [assigning, setAssigning] = useState<string | null>(null)
  const [booking, setBooking]     = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [copied, setCopied]       = useState(false)

  const [selected, setSelected] = useState<Rate | null>(null)
  const [booked, setBooked]     = useState<{ partner: string; service: string; rate: number; awb: string | null } | null>(
    currentPartner
      ? { partner: currentPartner, service: currentService ?? '', rate: currentRate ?? 0, awb: currentAwb }
      : null
  )

  const [pkgWeight, setPkgWeight] = useState(0)  // grams, 0 = not loaded yet
  const [pkgDims, setPkgDims]     = useState({ length: 12, width: 12, height: 12 })  // cm
  const [dimsLoaded, setDimsLoaded] = useState(false)

  // Pickup location (warehouse) selector
  const [pickupLocs, setPickupLocs]     = useState<string[]>([])
  const [selectedPickup, setSelectedPickup] = useState('')

  // Tracking state
  const [trackData, setTrackData] = useState<TrackData | null>(null)
  const [tracking, setTracking]   = useState(false)
  const [showScans, setShowScans] = useState(false)

  // NDR state
  const [ndrOpen, setNdrOpen]     = useState(false)
  const [ndrAction, setNdrAction] = useState('RE-ATTEMPT')
  const [ndrDate, setNdrDate]     = useState('')
  const [ndrName, setNdrName]     = useState('')
  const [ndrPhone, setNdrPhone]   = useState('')
  const [ndrAdd, setNdrAdd]       = useState('')
  const [ndrLoading, setNdrLoading] = useState(false)

  // Cancel state
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  // Pickup state
  const [pickupOpen, setPickupOpen]   = useState(false)
  const [pickupDate, setPickupDate]   = useState('')
  const [pickupTime, setPickupTime]   = useState('10:00')
  const [pickupQty, setPickupQty]     = useState(1)
  const [pickupLoading, setPickupLoading] = useState(false)
  const [pickupResult, setPickupResult]   = useState<string | null>(null)

  useEffect(() => {
    // Auto-sync tracking status from Delhivery on mount if shipment is booked
    if (currentAwb) {
      fetch(`/api/admin/orders/${orderId}/sync-status`, { method: 'POST' })
        .then(r => r.json())
        .then(data => {
          if (data.cleared) {
            setBooked(null)
            setTrackData(null)
          } else if (data.liveStatus) {
            setTrackData(prev => prev ? { ...prev, status: data.liveStatus } : { status: data.liveStatus, edd: null, scans: [] })
          }
        })
        .catch(() => {})
    }

    // Load package defaults
    fetch(`/api/admin/orders/${orderId}/shipping-rates`)
      .then(r => r.json())
      .then(json => {
        if (json.weightGrams) setPkgWeight(json.weightGrams)
        if (json.dims) setPkgDims(json.dims)
        setDimsLoaded(true)
      })
      .catch(() => { setPkgWeight(500); setDimsLoaded(true) })

    // Load carrier config to pre-fill pickup location name, AND try warehouse list
    fetch('/api/admin/delivery-partners')
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (!json) return
        const delhivery = (json.data ?? []).find((p: any) => p.name === 'delhivery' && p.is_active)
        if (delhivery?.pickup_location_name) setSelectedPickup(delhivery.pickup_location_name)
      })
      .catch(() => {})

    // Try to load Delhivery warehouse names (may 404 for some account types)
    fetch('/api/admin/delhivery/warehouse')
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (!json) return
        const names: string[] = (json.warehouses ?? []).map((w: any) => w.name).filter(Boolean)
        if (names.length > 0) {
          setPickupLocs(names)
          // Only override if not already set from carrier config
          setSelectedPickup(prev => prev || names[0])
        }
      })
      .catch(() => {})
  }, [orderId])

  async function fetchRates() {
    setLoading(true); setError(null); setWarning(null)
    try {
      const res  = await fetch(`/api/admin/orders/${orderId}/shipping-rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weightGrams: pkgWeight,
          length: pkgDims.length,
          width:  pkgDims.width,
          height: pkgDims.height,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to fetch rates')
      if (json.warning) setWarning(json.warning)
      setRates(json.rates ?? [])
    } catch (e: any) { setError(e.message) }
    finally          { setLoading(false) }
  }

  async function selectRate(rate: Rate) {
    setAssigning(rate.carrier_id + rate.service); setError(null)
    try {
      const res  = await fetch(`/api/admin/orders/${orderId}/delivery`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          delivery_partner: rate.carrier_name,
          delivery_service: rate.service,
          delivery_rate:    rate.rate,
          delivery_awb:     null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to select rate')
      setSelected(rate)
      setBooked({ partner: rate.carrier_name, service: rate.service, rate: rate.rate, awb: null })
      setRates([])
    } catch (e: any) { setError(e.message) }
    finally          { setAssigning(null) }
  }

  async function bookShipment() {
    if (!selected && !booked) return
    const rate = selected ?? { carrier_id: '', service: booked!.service }
    setBooking(true); setError(null)
    try {
      const res  = await fetch(`/api/admin/orders/${orderId}/book-shipment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          carrier_id:           rate.carrier_id || undefined,
          service:              rate.service,
          pickup_location_name: selectedPickup || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Booking failed')
      setBooked(prev => prev ? { ...prev, awb: json.waybill } : prev)
      setSelected(null)
      router.refresh()
    } catch (e: any) { setError(e.message) }
    finally          { setBooking(false) }
  }

  async function downloadLabel() {
    setDownloading(true)
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/label`)
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `Label fetch failed (HTTP ${res.status})`)
      }
      const contentType = res.headers.get('content-type') ?? ''
      if (contentType.includes('text/html')) {
        throw new Error('Delhivery returned HTML instead of PDF — check API key permissions for label access.')
      }
      const blob = await res.blob()
      if (blob.size === 0) throw new Error('Label PDF is empty. Try re-booking the shipment.')
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = `label-${booked?.awb ?? orderId}.pdf`; a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) { setError(e.message) }
    finally          { setDownloading(false) }
  }

  function copyAwb() {
    if (!booked?.awb) return
    navigator.clipboard.writeText(booked.awb)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function fetchTracking() {
    setTracking(true); setError(null)
    try {
      const res  = await fetch(`/api/admin/orders/${orderId}/track`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Tracking failed')
      setTrackData(json)
      setShowScans(true)
    } catch (e: any) { setError(e.message) }
    finally          { setTracking(false) }
  }

  async function submitNDR() {
    setNdrLoading(true); setError(null)
    try {
      const body: Record<string, any> = { action: ndrAction }
      if (ndrAction === 'DEFER_DLV') body.deferred_date = ndrDate
      if (ndrAction === 'EDIT_DETAILS') { body.name = ndrName; body.phone = ndrPhone; body.add = ndrAdd }
      const res  = await fetch(`/api/admin/orders/${orderId}/ndr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'NDR action failed')
      setNdrOpen(false)
    } catch (e: any) { setError(e.message) }
    finally          { setNdrLoading(false) }
  }

  async function cancelShipment() {
    setCancelOpen(false)
    setCancelling(true); setError(null)
    try {
      const res  = await fetch(`/api/admin/orders/${orderId}/cancel-shipment`, { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? `Cancel failed (HTTP ${res.status})`)
      if (!json.success) throw new Error(json.error ?? 'Carrier did not confirm cancellation')
      setBooked(null)
      setTrackData(null)
      router.refresh()
    } catch (e: any) { setError(e.message) }
    finally          { setCancelling(false) }
  }

  async function requestPickup() {
    if (!pickupDate || !pickupTime) return
    setPickupLoading(true); setError(null)
    try {
      const res  = await fetch(`/api/admin/orders/${orderId}/pickup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pickup_date: pickupDate, pickup_time: pickupTime, quantity: pickupQty }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Pickup request failed')
      setPickupResult(json.pickup_id ? `Pickup scheduled (ID: ${json.pickup_id})` : 'Pickup scheduled')
      setPickupOpen(false)
    } catch (e: any) { setError(e.message) }
    finally          { setPickupLoading(false) }
  }

  const cheapest = rates[0]?.rate

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800">Shipping</h2>
        {!shippingLocked && (
          <button
            onClick={fetchRates}
            disabled={loading}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Loading…' : booked ? 'Compare Rates' : 'Get Rates'}
          </button>
        )}
      </div>

      <div className="px-5 py-4 space-y-3">

        {/* Package dimensions — hidden for terminal statuses */}
        {dimsLoaded && !shippingLocked && (
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <p className="text-xs font-semibold text-gray-600 mb-2">Package Details</p>
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Weight (g)</label>
                <input
                  type="number" min={1} value={pkgWeight}
                  onChange={e => setPkgWeight(Math.max(1, Number(e.target.value)))}
                  className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">L (cm)</label>
                <input
                  type="number" min={1} value={pkgDims.length}
                  onChange={e => setPkgDims(d => ({ ...d, length: Math.max(1, Number(e.target.value)) }))}
                  className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">W (cm)</label>
                <input
                  type="number" min={1} value={pkgDims.width}
                  onChange={e => setPkgDims(d => ({ ...d, width: Math.max(1, Number(e.target.value)) }))}
                  className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">H (cm)</label>
                <input
                  type="number" min={1} value={pkgDims.height}
                  onChange={e => setPkgDims(d => ({ ...d, height: Math.max(1, Number(e.target.value)) }))}
                  className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
            </div>
            {pkgWeight > 0 && (() => {
              const vol = Math.round((pkgDims.length * pkgDims.width * pkgDims.height) / 5)
              const charged = Math.max(pkgWeight, vol)
              return (
                <p className="text-xs text-gray-400 mt-1.5">
                  Actual: {pkgWeight}g · Volumetric: {vol}g · <span className="font-medium text-gray-600">Charged: {charged}g</span>
                </p>
              )
            })()}

            {/* Pickup location — always editable, autocomplete if warehouse list loaded */}
            <div className="mt-3 pt-3 border-t border-gray-200">
              <label className="text-xs text-gray-400 block mb-1">
                Pickup Location Name
                <span className="ml-1 text-red-500 font-semibold">*</span>
              </label>
              <input
                list="pickup-loc-list"
                type="text"
                value={selectedPickup}
                onChange={e => setSelectedPickup(e.target.value)}
                placeholder="e.g. Shop location, home — must match Delhivery exactly"
                className="w-full text-xs border border-blue-300 bg-blue-50 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium text-blue-800 placeholder:font-normal placeholder:text-blue-400"
              />
              {pickupLocs.length > 0 && (
                <datalist id="pickup-loc-list">
                  {pickupLocs.map(name => <option key={name} value={name} />)}
                </datalist>
              )}
              <p className="text-xs text-gray-400 mt-1">
                Must match exactly a pickup location name in your Delhivery account.
                {pickupLocs.length > 0
                  ? ` ${pickupLocs.length} warehouse(s) loaded — select or type.`
                  : ' Go to Delhivery → Settings → Pickup Locations to find the exact name.'}
              </p>
            </div>
          </div>
        )}

        {/* Booked state */}
        {booked && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-green-800">{booked.partner} · {booked.service}</p>
                <p className="text-xs text-green-700">₹{Number(booked.rate).toLocaleString('en-IN')} · {booked.service === 'Express' ? '2-3 days' : '5-7 days'}</p>
              </div>
              {!booked.awb && (
                <button
                  onClick={bookShipment}
                  disabled={booking}
                  className="px-3 py-1.5 text-xs bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:opacity-50 font-medium transition-colors"
                >
                  {booking ? 'Booking…' : '📦 Book Shipment'}
                </button>
              )}
            </div>

            {booked.awb && (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono bg-white border border-green-200 px-2 py-1 rounded text-green-800">AWB: {booked.awb}</span>
                  <button onClick={copyAwb} className="text-xs px-2 py-1 bg-green-100 hover:bg-green-200 rounded text-green-700 transition-colors">
                    {copied ? '✓ Copied' : 'Copy AWB'}
                  </button>
                  <button onClick={downloadLabel} disabled={downloading}
                    className="text-xs px-2 py-1 bg-white border border-green-300 hover:bg-green-50 rounded text-green-700 transition-colors disabled:opacity-50">
                    {downloading ? 'Downloading…' : '⬇ Label PDF'}
                  </button>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-green-100">
                  <button
                    onClick={fetchTracking}
                    disabled={tracking}
                    className="text-xs px-2 py-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded text-blue-700 transition-colors disabled:opacity-50"
                  >
                    {tracking ? 'Fetching…' : '📍 Track'}
                  </button>
                  <button
                    onClick={() => setNdrOpen(o => !o)}
                    className="text-xs px-2 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded text-amber-700 transition-colors"
                  >
                    ⚠ NDR Action
                  </button>
                  <button
                    onClick={() => setPickupOpen(o => !o)}
                    className="text-xs px-2 py-1 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded text-purple-700 transition-colors"
                  >
                    🚚 Request Pickup
                  </button>
                  <button
                    onClick={() => setCancelOpen(true)}
                    disabled={cancelling}
                    className="text-xs px-2 py-1 bg-red-50 hover:bg-red-100 border border-red-200 rounded text-red-700 transition-colors disabled:opacity-50 ml-auto"
                  >
                    {cancelling ? 'Cancelling…' : '✕ Cancel Shipment'}
                  </button>
                </div>

                {/* Cancel confirmation modal */}
                {cancelOpen && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setCancelOpen(false)} />
                    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                          <span className="text-red-600 text-lg">✕</span>
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-gray-900">Cancel Shipment</h3>
                          <p className="text-xs text-gray-500">AWB: {booked?.awb}</p>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">
                        This will request cancellation with <span className="font-semibold">{booked?.partner}</span>. The shipment will be cancelled if it hasn't been picked up yet.
                      </p>
                      <p className="text-xs text-red-600 font-medium mb-5">⚠ This action cannot be undone.</p>
                      <div className="flex gap-3">
                        <button
                          onClick={cancelShipment}
                          disabled={cancelling}
                          className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
                        >
                          {cancelling ? 'Cancelling…' : 'Yes, Cancel Shipment'}
                        </button>
                        <button
                          onClick={() => setCancelOpen(false)}
                          className="flex-1 py-2.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
                        >
                          Keep Shipment
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* NDR form */}
                {ndrOpen && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                    <p className="text-xs font-semibold text-amber-800">NDR Action</p>
                    <select
                      value={ndrAction}
                      onChange={e => setNdrAction(e.target.value)}
                      className="w-full text-xs border border-amber-200 rounded px-2 py-1.5 bg-white"
                    >
                      <option value="RE-ATTEMPT">Re-attempt Delivery</option>
                      <option value="DEFER_DLV">Defer Delivery</option>
                      <option value="EDIT_DETAILS">Edit Delivery Details</option>
                      <option value="RTO">Return to Origin</option>
                    </select>
                    {ndrAction === 'DEFER_DLV' && (
                      <input type="date" value={ndrDate} onChange={e => setNdrDate(e.target.value)}
                        className="w-full text-xs border border-amber-200 rounded px-2 py-1.5" />
                    )}
                    {ndrAction === 'EDIT_DETAILS' && (
                      <div className="space-y-1">
                        <input type="text" placeholder="New name" value={ndrName} onChange={e => setNdrName(e.target.value)}
                          className="w-full text-xs border border-amber-200 rounded px-2 py-1.5" />
                        <input type="text" placeholder="New phone" value={ndrPhone} onChange={e => setNdrPhone(e.target.value)}
                          className="w-full text-xs border border-amber-200 rounded px-2 py-1.5" />
                        <input type="text" placeholder="New address" value={ndrAdd} onChange={e => setNdrAdd(e.target.value)}
                          className="w-full text-xs border border-amber-200 rounded px-2 py-1.5" />
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button onClick={submitNDR} disabled={ndrLoading}
                        className="flex-1 text-xs py-1.5 bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50">
                        {ndrLoading ? 'Submitting…' : 'Submit'}
                      </button>
                      <button onClick={() => setNdrOpen(false)}
                        className="text-xs px-3 py-1.5 bg-white border border-amber-200 rounded hover:bg-amber-50 text-amber-700">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Pickup form */}
                {pickupOpen && (
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg space-y-2">
                    <p className="text-xs font-semibold text-purple-800">Schedule Pickup</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-purple-700 block mb-1">Date</label>
                        <input type="date" value={pickupDate} onChange={e => setPickupDate(e.target.value)}
                          min={new Date().toISOString().split('T')[0]}
                          className="w-full text-xs border border-purple-200 rounded px-2 py-1.5" />
                      </div>
                      <div>
                        <label className="text-xs text-purple-700 block mb-1">Time</label>
                        <input type="time" value={pickupTime} onChange={e => setPickupTime(e.target.value)}
                          className="w-full text-xs border border-purple-200 rounded px-2 py-1.5" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-purple-700 block mb-1">Packages</label>
                      <input type="number" min={1} value={pickupQty} onChange={e => setPickupQty(Number(e.target.value))}
                        className="w-full text-xs border border-purple-200 rounded px-2 py-1.5" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={requestPickup} disabled={pickupLoading || !pickupDate}
                        className="flex-1 text-xs py-1.5 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50">
                        {pickupLoading ? 'Scheduling…' : 'Schedule'}
                      </button>
                      <button onClick={() => setPickupOpen(false)}
                        className="text-xs px-3 py-1.5 bg-white border border-purple-200 rounded hover:bg-purple-50 text-purple-700">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Tracking panel */}
                {trackData && showScans && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-blue-800">
                        Status: <span className="font-bold">{trackData.status}</span>
                        {trackData.edd && <span className="ml-2 font-normal text-blue-600">EDD: {trackData.edd}</span>}
                      </p>
                      <button onClick={() => setShowScans(false)} className="text-xs text-blue-500 hover:text-blue-700">Close</button>
                    </div>
                    {trackData.scans.length > 0 ? (
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {trackData.scans.map((s, i) => (
                          <div key={i} className="text-xs border-l-2 border-blue-300 pl-2 py-0.5">
                            <p className="font-medium text-blue-900">{s.status}</p>
                            <p className="text-blue-600">{s.location} · {s.date}</p>
                            {s.instructions && <p className="text-blue-500 italic">{s.instructions}</p>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-blue-600">No scan history yet.</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {pickupResult && (
          <p className="text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded px-3 py-2">{pickupResult}</p>
        )}

        {!booked && !loading && rates.length === 0 && (
          <p className="text-sm text-gray-400">Click "Get Rates" to compare live rates from all configured carriers.</p>
        )}

        {warning && <p className="text-xs text-amber-600">{warning}</p>}
        {!toPin  && <p className="text-xs text-amber-600">⚠ No pincode found in shipping address.</p>}
        {error   && <p className="text-sm text-red-600">{error}</p>}

        {/* Rate comparison list */}
        {rates.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-gray-500 font-medium">Sorted by price — cheapest first</p>
            {rates.map(rate => {
              const isCheapest = rate.rate === cheapest
              return (
                <div key={rate.carrier_id + rate.service}
                  className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${
                    isCheapest ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:border-blue-200'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-800">{rate.carrier_name}</p>
                      {isCheapest && <span className="text-xs px-1.5 py-0.5 bg-green-200 text-green-800 rounded font-medium">Cheapest</span>}
                      {!rate.is_live && <span className="text-xs px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded border border-yellow-200">estimated</span>}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {rate.service} · {rate.estimated_days}
                      {rate.chargedGrams && <span className="ml-1">· {rate.chargedGrams}g charged</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-gray-900">₹{Number(rate.rate).toLocaleString('en-IN')}</span>
                    <button
                      onClick={() => selectRate(rate)}
                      disabled={assigning === rate.carrier_id + rate.service}
                      className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {assigning === rate.carrier_id + rate.service ? 'Selecting…' : 'Select'}
                    </button>
                  </div>
                </div>
              )
            })}
            <button onClick={() => setRates([])} className="text-xs text-gray-400 hover:text-gray-600 w-full text-center pt-1">
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
