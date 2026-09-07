'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, X } from 'lucide-react'
import { lookupEmployees, type EmployeeOption } from '@/lib/erp/actions/lookup'
import { adminCreateLeave } from '@/lib/erp/actions/leave'
import { isoDate } from '@/lib/erp/format'
import type { ErpLeaveType } from '@/lib/erp/types'

/** Admin-only: create or back-date a leave request on an employee's behalf
 *  (spec §22). A search box, not a plain <select> — the company can have
 *  1000+ employees, so the full list is never shipped to the browser. */
export default function AdminCreateLeaveDialog({ leaveTypes }: { leaveTypes: ErpLeaveType[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<EmployeeOption[]>([])
  const [employee, setEmployee] = useState<EmployeeOption | null>(null)
  const [status, setStatus] = useState<'APPROVED' | 'PENDING'>('APPROVED')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) return
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      setResults(await lookupEmployees(term))
    }, 250)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [term, open])

  function reset() {
    setTerm(''); setResults([]); setEmployee(null); setStatus('APPROVED'); setError(null)
  }

  function submit(formData: FormData) {
    setError(null)
    if (!employee) { setError('Choose an employee.'); return }
    startTransition(async () => {
      const result = await adminCreateLeave({
        employee_id: employee.id,
        leave_type_id: String(formData.get('leave_type_id')),
        from_date: String(formData.get('from_date')),
        to_date: String(formData.get('to_date')),
        reason: String(formData.get('reason') ?? ''),
        status,
      })
      if (result.ok) { setOpen(false); reset(); router.refresh() }
      else setError(result.error ?? 'Could not create the leave request.')
    })
  }

  return (
    <>
      <button
        type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2
                   text-[13px] font-semibold text-white shadow-sm transition hover:bg-emerald-800"
      >
        <Plus size={15} /> Create leave
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} aria-hidden="true" />
          <div role="dialog" aria-modal="true" className="relative w-full max-w-lg rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
              <h2 className="text-[14px] font-semibold text-gray-900">Create leave on an employee&apos;s behalf</h2>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close">
                <X size={17} />
              </button>
            </div>

            <form action={submit} className="space-y-3.5 px-5 py-4">
              {error && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12.5px] text-red-800">{error}</div>
              )}

              <div>
                <label className="mb-1 block text-[12px] font-medium text-gray-700">Employee</label>
                {employee ? (
                  <div className="flex items-center justify-between rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2">
                    <span className="text-[13px] font-medium text-emerald-900">
                      {employee.name} {employee.mr_code && `· ${employee.mr_code}`}
                    </span>
                    <button type="button" onClick={() => setEmployee(null)} className="text-emerald-700 hover:text-emerald-900">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      value={term} onChange={e => setTerm(e.target.value)}
                      placeholder="Search by name, MR code or employee code…"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] focus:border-emerald-600 focus:outline-none"
                    />
                    {results.length > 0 && (
                      <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-gray-200">
                        {results.map(e => (
                          <li key={e.id}>
                            <button
                              type="button" onClick={() => setEmployee(e)}
                              className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] hover:bg-gray-50"
                            >
                              <span>{e.name}</span>
                              <span className="text-gray-400">{e.mr_code ?? e.employee_code ?? e.role}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor="al_type" className="mb-1 block text-[12px] font-medium text-gray-700">Leave type</label>
                  <select id="al_type" name="leave_type_id" required
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] focus:border-emerald-600 focus:outline-none">
                    {leaveTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="al_from" className="mb-1 block text-[12px] font-medium text-gray-700">From</label>
                  <input id="al_from" name="from_date" type="date" required defaultValue={isoDate()}
                         className="w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] focus:border-emerald-600 focus:outline-none" />
                </div>
                <div>
                  <label htmlFor="al_to" className="mb-1 block text-[12px] font-medium text-gray-700">To</label>
                  <input id="al_to" name="to_date" type="date" required defaultValue={isoDate()}
                         className="w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] focus:border-emerald-600 focus:outline-none" />
                </div>
              </div>

              <div>
                <label htmlFor="al_reason" className="mb-1 block text-[12px] font-medium text-gray-700">Reason</label>
                <textarea id="al_reason" name="reason" rows={2}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] focus:border-emerald-600 focus:outline-none" />
              </div>

              <label className="flex items-center gap-2 text-[12.5px] text-gray-700">
                <input type="checkbox" checked={status === 'APPROVED'}
                       onChange={e => setStatus(e.target.checked ? 'APPROVED' : 'PENDING')}
                       className="h-4 w-4 rounded border-gray-300 text-emerald-700 focus:ring-emerald-600/30" />
                Approve immediately (updates the affected days to Leave right away)
              </label>

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setOpen(false)}
                        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-[12.5px] font-medium text-gray-700 hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={pending}
                        className="flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
                  {pending && <Loader2 size={13} className="animate-spin" />}
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
