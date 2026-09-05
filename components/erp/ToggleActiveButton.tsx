'use client'

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import type { ActionState } from '@/lib/erp/actions/shared'

/**
 * Activate / deactivate a master record.
 *
 * There is no delete anywhere in master data: a doctor with three years of
 * visit history must not be able to vanish from those reports (spec §34).
 */
export default function ToggleActiveButton({
  id, active, action, noun,
}: {
  id: string
  active: boolean
  action: (id: string, active: boolean) => Promise<ActionState>
  noun: string
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const onClick = () => {
    if (active && !confirm(`Deactivate this ${noun}? It will be hidden from new entries but all history is kept.`)) {
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await action(id, !active)
      if (!result.ok) setError(result.error ?? 'That did not work.')
    })
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[12px]
                    font-medium transition disabled:opacity-50 ${
                      active
                        ? 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                        : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    }`}
      >
        {pending && <Loader2 size={12} className="animate-spin" />}
        {active ? 'Deactivate' : 'Reactivate'}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </span>
  )
}
