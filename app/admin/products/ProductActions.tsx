'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ConfirmModal from '@/components/ui/ConfirmModal'

interface Props {
  productId: string
  isActive: boolean
  productName: string
}

export default function ProductActions({ productId, isActive, productName }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  async function toggleActive() {
    setBusy(true)
    await fetch('/api/admin/products', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: productId, is_active: !isActive }),
    })
    setBusy(false)
    router.refresh()
  }

  async function handleDelete() {
    setBusy(true)
    const res = await fetch('/api/admin/products', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: productId }),
    })
    setBusy(false)
    setShowConfirm(false)
    if (res.ok) router.refresh()
  }

  return (
    <div className="flex items-center gap-2 justify-end">
      <Link
        href={`/admin/products/${productId}`}
        className="text-xs text-blue-600 hover:underline px-2 py-1"
      >
        Edit
      </Link>
      <button
        onClick={toggleActive}
        disabled={busy}
        className={`text-xs px-2 py-1 rounded hover:opacity-80 transition-opacity disabled:opacity-40 ${
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
      {showConfirm && (
        <ConfirmModal
          message={`Delete "${productName}"? This cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setShowConfirm(false)}
          loading={busy}
        />
      )}
    </div>
  )
}
