'use client'

import { useState, useTransition } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import type { ActionState } from '@/lib/erp/actions/shared'

/** Generic row-delete button for the small admin-only lookup tables (holidays,
 *  MR visit-target overrides, …) that have no soft-delete/active flag of their
 *  own — mirrors DeleteTargetButton, parametrized over the action to call. */
export default function DeleteRowButton({
  id, action, confirmText,
}: {
  id: string
  action: (id: string) => Promise<ActionState>
  confirmText: string
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const onClick = () => {
    if (!confirm(confirmText)) return
    setError(null)
    startTransition(async () => {
      const result = await action(id)
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
        aria-label="Remove"
        className="rounded-lg p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
      >
        {pending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
      </button>
    </span>
  )
}
