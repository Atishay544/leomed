'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CouponForm() {
  const router = useRouter()

  const [code, setCode]         = useState('')
  const [type, setType]         = useState<'percentage' | 'flat'>('percentage')
  const [value, setValue]       = useState('')
  const [minOrder, setMinOrder] = useState('')
  const [maxUses, setMaxUses]   = useState('')
  const [expiresAt, setExpires] = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)

    const res = await fetch('/api/admin/coupons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code:       code.trim().toUpperCase(),
        type,
        value:      parseFloat(value),
        min_order:  minOrder ? parseFloat(minOrder) : 0,
        max_uses:   maxUses ? parseInt(maxUses, 10) : null,
        expires_at: expiresAt || null,
      }),
    })

    const json = await res.json()
    setSaving(false)

    if (!res.ok) {
      setError(json.error ?? 'Failed to create coupon')
    } else {
      setCode(''); setValue(''); setMinOrder(''); setMaxUses(''); setExpires('')
      router.refresh()
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-base font-semibold text-gray-800 mb-4">New Coupon</h2>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
          {/* Code */}
          <div className="lg:col-span-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">Code *</label>
            <input
              type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())} required
              placeholder="SUMMER20"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
            <select value={type} onChange={e => setType(e.target.value as 'percentage' | 'flat')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
              <option value="percentage">Percent (%)</option>
              <option value="flat">Fixed ($)</option>
            </select>
          </div>

          {/* Value */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Value *</label>
            <input
              type="number" min="0.01" step="0.01" value={value}
              onChange={e => setValue(e.target.value)} required
              placeholder={type === 'percentage' ? '20' : '10.00'}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          {/* Min order */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Min Order ($)</label>
            <input
              type="number" min="0" step="0.01" value={minOrder}
              onChange={e => setMinOrder(e.target.value)} placeholder="0"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          {/* Max uses */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Max Uses</label>
            <input
              type="number" min="1" step="1" value={maxUses}
              onChange={e => setMaxUses(e.target.value)} placeholder="Unlimited"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          {/* Expires */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Expires At</label>
            <input
              type="datetime-local" value={expiresAt} onChange={e => setExpires(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
        </div>

        <div className="mt-4">
          <button type="submit" disabled={saving}
            className="bg-gray-900 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
            {saving ? 'Creating…' : '+ Create Coupon'}
          </button>
        </div>
      </form>
    </div>
  )
}
