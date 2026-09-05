'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  CalendarClock, Check, ClipboardList, Loader2, Package, Stethoscope, Trash2,
} from 'lucide-react'
import CustomerPicker, { type PickerValue } from './CustomerPicker'
import ProductPicker from './ProductPicker'
import { lookupDoctors, findSimilarDoctors, type ProductOption } from '@/lib/erp/actions/lookup'
import { createDoctorVisit } from '@/lib/erp/actions/visits'
import type { DiscussionType, VisitPurpose } from '@/lib/erp/types'
import { DISCUSSION_TYPE_LABELS, isoDate, money, VISIT_PURPOSE_LABELS } from '@/lib/erp/format'
import { DISCUSSION_TYPES, VISIT_PURPOSES } from '@/lib/erp/types'
import type { FieldSpec } from '../form/Field'

/**
 * Record a doctor visit — the screen an MR uses standing in a clinic doorway.
 *
 * The whole visit is submitted as ONE server action that maps to ONE database
 * transaction (spec §23): the doctor (if new), the visit, every product
 * discussed, an optional field order with its lines, and an optional
 * follow-up. Partial saves are not possible.
 *
 * Nothing here reports success until the server confirms it (spec §43).
 */

const NEW_DOCTOR_FIELDS: FieldSpec[] = [
  { name: 'doctor_name',    label: 'Doctor name', required: true, span: 2, placeholder: 'Dr. Rajesh Kumar' },
  { name: 'specialization', label: 'Specialisation', placeholder: 'Paediatrics' },
  { name: 'phone',          label: 'Phone', type: 'tel' },
  { name: 'clinic_name',    label: 'Clinic / hospital', span: 2 },
  { name: 'area',           label: 'Area' },
  { name: 'city',           label: 'City' },
]

interface DiscussedRow {
  product: ProductOption
  discussion_type: DiscussionType
  sample_quantity: number
}

interface OrderRow {
  product: ProductOption
  quantity: number
  unit_rate: number
  discount_percent: number
}

function Section({
  icon: Icon, title, subtitle, children, action,
}: {
  icon: typeof Stethoscope
  title: string
  subtitle?: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3.5 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <Icon size={15} />
          </span>
          <div>
            <h2 className="text-[14px] font-semibold text-gray-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[12px] text-gray-500">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base text-gray-900 ' +
  'focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 focus:outline-none sm:text-[13px]'

export default function DoctorVisitForm() {
  const [doctor, setDoctor] = useState<PickerValue>({ mode: 'none' })
  const [visitDate, setVisitDate] = useState(isoDate())
  const [visitTime, setVisitTime] = useState('')
  const [purpose, setPurpose] = useState<VisitPurpose>('PRODUCT_DETAILING')
  const [discussion, setDiscussion] = useState('')
  const [remarks, setRemarks] = useState('')
  const [discussed, setDiscussed] = useState<DiscussedRow[]>([])

  const [orderReceived, setOrderReceived] = useState(false)
  const [orderBookNumber, setOrderBookNumber] = useState('')
  const [orderItems, setOrderItems] = useState<OrderRow[]>([])

  const [followUp, setFollowUp] = useState(false)
  const [followUpDate, setFollowUpDate] = useState('')
  const [followUpNote, setFollowUpNote] = useState('')

  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [saved, setSaved] = useState<Record<string, unknown> | null>(null)
  const [pending, startSubmit] = useTransition()

  // One id per logical submission, reused across retries. If a save times out
  // and the MR taps again, the server recognises the repeat and returns the
  // original visit rather than recording a second one (spec §43).
  const requestId = useRef<string | null>(null)

  /** Estimated value of one order line: quantity × rate, less any discount.
   *  Mirrors the generated column on erp_field_order_items (Q2). */
  const lineValue = (row: OrderRow) =>
    Math.round(row.quantity * row.unit_rate * (1 - row.discount_percent / 100) * 100) / 100

  const orderTotal = orderItems.reduce((sum, row) => sum + lineValue(row), 0)

  /** Clears the form for the next visit without a page reload — an MR working
   *  through a clinic list records several in a row, often on a weak signal.
   *  The request id is cleared too, so the next visit is a new submission. */
  function startAnother() {
    setDoctor({ mode: 'none' })
    setVisitDate(isoDate())
    setVisitTime('')
    setPurpose('PRODUCT_DETAILING')
    setDiscussion('')
    setRemarks('')
    setDiscussed([])
    setOrderReceived(false)
    setOrderBookNumber('')
    setOrderItems([])
    setFollowUp(false)
    setFollowUpDate('')
    setFollowUpNote('')
    setError(null)
    setFieldErrors({})
    setSaved(null)
    requestId.current = null
  }

  const addDiscussed = (product: ProductOption) =>
    setDiscussed(rows => [...rows, { product, discussion_type: 'DETAILED', sample_quantity: 0 }])

  const addOrderItem = (product: ProductOption) =>
    setOrderItems(rows => [...rows, {
      product,
      quantity: 1,
      unit_rate: Number(product.sale_rate) || 0,
      discount_percent: 0,
    }])

  function handleSubmit() {
    setError(null)
    setFieldErrors({})

    if (doctor.mode === 'none') {
      setError('Choose the doctor you visited, or add them as a new doctor.')
      return
    }
    if (orderReceived && orderItems.length === 0) {
      setError('Add at least one product to the order, or turn the order off.')
      return
    }
    if (followUp && !followUpDate) {
      setError('Pick a date for the follow-up.')
      return
    }

    requestId.current ??= (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)

    const payload = {
      ...(doctor.mode === 'existing'
        ? { doctor_id: doctor.id }
        : { new_doctor: doctor.values }),
      visit_date: visitDate,
      visit_time: visitTime || undefined,
      purpose,
      discussion: discussion || undefined,
      remarks: remarks || undefined,
      client_request_id: requestId.current,
      products: discussed.map(row => ({
        product_id:      row.product.id,
        discussion_type: row.discussion_type,
        sample_quantity: row.sample_quantity,
      })),
      order: orderReceived
        ? {
            received: true,
            order_book_number: orderBookNumber || undefined,
            items: orderItems.map(row => ({
              product_id:       row.product.id,
              quantity:         row.quantity,
              unit:             row.product.unit,
              unit_rate:        row.unit_rate,
              discount_percent: row.discount_percent,
            })),
          }
        : undefined,
      follow_up_required: followUp,
      follow_up_date: followUp ? followUpDate : undefined,
      follow_up_description: followUp ? followUpNote || undefined : undefined,
      follow_up_priority: 'MEDIUM' as const,
    }

    startSubmit(async () => {
      const result = await createDoctorVisit(payload)
      if (result.ok) {
        setSaved(result.data ?? {})
      } else {
        setError(result.error ?? 'Could not save the visit.')
        setFieldErrors(result.fieldErrors ?? {})
        // Keep requestId so a retry is still recognised as the same submission.
      }
    })
  }

  if (saved) {
    const isDuplicate = saved.duplicate === true
    return (
      <div className="mx-auto max-w-md py-8 text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
          <Check size={26} strokeWidth={2.6} />
        </span>
        <h1 className="text-lg font-bold text-gray-900">
          {isDuplicate ? 'Already saved' : 'Visit recorded'}
        </h1>
        <p className="mt-1.5 text-[13px] text-gray-600">
          {isDuplicate
            ? 'This visit had already been saved — nothing was duplicated.'
            : saved.doctor_status === 'NEW'
              ? 'The doctor was added to the master and counted as a new doctor for today.'
              : 'Your visit has been added to today’s activity.'}
        </p>
        {typeof saved.order_number === 'string' && (
          <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-[12.5px] text-blue-800">
            Field order <strong>{saved.order_number}</strong> recorded.
            This tracks demand — it is not a company invoice.
          </p>
        )}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={startAnother}
            className="rounded-lg bg-emerald-700 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-emerald-800"
          >
            Record another visit
          </button>
          <Link
            href="/erp/mr"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-[13px] font-semibold text-gray-700 hover:bg-gray-50"
          >
            Back to my day
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-28">
      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">
          {error}
        </div>
      )}

      <Section
        icon={Stethoscope}
        title="Which doctor?"
        subtitle="Search the master, or add someone you're meeting for the first time."
      >
        <CustomerPicker
          noun="doctor"
          nameFieldName="doctor_name"
          newFields={NEW_DOCTOR_FIELDS}
          value={doctor}
          onChange={setDoctor}
          error={fieldErrors.doctor_id?.[0]}
          search={async term => {
            const rows = await lookupDoctors(term)
            return rows.map(d => ({
              id: d.id, name: d.doctor_name, code: d.doctor_code,
              detail: [d.specialization, d.clinic_name].filter(Boolean).join(' · ') || null,
              area: d.area, phone: d.phone,
            }))
          }}
          findDuplicates={async (name, phone, area) => {
            const rows = await findSimilarDoctors(name, phone, area)
            return rows.map(d => ({
              id: d.id, name: d.doctor_name, code: d.doctor_code,
              detail: [d.specialization, d.clinic_name].filter(Boolean).join(' · ') || null,
              area: d.area, phone: d.phone, score: d.match_score,
            }))
          }}
        />
      </Section>

      <Section icon={CalendarClock} title="Visit details">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-3">
          <div>
            <label htmlFor="visit_date" className="mb-1 block text-[12px] font-medium text-gray-700">Date</label>
            <input id="visit_date" type="date" value={visitDate} max={isoDate()}
                   onChange={e => setVisitDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="visit_time" className="mb-1 block text-[12px] font-medium text-gray-700">Time</label>
            <input id="visit_time" type="time" value={visitTime}
                   onChange={e => setVisitTime(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="purpose" className="mb-1 block text-[12px] font-medium text-gray-700">Purpose</label>
            <select id="purpose" value={purpose}
                    onChange={e => setPurpose(e.target.value as VisitPurpose)} className={inputClass}>
              {VISIT_PURPOSES.map(p => <option key={p} value={p}>{VISIT_PURPOSE_LABELS[p]}</option>)}
            </select>
          </div>
          <div className="sm:col-span-3">
            <label htmlFor="discussion" className="mb-1 block text-[12px] font-medium text-gray-700">
              What was discussed
            </label>
            <textarea id="discussion" rows={3} value={discussion}
                      onChange={e => setDiscussion(e.target.value)} className={inputClass}
                      placeholder="Key points from the conversation…" />
          </div>
        </div>
      </Section>

      <Section
        icon={Package}
        title="Products detailed"
        subtitle="Add every product you discussed — one visit can cover several."
      >
        <ProductPicker onPick={addDiscussed} excludeIds={discussed.map(r => r.product.id)} />

        {discussed.length > 0 && (
          <ul className="mt-3 space-y-2">
            {discussed.map((row, index) => (
              <li key={row.product.id} className="rounded-lg border border-gray-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[13px] font-medium text-gray-900">
                    {row.product.product_name}
                    {row.product.strength && <span className="ml-1 text-gray-500">{row.product.strength}</span>}
                  </p>
                  <button
                    type="button"
                    onClick={() => setDiscussed(rows => rows.filter((_, i) => i !== index))}
                    className="shrink-0 rounded-lg p-1 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                    aria-label={`Remove ${row.product.product_name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  <select
                    value={row.discussion_type}
                    onChange={e => setDiscussed(rows => rows.map((r, i) =>
                      i === index ? { ...r, discussion_type: e.target.value as DiscussionType } : r))}
                    aria-label="How it was discussed"
                    className="rounded-lg border border-gray-300 px-2.5 py-2 text-[13px] text-gray-900
                               focus:border-emerald-600 focus:outline-none"
                  >
                    {DISCUSSION_TYPES.map(t => (
                      <option key={t} value={t}>{DISCUSSION_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                  <input
                    type="number" min={0} inputMode="numeric"
                    value={row.sample_quantity}
                    onChange={e => setDiscussed(rows => rows.map((r, i) =>
                      i === index ? { ...r, sample_quantity: Math.max(0, parseInt(e.target.value, 10) || 0) } : r))}
                    aria-label="Samples given"
                    placeholder="Samples"
                    className="rounded-lg border border-gray-300 px-2.5 py-2 text-[13px] text-gray-900
                               focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        icon={ClipboardList}
        title="Order received?"
        subtitle="Recorded as a field order to measure demand — it does not raise a company invoice."
        action={
          <button
            type="button"
            role="switch"
            aria-checked={orderReceived}
            onClick={() => setOrderReceived(v => !v)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition ${
              orderReceived ? 'bg-emerald-600' : 'bg-gray-300'
            }`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
              orderReceived ? 'left-[22px]' : 'left-0.5'
            }`} />
          </button>
        }
      >
        {orderReceived ? (
          <div className="space-y-3">
            <div>
              <label htmlFor="order_book" className="mb-1 block text-[12px] font-medium text-gray-700">
                Order book number
              </label>
              <input
                id="order_book" value={orderBookNumber}
                onChange={e => setOrderBookNumber(e.target.value)}
                placeholder="From your physical order book, e.g. OB-2026-00452"
                className={inputClass}
              />
            </div>

            <ProductPicker
              onPick={addOrderItem}
              excludeIds={orderItems.map(r => r.product.id)}
              placeholder="Search products to add to the order…"
            />

            {orderItems.length > 0 && (
              <>
                <ul className="space-y-2">
                  {orderItems.map((row, index) => (
                    <li key={row.product.id} className="rounded-lg border border-gray-200 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-[13px] font-medium text-gray-900">
                          {row.product.product_name}
                          {row.product.strength && <span className="ml-1 text-gray-500">{row.product.strength}</span>}
                        </p>
                        <button
                          type="button"
                          onClick={() => setOrderItems(rows => rows.filter((_, i) => i !== index))}
                          className="shrink-0 rounded-lg p-1 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                          aria-label={`Remove ${row.product.product_name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="mt-2.5 grid grid-cols-3 gap-2">
                        <div>
                          <label className="mb-1 block text-[11px] text-gray-500">
                            Qty ({row.product.unit})
                          </label>
                          <input
                            type="number" min={1} inputMode="numeric" value={row.quantity}
                            onChange={e => setOrderItems(rows => rows.map((r, i) =>
                              i === index ? { ...r, quantity: Math.max(1, parseInt(e.target.value, 10) || 1) } : r))}
                            className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-base
                                       focus:border-emerald-600 focus:outline-none sm:text-[13px]"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] text-gray-500">Rate (₹)</label>
                          <input
                            type="number" min={0} step="0.01" inputMode="decimal" value={row.unit_rate}
                            onChange={e => setOrderItems(rows => rows.map((r, i) =>
                              i === index ? { ...r, unit_rate: Math.max(0, parseFloat(e.target.value) || 0) } : r))}
                            className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-base
                                       focus:border-emerald-600 focus:outline-none sm:text-[13px]"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] text-gray-500">Discount %</label>
                          <input
                            type="number" min={0} max={100} step="0.01" inputMode="decimal"
                            value={row.discount_percent}
                            onChange={e => setOrderItems(rows => rows.map((r, i) =>
                              i === index
                                ? { ...r, discount_percent: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) }
                                : r))}
                            className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-base
                                       focus:border-emerald-600 focus:outline-none sm:text-[13px]"
                          />
                        </div>
                      </div>

                      <p className="mt-2 text-right text-[12px] text-gray-500">
                        Line value{' '}
                        <span className="font-semibold text-gray-900">{money(lineValue(row))}</span>
                      </p>
                    </li>
                  ))}
                </ul>

                <div className="rounded-lg bg-gray-50 px-3.5 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] font-medium text-gray-700">
                      Estimated field order value
                    </span>
                    <span className="text-[15px] font-bold tabular-nums text-gray-900">
                      {money(orderTotal)}
                    </span>
                  </div>
                  {/* Stated at the point of entry, not just on a report — this
                      is the number most likely to be mistaken for a sale. */}
                  <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
                    An estimate of demand for MR performance reporting. It is not a Leomed sale,
                    does not affect stock, and creates nothing to collect.
                  </p>
                </div>
              </>
            )}
          </div>
        ) : (
          <p className="text-[13px] text-gray-500">No order taken during this visit.</p>
        )}
      </Section>

      <Section
        icon={CalendarClock}
        title="Follow-up needed?"
        action={
          <button
            type="button"
            role="switch"
            aria-checked={followUp}
            onClick={() => setFollowUp(v => !v)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition ${
              followUp ? 'bg-emerald-600' : 'bg-gray-300'
            }`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
              followUp ? 'left-[22px]' : 'left-0.5'
            }`} />
          </button>
        }
      >
        {followUp ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="fu_date" className="mb-1 block text-[12px] font-medium text-gray-700">
                Follow-up date
              </label>
              <input id="fu_date" type="date" value={followUpDate} min={isoDate()}
                     onChange={e => setFollowUpDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="fu_note" className="mb-1 block text-[12px] font-medium text-gray-700">
                What to follow up on
              </label>
              <input id="fu_note" value={followUpNote}
                     onChange={e => setFollowUpNote(e.target.value)} className={inputClass}
                     placeholder="Bring trial pack, confirm order…" />
            </div>
          </div>
        ) : (
          <p className="text-[13px] text-gray-500">No follow-up scheduled.</p>
        )}
      </Section>

      <Section icon={ClipboardList} title="Remarks">
        <textarea rows={2} value={remarks} onChange={e => setRemarks(e.target.value)}
                  className={inputClass} placeholder="Anything else worth noting…" aria-label="Remarks" />
      </Section>

      {/* Save stays reachable without scrolling to the bottom of a long form.
          bottom-20 on mobile: only MRs reach this form (visits.create), and
          MRs always get ErpShell's fixed bottom quick-nav — bottom-0 here
          would sit exactly behind it (z-30) and hide the button entirely. */}
      <div className="fixed inset-x-0 bottom-20 z-20 border-t border-gray-200 bg-white/95
                      px-4 py-3 backdrop-blur lg:sticky lg:bottom-4 lg:rounded-xl lg:border">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1 text-[12px] text-gray-500">
            {discussed.length > 0 && <span>{discussed.length} product{discussed.length > 1 ? 's' : ''} detailed</span>}
            {orderReceived && orderItems.length > 0 && (
              <span>{discussed.length > 0 ? ' · ' : ''}Estimated order {money(orderTotal)}</span>
            )}
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending}
            className="flex items-center gap-2 rounded-lg bg-emerald-700 px-6 py-3 text-[14px]
                       font-semibold text-white shadow-sm transition hover:bg-emerald-800
                       disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending && <Loader2 size={16} className="animate-spin" />}
            {pending ? 'Saving…' : 'Save visit'}
          </button>
        </div>
      </div>
    </div>
  )
}
