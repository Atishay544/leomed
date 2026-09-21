'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { saveOfferLetter } from '@/lib/erp/actions/offers'
import { money, OFFER_STATUS_LABELS } from '@/lib/erp/format'
import { ERP_ROLES, OFFER_COMPONENT_CATEGORIES, type OfferComponentCategory, type ErpRole } from '@/lib/erp/types'
import { ROLE_LABELS } from '@/lib/erp/permissions'
import type { OfferDetail } from '@/lib/erp/data/offers'

/**
 * Create/edit an offer letter — header fields plus a free-form compensation
 * breakup (add/remove as many rows as this offer needs; nothing is locked to
 * a fixed template). Same "structured payload, not FormData" pattern as
 * SalesInvoiceForm, since the component list is a variable-length array a
 * plain <form> can't express.
 */

interface ManagerOption { id: string; name: string }

interface ComponentRow {
  uid: string
  component_name: string
  category: OfferComponentCategory
  monthly_amount: string
  annual_amount: string
}

let rowCounter = 0
const nextUid = () => `comp-${++rowCounter}`

const inputClass =
  'w-full rounded-lg border border-gray-300 px-2.5 py-2 text-[13px] text-gray-900 ' +
  'focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 focus:outline-none'

const CATEGORY_LABELS: Record<OfferComponentCategory, string> = {
  EARNING:   'Earning',
  DEDUCTION: 'Deduction (e.g. PF)',
}

const ROLE_OPTIONS = ERP_ROLES.map(r => ({ value: r, label: ROLE_LABELS[r] }))

function toRows(offer?: OfferDetail): ComponentRow[] {
  if (!offer || offer.components.length === 0) return [emptyRow()]
  return offer.components.map(c => ({
    uid: nextUid(),
    component_name: c.component_name,
    category: c.category,
    monthly_amount: String(c.monthly_amount),
    annual_amount: String(c.annual_amount),
  }))
}

function emptyRow(): ComponentRow {
  return { uid: nextUid(), component_name: '', category: 'EARNING', monthly_amount: '', annual_amount: '' }
}

export default function OfferLetterForm({
  initial, managers, elAccrual,
}: {
  initial?: OfferDetail
  managers: ManagerOption[]
  /** Set when Earned Leave currently has automatic accrual configured
   *  (Leave -> Leave types) — in that case the EL entitlement isn't a fixed
   *  annual number anymore, so the field below is disabled/zeroed and the
   *  letter describes the accrual rate in words instead (see
   *  offer-letter-pdf.ts). Seeding at conversion is skipped the same way,
   *  regardless of what this form ever submitted — see
   *  convertOfferToEmployee(). */
  elAccrual: { days: number; months: number } | null
}) {
  const router = useRouter()
  const isEdit = !!initial

  const [candidateName, setCandidateName]       = useState(initial?.candidate_name ?? '')
  const [candidateAddress, setCandidateAddress] = useState(initial?.candidate_address ?? '')
  const [candidateEmail, setCandidateEmail]     = useState(initial?.candidate_email ?? '')
  const [candidatePhone, setCandidatePhone]     = useState(initial?.candidate_phone ?? '')
  const [designation, setDesignation]           = useState(initial?.designation ?? '')
  const [role, setRole]                         = useState<ErpRole>(initial?.role ?? 'MR')
  const [department, setDepartment]             = useState(initial?.department ?? '')
  const [territory, setTerritory]               = useState(initial?.territory ?? '')
  const [reportsTo, setReportsTo]               = useState(initial?.reports_to ?? '')
  const [offerDate, setOfferDate]               = useState(initial?.offer_date ?? new Date().toISOString().slice(0, 10))
  const [joiningDate, setJoiningDate]           = useState(initial?.joining_date ?? '')
  const [incentiveTerms, setIncentiveTerms]     = useState(initial?.incentive_terms ?? '')
  const [annualElDays, setAnnualElDays]         = useState(String(elAccrual ? 0 : (initial?.annual_el_days ?? 0)))
  const [annualSlDays, setAnnualSlDays]         = useState(String(initial?.annual_sl_days ?? 0))
  const [annualClDays, setAnnualClDays]         = useState(String(initial?.annual_cl_days ?? 0))
  const [remarks, setRemarks]                   = useState(initial?.remarks ?? '')
  const [rows, setRows]                         = useState<ComponentRow[]>(() => toRows(initial))

  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const locked = initial?.status === 'CONVERTED'
  const willResetStatus = !!initial && initial.status !== 'DRAFT' && initial.status !== 'CONVERTED'

  function patchRow(uid: string, changes: Partial<ComponentRow>) {
    setRows(prev => prev.map(r => (r.uid === uid ? { ...r, ...changes } : r)))
  }

  function addRow() {
    setRows(prev => [...prev, emptyRow()])
  }

  function removeRow(uid: string) {
    setRows(prev => (prev.length > 1 ? prev.filter(r => r.uid !== uid) : prev))
  }

  const totals = rows.reduce(
    (acc, r) => {
      const monthly = Number(r.monthly_amount) || 0
      const annual = Number(r.annual_amount) || 0
      if (r.category === 'EARNING') { acc.guaranteedMonthly += monthly; acc.guaranteedAnnual += annual }
      acc.fixedMonthly += monthly
      acc.fixedAnnual += annual
      return acc
    },
    { guaranteedMonthly: 0, guaranteedAnnual: 0, fixedMonthly: 0, fixedAnnual: 0 },
  )

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!candidateName.trim()) return setError('Enter the candidate’s name.')
    if (!designation.trim()) return setError('Enter the designation being offered.')

    const validRows = rows.filter(r => r.component_name.trim())
    if (validRows.length === 0) return setError('Add at least one compensation component (e.g. Basic).')

    const payload = {
      id: initial?.id,
      candidate_name: candidateName.trim(),
      candidate_address: candidateAddress.trim() || undefined,
      candidate_email: candidateEmail.trim() || undefined,
      candidate_phone: candidatePhone.trim() || undefined,
      designation: designation.trim(),
      role,
      department: department.trim() || undefined,
      territory: territory.trim() || undefined,
      reports_to: reportsTo || undefined,
      offer_date: offerDate,
      joining_date: joiningDate || undefined,
      incentive_terms: incentiveTerms.trim() || undefined,
      annual_el_days: Number(annualElDays) || 0,
      annual_sl_days: Number(annualSlDays) || 0,
      annual_cl_days: Number(annualClDays) || 0,
      remarks: remarks.trim() || undefined,
      components: validRows.map(r => ({
        component_name: r.component_name.trim(),
        category: r.category,
        monthly_amount: Number(r.monthly_amount) || 0,
        annual_amount: Number(r.annual_amount) || 0,
      })),
    }

    startTransition(async () => {
      const result = await saveOfferLetter(payload)
      if (result.ok) {
        const id = (result.data?.id as string | undefined) ?? initial?.id
        router.push(id ? `/erp/hr/offers/${id}` : '/erp/hr/offers')
        router.refresh()
      } else {
        setError(result.error ?? 'Could not save the offer letter.')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12.5px] text-red-800">{error}</div>
      )}
      {locked && (
        <div className="rounded-lg border border-violet-200 bg-violet-50 px-3.5 py-2.5 text-[12.5px] text-violet-800">
          This offer has already been converted to an employee and can no longer be edited.
        </div>
      )}
      {willResetStatus && initial && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12.5px] text-amber-900">
          This offer is currently &quot;{OFFER_STATUS_LABELS[initial.status]}&quot;. Saving changes here will bump it to
          a new revision, reprint the letter accordingly, and reset its status back to Draft — whatever the candidate
          previously agreed to was for the old terms, so it&apos;ll need to be sent and accepted again.
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-[14px] font-semibold text-gray-900">Candidate</h2>
        <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-[12px] font-medium text-gray-700">Full name *</label>
            <input value={candidateName} onChange={e => setCandidateName(e.target.value)} required
                   disabled={locked} className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-gray-700">Email</label>
            <input type="email" value={candidateEmail} onChange={e => setCandidateEmail(e.target.value)}
                   disabled={locked} className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-gray-700">Phone</label>
            <input type="tel" value={candidatePhone} onChange={e => setCandidatePhone(e.target.value)}
                   disabled={locked} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-[12px] font-medium text-gray-700">Address</label>
            <textarea value={candidateAddress} onChange={e => setCandidateAddress(e.target.value)} rows={2}
                      disabled={locked} className={inputClass} />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-[14px] font-semibold text-gray-900">Role &amp; Placement</h2>
        <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[12px] font-medium text-gray-700">Designation *</label>
            <input value={designation} onChange={e => setDesignation(e.target.value)} required
                   placeholder="e.g. Territory Manager" disabled={locked} className={inputClass} />
            <p className="mt-1 text-[11px] text-gray-400">The job title printed on the letter — separate from the system role below.</p>
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-gray-700">System role on joining *</label>
            <select value={role} onChange={e => setRole(e.target.value as ErpRole)} disabled={locked} className={inputClass}>
              {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-gray-700">Reports to</label>
            <select value={reportsTo} onChange={e => setReportsTo(e.target.value)} disabled={locked} className={inputClass}>
              <option value="">— None —</option>
              {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-gray-700">Territory / HQ</label>
            <input value={territory} onChange={e => setTerritory(e.target.value)} disabled={locked} className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-gray-700">Department</label>
            <input value={department} onChange={e => setDepartment(e.target.value)} disabled={locked} className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-gray-700">Offer date</label>
            <input type="date" value={offerDate} onChange={e => setOfferDate(e.target.value)} disabled={locked} className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-gray-700">Joining date</label>
            <input type="date" value={joiningDate} onChange={e => setJoiningDate(e.target.value)} disabled={locked} className={inputClass} />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-[14px] font-semibold text-gray-900">Incentive / Variable Pay Terms (optional)</h2>
        <textarea value={incentiveTerms} onChange={e => setIncentiveTerms(e.target.value)} rows={3} disabled={locked}
                  placeholder="e.g. an MR's incentive structure, target and eligibility conditions — printed in the letter's opening paragraphs, not the fixed compensation breakup below."
                  className={inputClass} />
        <p className="mt-1 text-[11px] text-gray-400">
          Describe incentive eligibility here, not as a row below — it&apos;s conditional/variable pay, never part of the guaranteed compensation table.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-[14px] font-semibold text-gray-900">Leave Entitlement</h2>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-[12px] font-medium text-gray-700">Earned Leave / year</label>
            <input type="number" min="0" step="0.5" value={annualElDays} onChange={e => setAnnualElDays(e.target.value)}
                   disabled={locked || !!elAccrual} className={inputClass} />
            {elAccrual && (
              <p className="mt-1 text-[11px] text-amber-600">
                Ignored — Earned Leave auto-accrues {elAccrual.days} day(s) every {elAccrual.months} month(s) of service instead (Leave → Leave types). The letter will describe this policy, not a fixed number.
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-gray-700">Sick Leave / year</label>
            <input type="number" min="0" step="0.5" value={annualSlDays} onChange={e => setAnnualSlDays(e.target.value)}
                   disabled={locked} className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-gray-700">Casual Leave / year</label>
            <input type="number" min="0" step="0.5" value={annualClDays} onChange={e => setAnnualClDays(e.target.value)}
                   disabled={locked} className={inputClass} />
          </div>
        </div>
        <p className="mt-1 text-[11px] text-gray-400">
          Printed in the letter, and seeded onto the employee&apos;s leave balance for the current year the moment this offer is converted —
          editable afterward under Leave → Leave Balances like any other employee&apos;s.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-gray-900">Compensation Breakup</h2>
          {!locked && (
            <button type="button" onClick={addRow}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50">
              <Plus size={13} /> Add component
            </button>
          )}
        </div>

        <div className="space-y-2">
          <div className="hidden grid-cols-[1fr_160px_140px_140px_32px] gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 sm:grid">
            <span>Component</span><span>Type</span><span>Per month</span><span>Per annum</span><span />
          </div>
          {rows.map(row => (
            <div key={row.uid} className="grid grid-cols-1 gap-2 rounded-lg border border-gray-100 p-2 sm:grid-cols-[1fr_160px_140px_140px_32px] sm:border-0 sm:p-0">
              <input value={row.component_name} onChange={e => patchRow(row.uid, { component_name: e.target.value })}
                     placeholder="e.g. Basic" disabled={locked} className={inputClass} />
              <select value={row.category} onChange={e => patchRow(row.uid, { category: e.target.value as OfferComponentCategory })}
                      disabled={locked} className={inputClass}>
                {OFFER_COMPONENT_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </select>
              <input type="number" min="0" step="0.01" value={row.monthly_amount} onFocus={e => e.target.select()}
                     onChange={e => patchRow(row.uid, { monthly_amount: e.target.value })}
                     disabled={locked} className={inputClass} />
              <input type="number" min="0" step="0.01" value={row.annual_amount} onFocus={e => e.target.select()}
                     onChange={e => patchRow(row.uid, { annual_amount: e.target.value })}
                     disabled={locked} className={inputClass} />
              {!locked && (
                <button type="button" onClick={() => removeRow(row.uid)}
                        className="flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:border-red-300 hover:text-red-600">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-1 border-t border-gray-100 pt-3 text-[12.5px]">
          <div className="flex justify-between">
            <span className="text-gray-500">Total Guaranteed Compensation</span>
            <span className="font-medium text-gray-900">{money(totals.guaranteedMonthly)}/mo · {money(totals.guaranteedAnnual)}/yr</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Total Fixed Compensation</span>
            <span className="font-medium text-gray-900">{money(totals.fixedMonthly)}/mo · {money(totals.fixedAnnual)}/yr</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-[14px] font-semibold text-gray-900">Additional Terms (optional)</h2>
        <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={3} disabled={locked}
                  placeholder="Anything specific to this offer, printed on the letter under Additional Terms."
                  className={inputClass} />
      </div>

      {!locked && (
        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => router.back()}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-[13px] font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button type="submit" disabled={pending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60">
            {pending && <Loader2 size={14} className="animate-spin" />}
            {pending ? 'Saving…' : isEdit ? (willResetStatus ? 'Save & regenerate' : 'Save changes') : 'Create offer letter'}
          </button>
        </div>
      )}
    </form>
  )
}
