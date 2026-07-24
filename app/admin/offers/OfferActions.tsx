'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ConfirmModal from '@/components/ui/ConfirmModal'

interface Props { offerId: string; isActive: boolean }

export default function OfferActions({ offerId, isActive }: Props) {
  const router = useRouter()
  const [busy, setBusy]             = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  async function toggle() {
    setBusy(true)
    await fetch('/api/admin/offers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: offerId, is_active: !isActive }),
    })
    setBusy(false)
    router.refresh()
  }

  async function handleDelete() {
    setBusy(true)
    await fetch('/api/admin/offers', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: offerId }),
    })
    setBusy(false)
    setShowConfirm(false)
    router.refresh()
  }

  return (
    <div className="flex items-center gap-2 justify-end">
      <button onClick={toggle} disabled={busy}
        className={`text-xs px-2 py-1 rounded hover:opacity-80 transition-opacity disabled:opacity-40 ${
          isActive ? 'text-amber-700 bg-amber-50' : 'text-green-700 bg-green-50'
        }`}>
        {isActive ? 'Deactivate' : 'Activate'}
      </button>
      <button onClick={() => setShowConfirm(true)} disabled={busy}
        className="text-xs text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1 rounded transition-colors disabled:opacity-40">
        Delete
      </button>
      {showConfirm && (
        <ConfirmModal
          message="Delete this offer? This cannot be undone."
          onConfirm={handleDelete}
          onCancel={() => setShowConfirm(false)}
          loading={busy}
        />
      )}
    </div>
  )
}
