'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ConfirmModal from '@/components/ui/ConfirmModal'

interface Props {
  couponId: string
  isActive: boolean
  code: string
}

export default function CouponActions({ couponId, isActive, code }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)

  async function toggle() {
    setBusy(true)
    setError('')
    const res = await fetch('/api/admin/coupons', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: couponId, is_active: !isActive }),
    })
    setBusy(false)
    if (!res.ok) { const j = await res.json(); setError(j.error); return }
    router.refresh()
  }

  async function handleDelete() {
    setBusy(true)
    setError('')
    const res = await fetch('/api/admin/coupons', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: couponId }),
    })
    setBusy(false)
    setShowConfirm(false)
    if (!res.ok) { const j = await res.json(); setError(j.error); return }
    router.refresh()
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={toggle}
          disabled={busy}
          className={`text-xs px-2 py-1 rounded transition-colors disabled:opacity-40 ${
            isActive
              ? 'text-amber-700 bg-amber-50 hover:bg-amber-100'
              : 'text-green-700 bg-green-50 hover:bg-green-100'
          }`}
        >
          {busy ? '…' : isActive ? 'Deactivate' : 'Activate'}
        </button>
        <button
          onClick={() => setShowConfirm(true)}
          disabled={busy}
          className="text-xs text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1 rounded transition-colors disabled:opacity-40"
        >
          Delete
        </button>
      </div>
      {error && <p className="text-[11px] text-red-500">{error}</p>}
      {showConfirm && (
        <ConfirmModal
          message={`Delete coupon "${code}"? This cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setShowConfirm(false)}
          loading={busy}
        />
      )}
    </div>
  )
}
