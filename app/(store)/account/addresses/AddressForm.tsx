'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Props {
  userId: string
  onCancel: () => void
}

export default function AddressForm({ userId, onCancel }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    pincode: '',
    is_default: false,
  })

  function set(field: keyof typeof form, value: string | boolean) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error: err } = await supabase.from('addresses').insert({
      user_id: userId,
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      line1: form.line1.trim(),
      line2: form.line2.trim() || null,
      city: form.city.trim(),
      state: form.state.trim(),
      pincode: form.pincode.trim(),
      is_default: form.is_default,
    })

    setLoading(false)
    if (err) { setError(err.message); return }
    router.refresh()
    onCancel()
  }

  const inputCls =
    'w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black'
  const labelCls = 'block text-sm text-gray-600 mb-1'

  return (
    <form onSubmit={handleSubmit} className="border rounded-2xl p-6 space-y-4 bg-gray-50">
      <h2 className="font-semibold text-base">New Address</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Full Name *</label>
          <input required value={form.full_name} onChange={e => set('full_name', e.target.value)}
            className={inputCls} placeholder="Jane Doe" />
        </div>
        <div>
          <label className={labelCls}>Phone *</label>
          <input required value={form.phone} onChange={e => set('phone', e.target.value)}
            className={inputCls} placeholder="+91XXXXXXXXXX" />
        </div>
      </div>

      <div>
        <label className={labelCls}>Address Line 1 *</label>
        <input required value={form.line1} onChange={e => set('line1', e.target.value)}
          className={inputCls} placeholder="House/Flat no., Street" />
      </div>

      <div>
        <label className={labelCls}>Address Line 2</label>
        <input value={form.line2} onChange={e => set('line2', e.target.value)}
          className={inputCls} placeholder="Landmark, Area (optional)" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>City *</label>
          <input required value={form.city} onChange={e => set('city', e.target.value)}
            className={inputCls} placeholder="Mumbai" />
        </div>
        <div>
          <label className={labelCls}>State *</label>
          <input required value={form.state} onChange={e => set('state', e.target.value)}
            className={inputCls} placeholder="Maharashtra" />
        </div>
        <div>
          <label className={labelCls}>Pincode *</label>
          <input required value={form.pincode} onChange={e => set('pincode', e.target.value)}
            className={inputCls} placeholder="400001" maxLength={6} />
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={form.is_default}
          onChange={e => set('is_default', e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-black focus:ring-black"
        />
        <span className="text-sm text-gray-700">Set as default address</span>
      </label>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="flex gap-3 pt-1">
        <button type="submit" disabled={loading}
          className="bg-black text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-800 transition disabled:opacity-50">
          {loading ? 'Saving…' : 'Save Address'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-6 py-2.5 rounded-xl text-sm font-semibold border border-gray-300 hover:bg-gray-100 transition">
          Cancel
        </button>
      </div>
    </form>
  )
}
