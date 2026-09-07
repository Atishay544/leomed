'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { setPricingRuleStatus } from '@/lib/erp/actions/pricing'

export default function PricingRuleStatusButton({ id, active }: { id: string; active: boolean }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function toggle() {
    const next = active ? 'INACTIVE' : 'ACTIVE'
    if (!confirm(active ? 'Deactivate this pricing rule?' : 'Reactivate this pricing rule?')) return
    setError(null)
    startTransition(async () => {
      const result = await setPricingRuleStatus(id, next)
      if (result.ok) router.refresh()
      else setError(result.error ?? 'Could not update.')
    })
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {error && <span className="text-[11px] text-red-600">{error}</span>}
      <button
        type="button" onClick={toggle} disabled={pending}
        className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-[11.5px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
      >
        {pending ? <Loader2 size={12} className="animate-spin" /> : active ? 'Deactivate' : 'Reactivate'}
      </button>
    </span>
  )
}
