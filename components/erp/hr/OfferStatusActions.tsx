'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { setOfferStatus } from '@/lib/erp/actions/offers'
import type { OfferStatus } from '@/lib/erp/types'

/** The manual status transitions an offer letter can move through — there's
 *  no candidate-facing acceptance flow, so admin/HR sets these by hand after
 *  hearing back from the candidate (over email, phone, whatever). */
const TRANSITIONS: Record<OfferStatus, { to: OfferStatus; label: string; tone: string }[]> = {
  DRAFT:     [{ to: 'SENT', label: 'Mark as sent', tone: 'bg-blue-600 hover:bg-blue-700' }],
  SENT:      [
    { to: 'ACCEPTED', label: 'Mark as accepted', tone: 'bg-emerald-700 hover:bg-emerald-800' },
    { to: 'REJECTED', label: 'Mark as rejected', tone: 'bg-red-600 hover:bg-red-700' },
    { to: 'WITHDRAWN', label: 'Withdraw offer', tone: 'bg-gray-600 hover:bg-gray-700' },
  ],
  ACCEPTED:  [
    { to: 'WITHDRAWN', label: 'Withdraw offer', tone: 'bg-gray-600 hover:bg-gray-700' },
  ],
  REJECTED:  [],
  WITHDRAWN: [],
  CONVERTED: [],
}

export default function OfferStatusActions({ id, status }: { id: string; status: OfferStatus }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const options = TRANSITIONS[status]
  if (options.length === 0) return null

  function apply(to: OfferStatus) {
    setError(null)
    startTransition(async () => {
      const result = await setOfferStatus({ id, status: to })
      if (result.ok) router.refresh()
      else setError(result.error ?? 'Could not update this offer.')
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map(o => (
        <button key={o.to} type="button" disabled={pending} onClick={() => apply(o.to)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white transition disabled:opacity-60 ${o.tone}`}>
          {pending && <Loader2 size={12} className="animate-spin" />}
          {o.label}
        </button>
      ))}
      {error && <span className="text-[11.5px] text-red-600">{error}</span>}
    </div>
  )
}
