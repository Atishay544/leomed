'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Loader2, Send } from 'lucide-react'
import { raiseActivityRequest } from '@/lib/erp/actions/activities'
import { lookupChemists, lookupDoctors } from '@/lib/erp/actions/lookup'
import { IDLE } from '@/lib/erp/actions/shared'
import { ACTIVITY_TYPE_LABELS } from '@/lib/erp/format'
import { CHEMIST_ACTIVITY_TYPES, DOCTOR_ACTIVITY_TYPES, type ActivityTarget } from '@/lib/erp/types'
import CustomerPicker, { type PickerOption, type PickerValue } from '../visits/CustomerPicker'

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-900 ' +
  'focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 focus:outline-none'

// Module-level so CustomerPicker's debounced-search effect (which lists
// `search` as a dependency) isn't re-triggered by every parent render.
async function searchDoctors(term: string): Promise<PickerOption[]> {
  const rows = await lookupDoctors(term)
  return rows.map(d => ({
    id: d.id, name: d.doctor_name, code: d.doctor_code,
    detail: [d.specialization, d.clinic_name].filter(Boolean).join(' · ') || null,
    area: d.area, phone: d.phone,
  }))
}

async function searchChemists(term: string): Promise<PickerOption[]> {
  const rows = await lookupChemists(term)
  return rows.map(c => ({
    id: c.id, name: c.chemist_name, code: c.chemist_code,
    detail: c.owner_name, area: c.area, phone: c.phone,
  }))
}

async function noDuplicates(): Promise<never[]> {
  return []
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit" disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-[13px]
                 font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
    >
      {pending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
      {pending ? 'Submitting…' : 'Submit for approval'}
    </button>
  )
}

export default function ActivityRequestForm({ isAdmin }: { isAdmin: boolean }) {
  const [state, formAction] = useActionState(raiseActivityRequest, IDLE)
  const [target, setTarget] = useState<ActivityTarget>('DOCTOR')
  const [picked, setPicked] = useState<PickerValue>({ mode: 'none' })
  const [type, setType] = useState('')

  const types = target === 'DOCTOR' ? DOCTOR_ACTIVITY_TYPES : CHEMIST_ACTIVITY_TYPES
  const noun = target === 'DOCTOR' ? 'doctor' : 'chemist'

  // Clear the form after a successful submit. Done while rendering (React's
  // "adjust state when a prop changes" pattern) rather than in an effect, and
  // by remounting the uncontrolled inputs through `resetKey`.
  const [seenState, setSeenState] = useState(state)
  const [resetKey, setResetKey] = useState(0)
  if (state !== seenState) {
    setSeenState(state)
    if (state.ok) {
      setPicked({ mode: 'none' })
      setType('')
      setResetKey(k => k + 1)
    }
  }

  function switchTarget(next: ActivityTarget) {
    if (next === target) return
    setTarget(next)
    setPicked({ mode: 'none' })
    setType('')
  }

  return (
    <form
      key={resetKey} action={formAction}
      className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
    >
      {state.error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12.5px] text-red-800">
          {state.error}
        </div>
      )}
      {state.ok && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[12.5px] text-emerald-800">
          {state.data?.status === 'APPROVED'
            ? 'Activity recorded and approved.'
            : 'Request submitted — it is now with your manager for approval.'}
        </div>
      )}

      <input type="hidden" name="target_type" value={target} />
      <input type="hidden" name="target_id" value={picked.mode === 'existing' ? picked.id : ''} />

      <div>
        <p className="mb-1 text-[12px] font-medium text-gray-700">Activity for</p>
        <div className="flex max-w-xs gap-1.5 rounded-lg bg-gray-100 p-1">
          {(['DOCTOR', 'CHEMIST'] as const).map(t => (
            <button
              key={t} type="button" onClick={() => switchTarget(t)}
              className={`flex-1 rounded-md px-3 py-1.5 text-[13px] font-semibold transition ${
                target === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              {t === 'DOCTOR' ? 'Doctor' : 'Chemist'}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1 text-[12px] font-medium text-gray-700">
          {target === 'DOCTOR' ? 'Which doctor?' : 'Which chemist?'}
        </p>
        <CustomerPicker
          key={target}
          noun={noun}
          nameFieldName=""
          newFields={[]}
          canCreate={false}
          value={picked}
          onChange={setPicked}
          error={state.fieldErrors?.target_id?.[0]}
          search={target === 'DOCTOR' ? searchDoctors : searchChemists}
          findDuplicates={noDuplicates}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="activity_type" className="mb-1 block text-[12px] font-medium text-gray-700">Type of activity</label>
          <select
            id="activity_type" name="activity_type" required className={inputClass}
            value={type} onChange={e => setType(e.target.value)}
          >
            <option value="">Select…</option>
            {types.map(t => (
              <option key={t} value={t}>{ACTIVITY_TYPE_LABELS[t]}</option>
            ))}
          </select>
          {state.fieldErrors?.activity_type?.[0] && (
            <p className="mt-1 text-[11.5px] text-red-600">{state.fieldErrors.activity_type[0]}</p>
          )}
        </div>
        <div>
          <label htmlFor="budget" className="mb-1 block text-[12px] font-medium text-gray-700">Budget (₹)</label>
          <input
            id="budget" name="budget" type="number" min={0} step="0.01" required
            inputMode="decimal" className={inputClass} placeholder="0"
          />
          {state.fieldErrors?.budget?.[0] && (
            <p className="mt-1 text-[11.5px] text-red-600">{state.fieldErrors.budget[0]}</p>
          )}
        </div>
        <div>
          <label htmlFor="planned_date" className="mb-1 block text-[12px] font-medium text-gray-700">Planned date</label>
          <input id="planned_date" name="planned_date" type="date" className={inputClass} />
        </div>
      </div>

      <div>
        <label htmlFor="description" className="mb-1 block text-[12px] font-medium text-gray-700">
          Details {type === 'OTHER' ? '' : '(optional)'}
        </label>
        <textarea
          id="description" name="description" rows={2} className={inputClass}
          required={type === 'OTHER'}
          placeholder={type === 'OTHER' ? 'Describe the activity' : 'Why is this needed? Any specifics for the approver…'}
        />
        {state.fieldErrors?.description?.[0] && (
          <p className="mt-1 text-[11.5px] text-red-600">{state.fieldErrors.description[0]}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11.5px] text-gray-500">
          {isAdmin
            ? 'As an administrator your request is approved immediately.'
            : 'Goes to your reporting manager first, then up the chain until an administrator approves it.'}
        </p>
        <SubmitButton />
      </div>
    </form>
  )
}
