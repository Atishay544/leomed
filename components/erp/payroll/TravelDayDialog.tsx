'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, X } from 'lucide-react'
import { lookupEmployees, type EmployeeOption } from '@/lib/erp/actions/lookup'
import { saveTravelDay } from '@/lib/erp/actions/travel-allowance'
import { IDLE, type ActionState } from '@/lib/erp/actions/shared'
import { isoDate } from '@/lib/erp/format'

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-900 ' +
  'focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 focus:outline-none'

/**
 * Admin/HR sends an employee somewhere for a few days — a direct decision,
 * not an inference, so this is live for payroll the moment it's saved (no
 * review step, unlike the auto-detected per-area MR rows on this same
 * screen). A search box, not a plain <select> — same reasoning as
 * SalaryDialog: the company can have 1000+ employees.
 */
export default function TravelDayDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<EmployeeOption[]>([])
  const [employee, setEmployee] = useState<EmployeeOption | null>(null)
  const [state, setState] = useState<ActionState>(IDLE)
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
    setTerm(''); setResults([]); setEmployee(null); setState(IDLE)
  }

  function submit(formData: FormData) {
    setState(IDLE)
    if (!employee) { setState({ ok: false, error: 'Choose an employee.' }); return }
    formData.set('employee_id', employee.id)
    startTransition(async () => {
      const result = await saveTravelDay(IDLE, formData)
      setState(result)
      if (result.ok) { setOpen(false); reset(); router.refresh() }
    })
  }

  return (
    <>
      <button
        type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-emerald-800"
      >
        <Plus size={15} /> Send someone on a trip
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} aria-hidden="true" />
          <div role="dialog" aria-modal="true" className="relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
              <h2 className="text-[14px] font-semibold text-gray-900">Assign travel days</h2>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close"><X size={17} /></button>
            </div>

            <form action={submit} className="space-y-3.5 px-5 py-4">
              <p className="rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-gray-500">
                A daily travel allowance for a specific trip — not flights, hotels or other costs, which go under
                Expenses → Record company expense instead. Only days in this range they&apos;re actually present earn it.
              </p>

              {state.error && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12.5px] text-red-800">{state.error}</div>
              )}

              <div>
                <label className="mb-1 block text-[12px] font-medium text-gray-700">Employee</label>
                {employee ? (
                  <div className="flex items-center justify-between rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2">
                    <span className="text-[13px] font-medium text-emerald-900">
                      {employee.name} {employee.employee_code && `· ${employee.employee_code}`}
                    </span>
                    <button type="button" onClick={() => setEmployee(null)} className="text-emerald-700 hover:text-emerald-900">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      value={term} onChange={e => setTerm(e.target.value)}
                      placeholder="Search by name, employee code or MR code…"
                      className={inputClass}
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="from_date" className="mb-1 block text-[12px] font-medium text-gray-700">From</label>
                  <input id="from_date" name="from_date" type="date" required defaultValue={isoDate()} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="to_date" className="mb-1 block text-[12px] font-medium text-gray-700">To</label>
                  <input id="to_date" name="to_date" type="date" required defaultValue={isoDate()} className={inputClass} />
                </div>
              </div>

              <div>
                <label htmlFor="daily_amount" className="mb-1 block text-[12px] font-medium text-gray-700">Travel allowance (₹/day)</label>
                <input id="daily_amount" name="daily_amount" type="number" onFocus={e => e.target.select()} min="0.01" step="0.01" required className={inputClass} />
              </div>

              <div>
                <label htmlFor="purpose" className="mb-1 block text-[12px] font-medium text-gray-700">Purpose (optional)</label>
                <input id="purpose" name="purpose" placeholder="e.g. Delhi distributor meeting" className={inputClass} />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-[12.5px] font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={pending} className="flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
                  {pending && <Loader2 size={13} className="animate-spin" />} Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
