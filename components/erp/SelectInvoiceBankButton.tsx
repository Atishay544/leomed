'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import type { ActionState } from '@/lib/erp/actions/shared'

/** Picks which bank account is printed on sales invoices — a single
 *  admin-wide choice among however many are on file, not a per-invoice one. */
export default function SelectInvoiceBankButton({
  id, selected, action,
}: {
  id: string
  selected: boolean
  action: (id: string) => Promise<ActionState>
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (selected) {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-700">
        <CheckCircle2 size={14} /> Used on invoices
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null)
          startTransition(async () => {
            const result = await action(id)
            if (!result.ok) setError(result.error ?? 'That did not work.')
          })
        }}
        className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-[12px]
                   font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
      >
        {pending && <Loader2 size={12} className="animate-spin" />}
        Use on invoices
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </span>
  )
}
