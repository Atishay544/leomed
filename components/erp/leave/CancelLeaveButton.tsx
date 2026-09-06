'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { cancelMyLeaveRequest } from '@/lib/erp/actions/leave'

export default function CancelLeaveButton({ id }: { id: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const onClick = () => {
    if (!confirm('Cancel this leave request?')) return
    setError(null)
    startTransition(async () => {
      const result = await cancelMyLeaveRequest(id)
      if (result.ok) router.refresh()
      else setError(result.error ?? 'Could not cancel the request.')
    })
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {error && <span className="text-[11px] text-red-600">{error}</span>}
      <button
        type="button" onClick={onClick} disabled={pending}
        className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-[11.5px] font-medium
                   text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
      >
        {pending ? <Loader2 size={12} className="animate-spin" /> : 'Cancel'}
      </button>
    </span>
  )
}
