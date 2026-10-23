'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { cancelActivityRequest } from '@/lib/erp/actions/activities'

export default function CancelActivityButton({ id }: { id: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function cancel() {
    if (!confirm('Cancel this request? It will be withdrawn from approval.')) return
    setError(null)
    startTransition(async () => {
      const result = await cancelActivityRequest(id)
      if (result.ok) router.refresh()
      else setError(result.error ?? 'Could not cancel the request.')
    })
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      {error && <span className="text-[11px] text-red-600">{error}</span>}
      <button
        type="button" onClick={cancel} disabled={pending}
        className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1
                   text-[11.5px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
      >
        {pending && <Loader2 size={12} className="animate-spin" />} Cancel
      </button>
    </span>
  )
}
