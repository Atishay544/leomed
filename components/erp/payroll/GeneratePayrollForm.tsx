'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { generatePayroll } from '@/lib/erp/actions/payroll'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default function GeneratePayrollForm() {
  const router = useRouter()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    setError(null)
    startTransition(async () => {
      const result = await generatePayroll({ period_year: year, period_month: month })
      if (result.ok) {
        const periodId = result.data?.period_id as string | undefined
        if (periodId) router.push(`/erp/payroll/${periodId}`)
        else router.refresh()
      } else {
        setError(result.error ?? 'Could not generate payroll.')
      }
    })
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      {error && (
        <p role="alert" className="mb-3 text-[12.5px] text-red-700">{error}</p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="gp_month" className="mb-1 block text-[12px] font-medium text-gray-700">Month</label>
          <select
            id="gp_month" value={month} onChange={e => setMonth(Number(e.target.value))}
            className="rounded-lg border border-gray-300 px-3 py-2 text-[13px] focus:border-emerald-600 focus:outline-none"
          >
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="gp_year" className="mb-1 block text-[12px] font-medium text-gray-700">Year</label>
          <input
            id="gp_year" type="number" value={year} onChange={e => setYear(Number(e.target.value))}
            className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-[13px] focus:border-emerald-600 focus:outline-none"
          />
        </div>
        <button
          type="button" onClick={submit} disabled={pending}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-[13px] font-semibold
                     text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending && <Loader2 size={14} className="animate-spin" />}
          {pending ? 'Calculating…' : 'Generate payroll'}
        </button>
      </div>
      <p className="mt-2 text-[11.5px] text-gray-500">
        Calculates preliminary payroll for every employee from attendance and salary. Safe to run
        again on the same month before it is finalized — it refreshes the numbers without erasing
        incentives or deductions already added.
      </p>
    </div>
  )
}
