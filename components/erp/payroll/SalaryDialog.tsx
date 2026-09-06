'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, X } from 'lucide-react'
import { lookupEmployees, type EmployeeOption } from '@/lib/erp/actions/lookup'
import { saveEmployeeSalary } from '@/lib/erp/actions/payroll'
import { IDLE, type ActionState } from '@/lib/erp/actions/shared'
import { isoDate } from '@/lib/erp/format'
import type { ErpEmployeeSalary } from '@/lib/erp/types'

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-900 ' +
  'focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 focus:outline-none'

/** Admin sets or edits one employee's salary structure. A search box, not a
 *  plain <select> — the company can have 1000+ employees. Editing an
 *  existing row passes `existing`, pre-selecting that employee and skipping
 *  the search step entirely. */
export default function SalaryDialog({
  existing, trigger,
}: {
  existing?: ErpEmployeeSalary & { employeeName?: string }
  trigger?: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<EmployeeOption[]>([])
  const [employee, setEmployee] = useState<EmployeeOption | null>(
    existing ? { id: existing.employee_id, name: existing.employeeName ?? 'Employee', role: '', mr_code: null, employee_code: null, department: null } : null,
  )
  const [state, setState] = useState<ActionState>(IDLE)
  const [pending, startTransition] = useTransition()
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open || existing) return
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      setResults(await lookupEmployees(term))
    }, 250)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [term, open, existing])

  function submit(formData: FormData) {
    setState(IDLE)
    if (!employee) { setState({ ok: false, error: 'Choose an employee.' }); return }
    formData.set('employee_id', employee.id)
    startTransition(async () => {
      const result = await saveEmployeeSalary(IDLE, formData)
      setState(result)
      if (result.ok) { setOpen(false); router.refresh() }
    })
  }

  return (
    <>
      <span onClick={() => setOpen(true)}>
        {trigger ?? (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2
                       text-[13px] font-semibold text-white shadow-sm transition hover:bg-emerald-800"
          >
            <Plus size={15} /> Set salary
          </button>
        )}
      </span>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} aria-hidden="true" />
          <div role="dialog" aria-modal="true" className="relative w-full max-w-lg rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
              <h2 className="text-[14px] font-semibold text-gray-900">
                {existing ? `Edit salary — ${existing.employeeName}` : 'Set an employee salary'}
              </h2>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close">
                <X size={17} />
              </button>
            </div>

            <form action={submit} className="space-y-3.5 px-5 py-4">
              {state.error && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12.5px] text-red-800">{state.error}</div>
              )}

              {!existing && (
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
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="fixed_salary" className="mb-1 block text-[12px] font-medium text-gray-700">Fixed salary (₹/month)</label>
                  <input id="fixed_salary" name="fixed_salary" type="number" min="0" step="0.01" required
                         defaultValue={existing?.fixed_salary} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="basic_salary" className="mb-1 block text-[12px] font-medium text-gray-700">Basic salary</label>
                  <input id="basic_salary" name="basic_salary" type="number" min="0" step="0.01" required
                         defaultValue={existing?.basic_salary ?? 0} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="gross_salary" className="mb-1 block text-[12px] font-medium text-gray-700">Gross salary</label>
                  <input id="gross_salary" name="gross_salary" type="number" min="0" step="0.01" required
                         defaultValue={existing?.gross_salary ?? 0} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="allowances" className="mb-1 block text-[12px] font-medium text-gray-700">Allowances</label>
                  <input id="allowances" name="allowances" type="number" min="0" step="0.01" required
                         defaultValue={existing?.allowances ?? 0} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="standard_deductions" className="mb-1 block text-[12px] font-medium text-gray-700">
                    Standard deductions
                  </label>
                  <input id="standard_deductions" name="standard_deductions" type="number" min="0" step="0.01" required
                         defaultValue={existing?.standard_deductions ?? 0} className={inputClass} />
                  <p className="mt-1 text-[11px] text-gray-400">e.g. PF, insurance — applied every month automatically.</p>
                </div>
                <div>
                  <label htmlFor="effective_from" className="mb-1 block text-[12px] font-medium text-gray-700">Effective from</label>
                  <input id="effective_from" name="effective_from" type="date" required
                         defaultValue={existing?.effective_from ?? isoDate()} className={inputClass} />
                </div>
              </div>

              <p className="text-[11px] leading-relaxed text-gray-400">
                Changing this does not alter any payroll already generated or finalized — those keep
                the salary that was in effect when they were calculated.
              </p>

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setOpen(false)}
                        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-[12.5px] font-medium text-gray-700 hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={pending}
                        className="flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
                  {pending && <Loader2 size={13} className="animate-spin" />}
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
