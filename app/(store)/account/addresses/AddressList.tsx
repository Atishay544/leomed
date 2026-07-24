'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Trash2, PackageCheck } from 'lucide-react'
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

interface OrderAddress {
  full_name: string
  phone: string
  line1: string
  line2: string | null
  city: string
  state: string
  pincode: string
}

interface Props {
  addresses: Address[]
  orderAddresses: OrderAddress[]
  userId: string
}

export default function AddressList({ addresses, orderAddresses, userId }: Props) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [savingIdx, setSavingIdx] = useState<number | null>(null)
  const [savedIdxs, setSavedIdxs] = useState<Set<number>>(new Set())

  async function handleDelete(id: string) {
    if (!confirm('Delete this address?')) return
    setDeletingId(id)
    const supabase = createClient()
    await supabase.from('addresses').delete().eq('id', id)
    setDeletingId(null)
    router.refresh()
  }

  async function handleSaveOrderAddress(addr: OrderAddress, idx: number) {
    setSavingIdx(idx)
    const supabase = createClient()
    const { error } = await supabase.from('addresses').insert({
      user_id:   userId,
      full_name: addr.full_name,
      phone:     addr.phone,
      line1:     addr.line1,
      line2:     addr.line2 || null,
      city:      addr.city,
      state:     addr.state,
      pincode:   addr.pincode,
      is_default: addresses.length === 0 && idx === 0, // first save becomes default
    })
    setSavingIdx(null)
    if (!error) {
      setSavedIdxs(prev => new Set(prev).add(idx))
      router.refresh()
    }
  }

  return (
    <div className="space-y-4">

      {/* ── Saved addresses ── */}
      {addresses.length === 0 && !showForm && orderAddresses.length === 0 && (
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

      {/* ── Addresses from past orders ── */}
      {orderAddresses.length > 0 && (
        <div className="mt-2">
          <div className="flex items-center gap-2 mb-3">
            <PackageCheck size={15} className="text-gray-400" />
            <p className="text-sm font-medium text-gray-500">From your recent orders</p>
          </div>
          <div className="space-y-3">
            {orderAddresses.map((addr, idx) => (
              <div key={idx}
                className={`border border-dashed rounded-2xl p-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 transition
                  ${savedIdxs.has(idx) ? 'border-green-300 bg-green-50/50' : 'border-gray-300 bg-gray-50/50'}`}>
                <div className="space-y-0.5 text-sm">
                  <p className="font-semibold text-base text-gray-800">{addr.full_name}</p>
                  <p className="text-gray-600">{addr.line1}{addr.line2 ? `, ${addr.line2}` : ''}</p>
                  <p className="text-gray-600">{addr.city}, {addr.state} — {addr.pincode}</p>
                  <p className="text-gray-500">{addr.phone}</p>
                </div>

                {savedIdxs.has(idx) ? (
                  <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium shrink-0">
                    ✓ Saved
                  </span>
                ) : (
                  <button
                    onClick={() => handleSaveOrderAddress(addr, idx)}
                    disabled={savingIdx === idx}
                    className="flex items-center gap-1.5 text-sm font-medium text-black border border-gray-300 rounded-xl px-4 py-2 hover:bg-gray-100 transition disabled:opacity-40 shrink-0"
                  >
                    {savingIdx === idx ? 'Saving…' : '+ Save Address'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

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
