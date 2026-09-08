'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Trash2 } from 'lucide-react'
import type { ActionState } from '@/lib/erp/actions/shared'

/**
 * Admin-only invoice deletion. Unlike DeleteRowButton (for small lookup
 * tables), a successful delete here means the page it's on no longer
 * exists — so this navigates to the list instead of relying on the
 * automatic same-route refresh a server action normally gets.
 */
export default function DeleteInvoiceButton({
  invoiceId, action, listHref, noun,
}: {
  invoiceId: string
  action: (invoiceId: string) => Promise<ActionState>
  listHref: string
  noun: string
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onClick() {
    if (!confirm(
      `Delete this ${noun}? Its stock movement will be reversed and this cannot be undone.`,
    )) return
    setError(null)
    startTransition(async () => {
      const result = await action(invoiceId)
      if (result.ok) router.push(listHref)
      else setError(result.error ?? `Could not delete this ${noun}.`)
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5
                   text-[12px] font-medium text-red-700 transition hover:bg-red-50
                   disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
        {pending ? 'Deleting…' : 'Delete'}
      </button>
      {error && <p role="alert" className="max-w-[220px] text-right text-[11px] text-red-600">{error}</p>}
    </div>
  )
}
