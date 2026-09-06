'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Lock, RotateCcw, IndianRupee } from 'lucide-react'
import { finalizePayroll, markPayrollPaid, reopenPayroll } from '@/lib/erp/actions/payroll'
import type { PayrollStatus } from '@/lib/erp/types'

export default function PayrollPeriodActions({ periodId, status }: { periodId: string; status: PayrollStatus }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [reopening, setReopening] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()

  function finalize() {
    if (!confirm('Finalize this payroll? It will be locked — no further incentives, deductions or attendance changes will affect it until reopened.')) return
    setError(null)
    startTransition(async () => {
      const result = await finalizePayroll(periodId)
      if (result.ok) router.refresh()
      else setError(result.error ?? 'Could not finalize.')
    })
  }

  function markPaid() {
    if (!confirm('Mark this payroll as paid?')) return
    setError(null)
    startTransition(async () => {
      const result = await markPayrollPaid(periodId)
      if (result.ok) router.refresh()
      else setError(result.error ?? 'Could not update.')
    })
  }

  function submitReopen() {
    if (!reason.trim()) { setError('A reason is required to reopen a finalized payroll.'); return }
    setError(null)
    startTransition(async () => {
      const result = await reopenPayroll({ period_id: periodId, reason })
      if (result.ok) { setReopening(false); setReason(''); router.refresh() }
      else setError(result.error ?? 'Could not reopen.')
    })
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {error && <p role="alert" className="text-[12px] text-red-700">{error}</p>}

      {reopening ? (
        <div className="w-80 rounded-xl border border-amber-300 bg-amber-50 p-3">
          <label className="mb-1 block text-[11.5px] font-medium text-amber-900">Reason for reopening</label>
          <textarea
            rows={2} value={reason} onChange={e => setReason(e.target.value)}
            className="w-full rounded-lg border border-amber-300 px-2.5 py-1.5 text-[12.5px] focus:outline-none"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setReopening(false)} className="text-[12px] text-gray-600 hover:underline">Cancel</button>
            <button
              type="button" onClick={submitReopen} disabled={pending}
              className="rounded-lg bg-amber-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
            >
              Confirm reopen
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          {(status === 'CALCULATED' || status === 'UNDER_REVIEW') && (
            <button
              type="button" onClick={finalize} disabled={pending}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-[12.5px]
                         font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
            >
              {pending ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />}
              Finalize payroll
            </button>
          )}
          {status === 'FINALIZED' && (
            <button
              type="button" onClick={markPaid} disabled={pending}
              className="flex items-center gap-1.5 rounded-lg bg-violet-700 px-3.5 py-2 text-[12.5px]
                         font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
            >
              {pending ? <Loader2 size={13} className="animate-spin" /> : <IndianRupee size={13} />}
              Mark as paid
            </button>
          )}
          {(status === 'FINALIZED' || status === 'PAID') && (
            <button
              type="button" onClick={() => setReopening(true)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2
                         text-[12.5px] font-medium text-gray-700 hover:bg-gray-50"
            >
              <RotateCcw size={13} /> Reopen payroll
            </button>
          )}
        </div>
      )}
    </div>
  )
}
