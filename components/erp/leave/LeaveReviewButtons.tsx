'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { reviewLeaveRequest } from '@/lib/erp/actions/leave'
import type { LeaveStatus } from '@/lib/erp/types'

export default function LeaveReviewButtons({ id, status }: { id: string; status: LeaveStatus }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function review(newStatus: 'APPROVED' | 'REJECTED' | 'CANCELLED') {
    setError(null)
    startTransition(async () => {
      const result = await reviewLeaveRequest({ leave_id: id, status: newStatus })
      if (result.ok) router.refresh()
      else setError(result.error ?? 'Could not update the request.')
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {error && <span className="text-[11px] text-red-600">{error}</span>}
      <div className="flex gap-1.5">
        {status === 'PENDING' && (
          <>
            <button
              type="button" onClick={() => review('APPROVED')} disabled={pending}
              className="rounded-lg bg-emerald-700 px-2.5 py-1 text-[11.5px] font-semibold text-white
                         hover:bg-emerald-800 disabled:opacity-50"
            >
              {pending ? <Loader2 size={12} className="animate-spin" /> : 'Approve'}
            </button>
            <button
              type="button" onClick={() => review('REJECTED')} disabled={pending}
              className="rounded-lg border border-red-300 bg-white px-2.5 py-1 text-[11.5px] font-semibold
                         text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Reject
            </button>
          </>
        )}
        {(status === 'PENDING' || status === 'APPROVED') && (
          <button
            type="button" onClick={() => review('CANCELLED')} disabled={pending}
            className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-[11.5px] font-medium
                       text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
