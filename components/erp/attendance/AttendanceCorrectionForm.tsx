'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Pencil, RotateCcw } from 'lucide-react'
import { correctAttendance, recalculateAttendance } from '@/lib/erp/actions/attendance'
import { ATTENDANCE_STATUS_LABELS } from '@/lib/erp/format'
import { ATTENDANCE_STATUSES } from '@/lib/erp/types'
import type { ErpAttendance } from '@/lib/erp/types'

/** Converts a timestamptz into the value <input type="datetime-local"> wants,
 *  in the browser's own local time — an admin sets what the clock showed
 *  where they are, not a UTC instant. */
function toLocalInput(value: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function AttendanceCorrectionForm({ attendance }: { attendance: ErpAttendance }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState(attendance.attendance_status)
  const [checkIn, setCheckIn] = useState(toLocalInput(attendance.check_in_time))
  const [checkOut, setCheckOut] = useState(toLocalInput(attendance.check_out_time))
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    setError(null)
    if (!reason.trim()) {
      setError('A reason is required to correct attendance.')
      return
    }
    startTransition(async () => {
      const result = await correctAttendance({
        attendance_id: attendance.id,
        status,
        check_in_time: checkIn ? new Date(checkIn).toISOString() : undefined,
        check_out_time: checkOut ? new Date(checkOut).toISOString() : undefined,
        reason,
      })
      if (result.ok) {
        setOpen(false)
        setReason('')
        router.refresh()
      } else {
        setError(result.error ?? 'Could not save the correction.')
      }
    })
  }

  function recalculate() {
    setError(null)
    startTransition(async () => {
      const result = await recalculateAttendance(attendance.id)
      if (result.ok) router.refresh()
      else setError(result.error ?? 'Could not recalculate.')
    })
  }

  if (!open) {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button" onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2
                     text-[12.5px] font-medium text-gray-700 hover:bg-gray-50"
        >
          <Pencil size={13} /> Correct attendance
        </button>
        {attendance.is_manual_override && (
          <button
            type="button" onClick={recalculate} disabled={pending}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2
                       text-[12.5px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            {pending ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
            Recalculate automatically
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      {error && (
        <p role="alert" className="mb-3 text-[12.5px] text-red-700">{error}</p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-600">Status</label>
          <select
            value={status} onChange={e => setStatus(e.target.value as typeof status)}
            className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-[13px] focus:border-emerald-600 focus:outline-none"
          >
            {ATTENDANCE_STATUSES.map(s => <option key={s} value={s}>{ATTENDANCE_STATUS_LABELS[s]}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-600">Check-in</label>
          <input
            type="datetime-local" value={checkIn} onChange={e => setCheckIn(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-[13px] focus:border-emerald-600 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-600">Check-out</label>
          <input
            type="datetime-local" value={checkOut} onChange={e => setCheckOut(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-[13px] focus:border-emerald-600 focus:outline-none"
          />
        </div>
      </div>
      <div className="mt-3">
        <label className="mb-1 block text-[11px] font-medium text-gray-600">Reason (required)</label>
        <textarea
          rows={2} value={reason} onChange={e => setReason(e.target.value)}
          placeholder="e.g. Forgot to check in. Confirmed field work with the MR's manager."
          className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-[13px] focus:border-emerald-600 focus:outline-none"
        />
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button" onClick={submit} disabled={pending}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-[12.5px]
                     font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {pending && <Loader2 size={13} className="animate-spin" />}
          Save correction
        </button>
        <button
          type="button" onClick={() => setOpen(false)} disabled={pending}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-[12.5px] font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
