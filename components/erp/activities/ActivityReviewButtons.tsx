'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { reviewActivityRequest } from '@/lib/erp/actions/activities'

/** Approve, or reject with a mandatory reason. Whether the caller is actually
 *  allowed (the current approver, or an admin) is decided by the database —
 *  a refusal is shown here as the error line. */
export default function ActivityReviewButtons({ id, finalApproval }: { id: string; finalApproval: boolean }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [remarks, setRemarks] = useState('')
  const [pending, startTransition] = useTransition()

  function review(decision: 'APPROVE' | 'REJECT') {
    setError(null)
    startTransition(async () => {
      const result = await reviewActivityRequest({ request_id: id, decision, remarks })
      if (result.ok) {
        setRejecting(false)
        setRemarks('')
        router.refresh()
      } else {
        setError(result.fieldErrors?.remarks?.[0] ?? result.error ?? 'Could not update the request.')
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      {error && <span className="max-w-[240px] text-right text-[11px] text-red-600">{error}</span>}

      {rejecting ? (
        <div className="flex w-56 flex-col gap-1.5">
          <textarea
            value={remarks} onChange={e => setRemarks(e.target.value)} rows={2} autoFocus
            placeholder="Reason for rejecting (required)"
            className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-[12px] text-gray-900
                       focus:border-red-500 focus:ring-2 focus:ring-red-500/20 focus:outline-none"
          />
          <div className="flex justify-end gap-1.5">
            <button
              type="button" onClick={() => { setRejecting(false); setError(null) }} disabled={pending}
              className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-[11.5px] font-medium
                         text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              Back
            </button>
            <button
              type="button" onClick={() => review('REJECT')} disabled={pending || !remarks.trim()}
              className="inline-flex items-center gap-1 rounded-lg bg-red-700 px-2.5 py-1 text-[11.5px]
                         font-semibold text-white hover:bg-red-800 disabled:opacity-50"
            >
              {pending && <Loader2 size={12} className="animate-spin" />} Confirm reject
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-1.5">
          <button
            type="button" onClick={() => review('APPROVE')} disabled={pending}
            title={finalApproval ? 'Final approval — the activity goes ahead' : 'Approve and pass to the next level'}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-2.5 py-1 text-[11.5px]
                       font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {pending && <Loader2 size={12} className="animate-spin" />}
            {finalApproval ? 'Approve' : 'Approve & forward'}
          </button>
          <button
            type="button" onClick={() => setRejecting(true)} disabled={pending}
            className="rounded-lg border border-red-300 bg-white px-2.5 py-1 text-[11.5px] font-semibold
                       text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  )
}
