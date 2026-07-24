'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const ALL_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']

interface Props {
  orderId: string
  currentStatus: string
  currentTracking: string
  utrNumber?: string | null
  paymentStatus?: string | null
}

export default function OrderDetailActions({ orderId, currentStatus, currentTracking, utrNumber, paymentStatus }: Props) {
  const router = useRouter()
  const [status, setStatus] = useState(currentStatus)
  const [tracking, setTracking] = useState(currentTracking)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState('')

  async function handleSave() {
    setSaving(true)
    setMessage('')
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, tracking_number: tracking }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Save failed')
      setMessage('Saved successfully.')
      router.refresh()
    } catch (e: any) {
      setMessage(`Error: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleConfirmUpi() {
    const isPartialCod = paymentStatus === 'partial'
    const label = isPartialCod ? 'Partial COD advance' : 'UPI payment'
    const newPaymentStatus = isPartialCod ? 'upi_confirmed' : 'prepaid'
    if (!confirm(`Confirm ${label} with UTR: ${utrNumber}?\n\nThis will mark the order as Confirmed.`)) return
    setConfirming(true)
    setMessage('')
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'confirmed', payment_status: newPaymentStatus }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Confirmation failed')
      setStatus('confirmed')
      setMessage(`${label} confirmed. Order is now Confirmed.`)
      router.refresh()
    } catch (e: any) {
      setMessage(`Error: ${e.message}`)
    } finally {
      setConfirming(false)
    }
  }

  const isUpiPending    = paymentStatus === 'upi_pending'
  const isPartialPending = paymentStatus === 'partial' && !!utrNumber

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-base font-semibold text-gray-800 mb-4">Update Order</h2>

      {/* UPI confirmation panel */}
      {utrNumber && (
        <div className={`mb-5 rounded-xl p-4 border ${(isUpiPending || isPartialPending) ? 'bg-purple-50 border-purple-300' : 'bg-green-50 border-green-300'}`}>
          <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${(isUpiPending || isPartialPending) ? 'text-purple-700' : 'text-green-700'}`}>
            {isPartialPending
              ? 'Partial COD Advance — Awaiting Verification'
              : isUpiPending
                ? 'UPI Payment — Awaiting Verification'
                : 'UPI Payment — Confirmed'}
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">UTR / Transaction ID</p>
              <p className="font-mono font-bold text-lg tracking-wider text-gray-900">{utrNumber}</p>
            </div>
            {(isUpiPending || isPartialPending) && (
              <button
                onClick={handleConfirmUpi}
                disabled={confirming}
                className="ml-auto px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {confirming ? 'Confirming…' : 'Confirm Payment'}
              </button>
            )}
            {!isUpiPending && !isPartialPending && (
              <span className="ml-auto text-green-700 font-semibold text-sm">Payment Confirmed</span>
            )}
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            {ALL_STATUSES.map(s => (
              <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Tracking Number</label>
          <input
            type="text"
            value={tracking}
            onChange={e => setTracking(e.target.value)}
            placeholder="Enter tracking number…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>

        {message && (
          <p className={`text-sm ${message.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
            {message}
          </p>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}
