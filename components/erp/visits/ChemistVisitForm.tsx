'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { CalendarClock, Check, ClipboardList, Loader2, Store, Trash2 } from 'lucide-react'
import CustomerPicker, { type PickerValue } from './CustomerPicker'
import ProductPicker from './ProductPicker'
import { lookupChemists, findSimilarChemists, type ProductOption } from '@/lib/erp/actions/lookup'
import { createChemistVisit } from '@/lib/erp/actions/visits'
import type { VisitPurpose } from '@/lib/erp/types'
import { VISIT_PURPOSES } from '@/lib/erp/types'
import { isoDate, money, VISIT_PURPOSE_LABELS } from '@/lib/erp/format'
import type { FieldSpec } from '../form/Field'

/**
 * Record a chemist visit. Same one-transaction guarantee as the doctor visit
 * (spec §24, §25); chemists are stocked rather than detailed, so there is no
 * product-detailing section — just the conversation and any order taken.
 */

const NEW_CHEMIST_FIELDS: FieldSpec[] = [
  { name: 'chemist_name', label: 'Store name', required: true, span: 2, placeholder: 'Sharma Medical Store' },
  { name: 'owner_name',   label: 'Owner name' },
  { name: 'phone',        label: 'Phone', type: 'tel' },
  { name: 'area',         label: 'Area' },
  { name: 'city',         label: 'City' },
]

interface OrderRow {
  product: ProductOption
  quantity: number
  unit_rate: number
  discount_percent: number
}

function Section({
  icon: Icon, title, subtitle, children, action,
}: {
  icon: typeof Store
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

function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button" role="switch" aria-checked={on} aria-label={label} onClick={onToggle}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? 'bg-emerald-600' : 'bg-gray-300'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
        on ? 'left-[22px]' : 'left-0.5'
      }`} />
    </button>
  )
}

export default function ChemistVisitForm() {
  const [chemist, setChemist] = useState<PickerValue>({ mode: 'none' })
  const [visitDate, setVisitDate] = useState(isoDate())
  const [visitTime, setVisitTime] = useState('')
  const [purpose, setPurpose] = useState<VisitPurpose>('ORDER_COLLECTION')
  const [discussion, setDiscussion] = useState('')
  const [remarks, setRemarks] = useState('')

  const [orderReceived, setOrderReceived] = useState(false)
  const [orderBookNumber, setOrderBookNumber] = useState('')
  const [orderItems, setOrderItems] = useState<OrderRow[]>([])

  const [followUp, setFollowUp] = useState(false)
  const [followUpDate, setFollowUpDate] = useState('')
  const [followUpNote, setFollowUpNote] = useState('')

  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<Record<string, unknown> | null>(null)
  const [pending, startSubmit] = useTransition()
  const requestId = useRef<string | null>(null)

  /** Estimated value of one order line: quantity x rate, less any discount.
   *  Mirrors the generated column on erp_field_order_items (Q2). */
  const lineValue = (row: OrderRow) =>
    Math.round(row.quantity * row.unit_rate * (1 - row.discount_percent / 100) * 100) / 100

  const orderTotal = orderItems.reduce((sum, row) => sum + lineValue(row), 0)

  /** Clears the form for the next visit without a page reload. The request id
   *  is cleared too, so the next save is a new submission rather than a retry. */
  function startAnother() {
    setChemist({ mode: 'none' })
    setVisitDate(isoDate())
    setVisitTime('')
    setPurpose('ORDER_COLLECTION')
    setDiscussion('')
    setRemarks('')
    setOrderReceived(false)
    setOrderBookNumber('')
    setOrderItems([])
    setFollowUp(false)
    setFollowUpDate('')
    setFollowUpNote('')
    setError(null)
    setSaved(null)
    requestId.current = null
  }

  function handleSubmit() {
    setError(null)

    if (chemist.mode === 'none') {
      setError('Choose the chemist you visited, or add them as a new store.')
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
      ...(chemist.mode === 'existing'
        ? { chemist_id: chemist.id }
        : { new_chemist: chemist.values }),
      visit_date: visitDate,
      visit_time: visitTime || undefined,
      purpose,
      discussion: discussion || undefined,
      remarks: remarks || undefined,
      client_request_id: requestId.current,
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
      const result = await createChemistVisit(payload)
      if (result.ok) setSaved(result.data ?? {})
      else setError(result.error ?? 'Could not save the visit.')
    })
  }

  if (saved) {
    return (
      <div className="mx-auto max-w-md py-8 text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
          <Check size={26} strokeWidth={2.6} />
        </span>
        <h1 className="text-lg font-bold text-gray-900">
          {saved.duplicate === true ? 'Already saved' : 'Visit recorded'}
        </h1>
        <p className="mt-1.5 text-[13px] text-gray-600">
          {saved.duplicate === true
            ? 'This visit had already been saved — nothing was duplicated.'
            : 'Your chemist visit has been added to today’s activity.'}
        </p>
        {typeof saved.order_number === 'string' && (
          <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-[12.5px] text-blue-800">
            Field order <strong>{saved.order_number}</strong> recorded.
            This tracks demand — it is not a company invoice.
          </p>
        )}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button type="button" onClick={startAnother}
                  className="rounded-lg bg-emerald-700 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-emerald-800">
            Record another visit
          </button>
          <Link href="/erp/mr"
                className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-[13px] font-semibold text-gray-700 hover:bg-gray-50">
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

      <Section icon={Store} title="Which chemist?" subtitle="Search the master, or add a store you're visiting for the first time.">
        <CustomerPicker
          noun="chemist"
          nameFieldName="chemist_name"
          newFields={NEW_CHEMIST_FIELDS}
          value={chemist}
          onChange={setChemist}
          search={async term => {
            const rows = await lookupChemists(term)
            return rows.map(c => ({
              id: c.id, name: c.chemist_name, code: c.chemist_code,
              detail: c.owner_name, area: c.area, phone: c.phone,
            }))
          }}
          findDuplicates={async (name, phone) => {
            const rows = await findSimilarChemists(name, phone)
            return rows.map(c => ({
              id: c.id, name: c.chemist_name, code: c.chemist_code,
              detail: c.owner_name, area: c.area, phone: c.phone, score: c.match_score,
            }))
          }}
        />
      </Section>

      <Section icon={CalendarClock} title="Visit details">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-3">
          <div>
            <label htmlFor="c_date" className="mb-1 block text-[12px] font-medium text-gray-700">Date</label>
            <input id="c_date" type="date" value={visitDate} max={isoDate()}
                   onChange={e => setVisitDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="c_time" className="mb-1 block text-[12px] font-medium text-gray-700">Time</label>
            <input id="c_time" type="time" value={visitTime}
                   onChange={e => setVisitTime(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="c_purpose" className="mb-1 block text-[12px] font-medium text-gray-700">Purpose</label>
            <select id="c_purpose" value={purpose}
                    onChange={e => setPurpose(e.target.value as VisitPurpose)} className={inputClass}>
              {VISIT_PURPOSES.map(p => <option key={p} value={p}>{VISIT_PURPOSE_LABELS[p]}</option>)}
            </select>
          </div>
          <div className="sm:col-span-3">
            <label htmlFor="c_discussion" className="mb-1 block text-[12px] font-medium text-gray-700">
              What was discussed
            </label>
            <textarea id="c_discussion" rows={3} value={discussion}
                      onChange={e => setDiscussion(e.target.value)} className={inputClass}
                      placeholder="Stock position, pending payments, new launches…" />
          </div>
        </div>
      </Section>

      <Section
        icon={ClipboardList}
        title="Order received?"
        subtitle="Recorded as a field order to measure demand — it does not raise a company invoice."
        action={<Toggle on={orderReceived} onToggle={() => setOrderReceived(v => !v)} label="Order received" />}
      >
        {orderReceived ? (
          <div className="space-y-3">
            <div>
              <label htmlFor="c_order_book" className="mb-1 block text-[12px] font-medium text-gray-700">
                Order book number
              </label>
              <input id="c_order_book" value={orderBookNumber}
                     onChange={e => setOrderBookNumber(e.target.value)}
                     placeholder="From your physical order book" className={inputClass} />
            </div>

            <ProductPicker
              onPick={p => setOrderItems(rows => [...rows, { product: p, quantity: 1, unit_rate: Number(p.sale_rate) || 0, discount_percent: 0 }])}
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
        action={<Toggle on={followUp} onToggle={() => setFollowUp(v => !v)} label="Follow-up needed" />}
      >
        {followUp ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="c_fu_date" className="mb-1 block text-[12px] font-medium text-gray-700">
                Follow-up date
              </label>
              <input id="c_fu_date" type="date" value={followUpDate} min={isoDate()}
                     onChange={e => setFollowUpDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="c_fu_note" className="mb-1 block text-[12px] font-medium text-gray-700">
                What to follow up on
              </label>
              <input id="c_fu_note" value={followUpNote}
                     onChange={e => setFollowUpNote(e.target.value)} className={inputClass}
                     placeholder="Collect payment, restock…" />
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

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95
                      px-4 py-3 backdrop-blur lg:sticky lg:bottom-4 lg:rounded-xl lg:border">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1 text-[12px] text-gray-500">
            {orderReceived && orderItems.length > 0 && <span>Estimated order {money(orderTotal)}</span>}
          </div>
          <button
            type="button" onClick={handleSubmit} disabled={pending}
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
