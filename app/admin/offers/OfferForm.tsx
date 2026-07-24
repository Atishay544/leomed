'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function OfferForm() {
  const router = useRouter()
  const [title, setTitle]           = useState('')
  const [description, setDesc]      = useState('')
  const [type, setType]             = useState('cod_upfront')
  const [upfrontPct, setUpfront]    = useState('10')
  const [discountPct, setDiscount]  = useState('5')
  const [sortOrder, setSort]        = useState('0')
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    const res = await fetch('/api/admin/offers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description,
        type,
        upfront_pct:  type === 'cod_upfront' ? Number(upfrontPct) : null,
        discount_pct: type === 'cod_upfront' ? Number(discountPct) : null,
        sort_order: Number(sortOrder),
        is_active: true,
      }),
    })
    setSaving(false)
    if (!res.ok) { const j = await res.json(); setError(j.error); return }
    setTitle(''); setDesc(''); setUpfront('10'); setDiscount('5'); setSort('0')
    router.refresh()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-base font-semibold text-gray-800 mb-4">New Offer</h2>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} required
            placeholder="e.g. Pay 10% Upfront & Save 5% on COD"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <input value={description} onChange={e => setDesc(e.target.value)}
            placeholder="Optional short description"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <select value={type} onChange={e => setType(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
            <option value="cod_upfront">COD Upfront Discount</option>
            <option value="custom">Custom / Informational</option>
          </select>
        </div>
        {type === 'cod_upfront' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Upfront % *</label>
              <input type="number" min="1" max="100" value={upfrontPct} onChange={e => setUpfront(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Discount on Rest % *</label>
              <input type="number" min="1" max="100" value={discountPct} onChange={e => setDiscount(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
          <input type="number" value={sortOrder} onChange={e => setSort(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
        <button type="submit" disabled={saving}
          className="w-full bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
          {saving ? 'Creating…' : 'Create Offer'}
        </button>
      </form>
    </div>
  )
}
