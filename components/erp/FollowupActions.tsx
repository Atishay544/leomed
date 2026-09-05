'use client'

import { useState, useTransition } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import { updateFollowupStatus } from '@/lib/erp/actions/visits'
import type { FollowupStatus } from '@/lib/erp/types'

/** Close out a follow-up. Kept to two buttons because this is tapped on a
 *  phone between appointments, not worked through at a desk. */
export default function FollowupActions({
  followupId, status,
}: {
  followupId: string
  status: FollowupStatus
}) {
  const [current, setCurrent] = useState(status)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const update = (next: FollowupStatus) => {
    const previous = current
    setCurrent(next)
    setError(null)
    startTransition(async () => {
      const result = await updateFollowupStatus({ followup_id: followupId, status: next })
      if (!result.ok) {
        setCurrent(previous)
        setError(result.error ?? 'Could not update the follow-up.')
      }
    })
  }

  if (current !== 'PENDING') {
    return (
      <div className="flex items-center gap-2">
        <span className={`text-[12px] font-medium ${
          current === 'COMPLETED' ? 'text-emerald-700' : 'text-gray-400'
        }`}>
          {current === 'COMPLETED' ? 'Done' : 'Cancelled'}
        </span>
        <button
          type="button"
          onClick={() => update('PENDING')}
          disabled={pending}
          className="text-[11.5px] text-gray-400 underline transition hover:text-gray-700 disabled:opacity-50"
        >
          Undo
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => update('COMPLETED')}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-2.5 py-1.5
                     text-[12px] font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
        >
          {pending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          Done
        </button>
        <button
          type="button"
          onClick={() => update('CANCELLED')}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white
                     px-2.5 py-1.5 text-[12px] font-medium text-gray-600 transition
                     hover:bg-gray-50 disabled:opacity-60"
        >
          <X size={12} /> Cancel
        </button>
      </div>
      {error && <p className="mt-1 text-[11.5px] text-red-600">{error}</p>}
    </div>
  )
}
