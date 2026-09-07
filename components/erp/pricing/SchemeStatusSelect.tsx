'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setSchemeStatus } from '@/lib/erp/actions/pricing'
import type { PricingStatus } from '@/lib/erp/types'

const OPTIONS: PricingStatus[] = ['DRAFT', 'ACTIVE', 'INACTIVE', 'EXPIRED', 'CANCELLED']

export default function SchemeStatusSelect({ id, status }: { id: string; status: PricingStatus }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function change(next: PricingStatus) {
    startTransition(async () => {
      const result = await setSchemeStatus({ scheme_id: id, status: next })
      if (result.ok) router.refresh()
      else alert(result.error ?? 'Could not update the scheme.')
    })
  }

  return (
    <select
      value={status} disabled={pending} onChange={e => change(e.target.value as PricingStatus)}
      className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-[11.5px] font-medium text-gray-700 focus:border-emerald-600 focus:outline-none disabled:opacity-50"
    >
      {OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}
