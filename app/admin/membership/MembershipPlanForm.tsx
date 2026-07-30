'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Plan {
  id: string
  name: string
  price: number
  duration_months: number
  free_shipping: boolean
  discount_pct: number
  is_active: boolean
}

export default function MembershipPlanForm({ plan }: { plan: Plan }) {
  const router = useRouter()
  const [name, setName]           = useState(plan.name)
  const [price, setPrice]         = useState(String(plan.price))
  const [months, setMonths]       = useState(String(plan.duration_months))
  const [freeShipping, setFreeShipping] = useState(plan.free_shipping)
  const [discountPct, setDiscountPct]   = useState(String(plan.discount_pct))
  const [isActive, setIsActive]   = useState(plan.is_active)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [saved, setSaved]         = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setSaved(false); setSaving(true)
    const res = await fetch('/api/admin/membership', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: plan.id,
        name: name.trim(),
        price: parseFloat(price),
        duration_months: parseInt(months, 10),
        free_shipping: freeShipping,
        discount_pct: parseFloat(discountPct),
        is_active: isActive,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const j = await res.json()
      setError(j.error ?? 'Failed to save')
      return
    }
    setSaved(true)
    router.refresh()
  }

  const INPUT = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900'
  const LABEL = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
      {saved && <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">Saved.</div>}

      <div>
        <label className={LABEL}>Plan Name</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} required className={INPUT} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>Price (₹)</label>
          <input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} required className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>Duration (months)</label>
          <input type="number" value={months} onChange={e => setMonths(e.target.value)} required className={INPUT} />
        </div>
      </div>
      <div>
        <label className={LABEL}>Extra Discount (%) on every order</label>
        <input type="number" step="0.1" value={discountPct} onChange={e => setDiscountPct(e.target.value)} required className={INPUT} />
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={freeShipping} onChange={e => setFreeShipping(e.target.checked)} />
        Free shipping perk (displayed on Care Plan page)
      </label>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
        Plan is active (visible + subscribable on /care-plan)
      </label>

      <button type="submit" disabled={saving}
        className="w-full bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
        {saving ? 'Saving…' : 'Save Changes'}
      </button>
    </form>
  )
}
