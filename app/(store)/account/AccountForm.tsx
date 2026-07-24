'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle2 } from 'lucide-react'

export default function AccountForm({
  userId, email, defaultName, defaultPhone,
}: {
  userId: string; email: string; defaultName: string; defaultPhone: string
}) {
  const [name, setName] = useState(defaultName)
  const [phone, setPhone] = useState(defaultPhone)
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setLoading(true); setError('')
    const supabase = createClient()
    const { error: err } = await supabase
      .from('profiles')
      .update({ full_name: name.trim(), phone: phone.trim() })
      .eq('id', userId)
    setLoading(false)
    if (err) { setError(err.message); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm text-gray-600 mb-1">Email</label>
        <input value={email} disabled
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 text-gray-500" />
      </div>
      <div>
        <label className="block text-sm text-gray-600 mb-1">Full Name</label>
        <input value={name} onChange={e => setName(e.target.value)}
          className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
      </div>
      <div>
        <label className="block text-sm text-gray-600 mb-1">Phone</label>
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91XXXXXXXXXX"
          className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button onClick={save} disabled={loading}
        className="w-full bg-black text-white py-3 rounded-xl font-semibold hover:bg-gray-800 transition disabled:opacity-50 flex items-center justify-center gap-2">
        {saved ? <><CheckCircle2 size={18} /> Saved!</> : loading ? 'Saving…' : 'Save Changes'}
      </button>
    </div>
  )
}
