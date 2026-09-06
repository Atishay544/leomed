'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { reviewExpense } from '@/lib/erp/actions/expenses'
import type { ExpenseStatus } from '@/lib/erp/types'

export default function ExpenseReviewButtons({ id, status }: { id: string; status: ExpenseStatus }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function review(newStatus: 'APPROVED' | 'REJECTED' | 'PAID') {
    setError(null)
    startTransition(async () => {
      const result = await reviewExpense({ expense_id: id, status: newStatus })
      if (result.ok) router.refresh()
      else setError(result.error ?? 'Could not update the expense.')
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {error && <span className="text-[11px] text-red-600">{error}</span>}
      <div className="flex gap-1.5">
        {status === 'SUBMITTED' && (
          <>
            <button type="button" onClick={() => review('APPROVED')} disabled={pending}
                    className="rounded-lg bg-emerald-700 px-2.5 py-1 text-[11.5px] font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
              {pending ? <Loader2 size={12} className="animate-spin" /> : 'Approve'}
            </button>
            <button type="button" onClick={() => review('REJECTED')} disabled={pending}
                    className="rounded-lg border border-red-300 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
              Reject
            </button>
          </>
        )}
        {status === 'APPROVED' && (
          <button type="button" onClick={() => review('PAID')} disabled={pending}
                  className="rounded-lg bg-violet-700 px-2.5 py-1 text-[11.5px] font-semibold text-white hover:bg-violet-800 disabled:opacity-50">
            {pending ? <Loader2 size={12} className="animate-spin" /> : 'Mark paid'}
          </button>
        )}
      </div>
    </div>
  )
}
