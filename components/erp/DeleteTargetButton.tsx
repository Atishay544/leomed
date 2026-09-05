'use client'

import { useState, useTransition } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { deleteTarget } from '@/lib/erp/actions/admin'

/** Targets are the one thing in the ERP that really is deleted: they hold no
 *  history of their own, and a wrong target is noise rather than a record. */
export default function DeleteTargetButton({ id }: { id: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const onClick = () => {
    if (!confirm('Remove this target? Recorded visits and orders are not affected.')) return
    setError(null)
    startTransition(async () => {
      const result = await deleteTarget(id)
      if (!result.ok) setError(result.error ?? 'That did not work.')
    })
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {error && <span className="text-[11px] text-red-600">{error}</span>}
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-label="Remove target"
        className="rounded-lg p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
      >
        {pending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
      </button>
    </span>
  )
}
