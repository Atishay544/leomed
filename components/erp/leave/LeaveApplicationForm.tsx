'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { applyLeave } from '@/lib/erp/actions/leave'
import { IDLE } from '@/lib/erp/actions/shared'
import { isoDate } from '@/lib/erp/format'
import type { ErpLeaveType } from '@/lib/erp/types'

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-900 ' +
  'focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 focus:outline-none'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit" disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-[13px]
                 font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
    >
      {pending && <Loader2 size={14} className="animate-spin" />}
      {pending ? 'Submitting…' : 'Apply'}
    </button>
  )
}

export default function LeaveApplicationForm({ leaveTypes }: { leaveTypes: ErpLeaveType[] }) {
  const [state, formAction] = useActionState(applyLeave, IDLE)

  return (
    <form action={formAction} className="space-y-3.5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      {state.error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12.5px] text-red-800">
          {state.error}
        </div>
      )}
      {state.ok && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[12.5px] text-emerald-800">
          Leave request submitted.
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="leave_type_id" className="mb-1 block text-[12px] font-medium text-gray-700">Leave type</label>
          <select id="leave_type_id" name="leave_type_id" required className={inputClass}>
            {leaveTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="from_date" className="mb-1 block text-[12px] font-medium text-gray-700">From date</label>
          <input id="from_date" name="from_date" type="date" required min={isoDate()} className={inputClass} />
        </div>
        <div>
          <label htmlFor="to_date" className="mb-1 block text-[12px] font-medium text-gray-700">To date</label>
          <input id="to_date" name="to_date" type="date" required min={isoDate()} className={inputClass} />
        </div>
      </div>
      <div>
        <label htmlFor="reason" className="mb-1 block text-[12px] font-medium text-gray-700">Reason</label>
        <textarea id="reason" name="reason" rows={2} className={inputClass} placeholder="Optional" />
      </div>
      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  )
}
