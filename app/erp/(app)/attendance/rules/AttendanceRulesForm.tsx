'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { saveAttendanceRules } from '@/lib/erp/actions/attendance'
import { IDLE } from '@/lib/erp/actions/shared'
import type { ErpAttendanceRules } from '@/lib/erp/types'

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-900 ' +
  'focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 focus:outline-none'

// 0=Sunday .. 6=Saturday, matching Postgres extract(dow) — the same numbering
// erp_calculate_attendance() checks default_week_off_days against.
const DAYS = [
  { value: 0, label: 'Sun' }, { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' }, { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
]

function SaveButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-[13px]
                 font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
    >
      {pending && <Loader2 size={14} className="animate-spin" />}
      {pending ? 'Saving…' : 'Save rules'}
    </button>
  )
}

export default function AttendanceRulesForm({ rules }: { rules: ErpAttendanceRules }) {
  const [state, formAction] = useActionState(saveAttendanceRules, IDLE)
  const [weekOffDays, setWeekOffDays] = useState<number[]>(rules.default_week_off_days)

  function toggleDay(day: number) {
    setWeekOffDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort())
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="default_week_off_days" value={weekOffDays.join(',')} />
      {state.error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12.5px] text-red-800">
          {state.error}
        </div>
      )}
      {state.ok && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[12.5px] text-emerald-800">
          Attendance rules saved.
        </div>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-[14px] font-semibold text-gray-900">General attendance</h2>
        <p className="mb-4 text-[12px] text-gray-500">
          Applies to non-MR employees only. An MR has no fixed workday start time or minimum
          working minutes — their day is judged entirely by the field-visit targets below.
        </p>
        <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2">
          <div>
            <label htmlFor="work_start_time" className="mb-1 block text-[12px] font-medium text-gray-700">
              Working day starts at
            </label>
            <input id="work_start_time" name="work_start_time" type="time"
                   defaultValue={rules.work_start_time.slice(0, 5)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="grace_period_minutes" className="mb-1 block text-[12px] font-medium text-gray-700">
              Grace period (minutes)
            </label>
            <input id="grace_period_minutes" name="grace_period_minutes" type="number" onFocus={e => e.target.select()} min={0} max={180}
                   defaultValue={rules.grace_period_minutes} className={inputClass} />
          </div>
          <div>
            <label htmlFor="min_full_day_minutes" className="mb-1 block text-[12px] font-medium text-gray-700">
              Minimum full-day working minutes
            </label>
            <input id="min_full_day_minutes" name="min_full_day_minutes" type="number" onFocus={e => e.target.select()} min={1} max={1440}
                   defaultValue={rules.min_full_day_minutes} className={inputClass} />
          </div>
          <div>
            <label htmlFor="min_half_day_minutes" className="mb-1 block text-[12px] font-medium text-gray-700">
              Minimum half-day working minutes
            </label>
            <input id="min_half_day_minutes" name="min_half_day_minutes" type="number" onFocus={e => e.target.select()} min={1} max={1440}
                   defaultValue={rules.min_half_day_minutes} className={inputClass} />
          </div>
          <div>
            <label htmlFor="late_threshold_minutes" className="mb-1 block text-[12px] font-medium text-gray-700">
              Late arrival threshold (minutes)
            </label>
            <input id="late_threshold_minutes" name="late_threshold_minutes" type="number" onFocus={e => e.target.select()} min={0} max={180}
                   defaultValue={rules.late_threshold_minutes} className={inputClass} />
          </div>
          <div>
            <label htmlFor="early_checkout_threshold_minutes" className="mb-1 block text-[12px] font-medium text-gray-700">
              Early checkout threshold (minutes)
            </label>
            <input id="early_checkout_threshold_minutes" name="early_checkout_threshold_minutes" type="number" onFocus={e => e.target.select()} min={0} max={180}
                   defaultValue={rules.early_checkout_threshold_minutes} className={inputClass} />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-[14px] font-semibold text-gray-900">Week off</h2>
        <p className="mb-4 text-[12px] text-gray-500">
          Company-wide default — applies to every employee, MR and non-MR alike, unless that
          person has their own individual override set directly on their staff record.
        </p>
        <div className="flex flex-wrap gap-2">
          {DAYS.map(d => (
            <button
              key={d.value} type="button" onClick={() => toggleDay(d.value)}
              className={`rounded-lg border px-3.5 py-2 text-[12.5px] font-medium transition ${
                weekOffDays.includes(d.value)
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-[14px] font-semibold text-gray-900">GPS</h2>
        <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2">
          <label className="flex items-start gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-3 sm:col-span-2">
            <input type="checkbox" name="gps_required" defaultChecked={rules.gps_required}
                   className="mt-0.5 h-4 w-4 rounded border-gray-300 text-emerald-700 focus:ring-emerald-600/30" />
            <span>
              <span className="block text-[13px] font-medium text-gray-900">Require a GPS fix at check-in/out</span>
              <span className="mt-0.5 block text-[11.5px] leading-relaxed text-gray-500">
                A missing or inaccurate location never blocks checking in or out — it only marks
                the day as an exception for review.
              </span>
            </span>
          </label>
          <div>
            <label htmlFor="min_gps_accuracy_meters" className="mb-1 block text-[12px] font-medium text-gray-700">
              Minimum acceptable accuracy (metres)
            </label>
            <input id="min_gps_accuracy_meters" name="min_gps_accuracy_meters" type="number" onFocus={e => e.target.select()} min={1} max={10000} step="1"
                   defaultValue={rules.min_gps_accuracy_meters} className={inputClass} />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-[14px] font-semibold text-gray-900">MR field activity (default)</h2>
        <p className="mb-4 text-[12px] text-gray-500">
          This is what decides an MR&apos;s attendance — not clock time. Checked in and out, and hit
          both targets for the day: PRESENT. Checked in and out but short of either target: sent
          to Pending Review for admin/HR to mark PRESENT or ABSENT with a remark, never decided
          automatically. Applies to every MR unless a per-MR override is set below. Never applied
          to non-MR employees.
        </p>
        <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2">
          <div>
            <label htmlFor="default_mr_doctor_visits" className="mb-1 block text-[12px] font-medium text-gray-700">
              Doctor visits required per day
            </label>
            <input id="default_mr_doctor_visits" name="default_mr_doctor_visits" type="number" onFocus={e => e.target.select()} min={0}
                   defaultValue={rules.default_mr_doctor_visits} className={inputClass} />
          </div>
          <div>
            <label htmlFor="default_mr_chemist_visits" className="mb-1 block text-[12px] font-medium text-gray-700">
              Chemist visits required per day
            </label>
            <input id="default_mr_chemist_visits" name="default_mr_chemist_visits" type="number" onFocus={e => e.target.select()} min={0}
                   defaultValue={rules.default_mr_chemist_visits} className={inputClass} />
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <SaveButton />
      </div>
    </form>
  )
}
