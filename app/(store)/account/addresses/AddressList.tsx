'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Trash2 } from 'lucide-react'
import AddressForm from './AddressForm'

interface Address {
  id: string
  full_name: string
  phone: string
  line1: string
  line2: string | null
  city: string
  state: string
  pincode: string
  is_default: boolean
}

interface Props {
  addresses: Address[]
  userId: string
}

export default function AddressList({ addresses, userId }: Props) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleDelete(id: string) {
    if (!confirm('Delete this address?')) return
    setDeletingId(id)
    const supabase = createClient()
    await supabase.from('addresses').delete().eq('id', id)
    setDeletingId(null)
    router.refresh()
  }

  return (
    <div className="space-y-4">

      {/* ── Saved addresses ── */}
      {addresses.length === 0 && !showForm && (
        <p className="text-gray-500 text-sm py-6 text-center">No saved addresses yet.</p>
      )}

      {addresses.map(addr => (
        <div key={addr.id}
          className="border rounded-2xl p-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="space-y-0.5 text-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-base">{addr.full_name}</span>
              {addr.is_default && (
                <span className="text-xs bg-black text-white px-2 py-0.5 rounded-full font-medium">
                  Default
                </span>
              )}
            </div>
            <p className="text-gray-700">{addr.line1}{addr.line2 ? `, ${addr.line2}` : ''}</p>
            <p className="text-gray-700">{addr.city}, {addr.state} — {addr.pincode}</p>
            <p className="text-gray-500">{addr.phone}</p>
          </div>

          <button
            onClick={() => handleDelete(addr.id)}
            disabled={deletingId === addr.id}
            aria-label="Delete address"
            className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 transition disabled:opacity-40 shrink-0"
          >
            <Trash2 size={15} />
            {deletingId === addr.id ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      ))}

      {/* ── Add new address form ── */}
      {showForm ? (
        <AddressForm userId={userId} onCancel={() => setShowForm(false)} />
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full border-2 border-dashed border-gray-300 rounded-2xl py-4 text-sm font-medium text-gray-500 hover:border-gray-400 hover:text-gray-700 transition"
        >
          + Add New Address
        </button>
      )}
    </div>
  )
}
