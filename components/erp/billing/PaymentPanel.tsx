'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Trash2, X } from 'lucide-react'
import {
  deletePayment, recordPurchasePayment, recordSalesReceipt,
} from '@/lib/erp/actions/billing'
import { formatDate, isoDate, money, PAYMENT_METHOD_LABELS } from '@/lib/erp/format'
import { PAYMENT_METHODS, type PaymentMethod } from '@/lib/erp/types'

/**
 * Payment history for one invoice (Q6).
 *
 * An invoice can be settled over several payments, so this shows the whole
 * history and adds to it. Nothing here writes a balance: the total, the
 * outstanding amount and the status are all derived by the database from these
 * rows, which is why they refresh from the server after every change rather
 * than being computed optimistically here.
 */

export interface PaymentEntry {
  id: string
  date: string
  amount: number
  payment_method: PaymentMethod
  reference_number: string | null
  remarks: string | null
  recordedBy: string | null
}

const inputClass =
  'w-full rounded-lg border border-gray-300 px-2.5 py-2 text-[13px] text-gray-900 ' +
  'focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 focus:outline-none'

export default function PaymentPanel({
  kind, invoiceId, grandTotal, entries, canRecord, canDelete,
}: {
  kind: 'purchase' | 'sales'
  invoiceId: string
  grandTotal: number
  entries: PaymentEntry[]
  canRecord: boolean
  canDelete: boolean
}) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(isoDate())
  const [method, setMethod] = useState<PaymentMethod>('BANK_TRANSFER')
  const [reference, setReference] = useState('')
  const [remarks, setRemarks] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const noun = kind === 'purchase' ? 'payment' : 'receipt'
  const settled = entries.reduce((sum, e) => sum + Number(e.amount), 0)
  const balance = grandTotal - settled

  const reset = () => {
    setAmount(''); setDate(isoDate()); setMethod('BANK_TRANSFER')
    setReference(''); setRemarks(''); setError(null); setAdding(false)
  }

  function submit() {
    setError(null)
    const value = parseFloat(amount)

    if (!Number.isFinite(value) || value <= 0) {
      return setError(`Enter the ${noun} amount.`)
    }
    // The database refuses this too; catching it here saves a round trip and
    // says so in the same words.
    if (value > balance) {
      return setError(
        `That is more than the outstanding ${money(balance)}. Record a smaller amount.`,
      )
    }

    startTransition(async () => {
      const payload = kind === 'purchase'
        ? {
            purchase_invoice_id: invoiceId,
            payment_date: date,
            amount: value,
            payment_method: method,
            reference_number: reference || undefined,
            remarks: remarks || undefined,
          }
        : {
            sales_invoice_id: invoiceId,
            receipt_date: date,
            amount: value,
            payment_method: method,
            reference_number: reference || undefined,
            remarks: remarks || undefined,
          }

      const result = kind === 'purchase'
        ? await recordPurchasePayment(payload)
        : await recordSalesReceipt(payload)

      if (result.ok) { reset(); router.refresh() }
      else setError(result.error ?? `Could not record the ${noun}.`)
    })
  }

  function remove(id: string) {
    if (!confirm(`Remove this ${noun}? The invoice balance will go back up.`)) return
    setError(null)
    startTransition(async () => {
      const result = await deletePayment(kind, { payment_id: id })
      if (result.ok) router.refresh()
      else setError(result.error ?? `Could not remove the ${noun}.`)
    })
  }

  return (
    <div>
      <dl className="mb-3 space-y-2 text-[13px]">
        <div className="flex justify-between">
          <dt className="text-gray-500">Invoice total</dt>
          <dd className="tabular-nums text-gray-900">{money(grandTotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-500">
            {kind === 'purchase' ? 'Total paid' : 'Total received'}
          </dt>
          <dd className="tabular-nums text-gray-900">{money(settled)}</dd>
        </div>
        <div className="flex justify-between border-t border-gray-100 pt-2">
          <dt className="font-medium text-gray-700">Balance</dt>
          <dd className={`font-bold tabular-nums ${
            balance > 0 ? 'text-red-700' : 'text-emerald-700'
          }`}>
            {money(Math.max(0, balance))}
          </dd>
        </div>
      </dl>

      {entries.length > 0 && (
        <ul className="mb-3 divide-y divide-gray-100 rounded-lg border border-gray-200">
          {entries.map(entry => (
            <li key={entry.id} className="flex items-start gap-2 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-semibold tabular-nums text-gray-900">
                    {money(entry.amount)}
                  </span>
                  <span className="shrink-0 text-[11.5px] text-gray-500">
                    {formatDate(entry.date)}
                  </span>
                </div>
                <p className="mt-0.5 text-[11.5px] text-gray-500">
                  {PAYMENT_METHOD_LABELS[entry.payment_method] ?? entry.payment_method}
                  {entry.reference_number && ` · ${entry.reference_number}`}
                  {entry.recordedBy && ` · ${entry.recordedBy}`}
                </p>
                {entry.remarks && (
                  <p className="mt-0.5 text-[11.5px] text-gray-400">{entry.remarks}</p>
                )}
              </div>
              {canDelete && (
                <button
                  type="button"
                  onClick={() => remove(entry.id)}
                  disabled={pending}
                  aria-label={`Remove ${noun} of ${money(entry.amount)}`}
                  className="shrink-0 rounded p-1 text-gray-300 transition hover:bg-red-50
                             hover:text-red-600 disabled:opacity-50"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {entries.length === 0 && (
        <p className="mb-3 rounded-lg bg-gray-50 px-3 py-2.5 text-[12.5px] text-gray-500">
          Nothing {kind === 'purchase' ? 'paid' : 'received'} yet.
        </p>
      )}

      {error && (
        <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2
                                   text-[12px] text-red-800">
          {error}
        </p>
      )}

      {canRecord && balance > 0 && !adding && (
        <button
          type="button"
          onClick={() => { setAdding(true); setAmount(String(balance)) }}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg
                     border border-emerald-300 bg-emerald-50 px-3 py-2 text-[12.5px]
                     font-semibold text-emerald-800 transition hover:bg-emerald-100"
        >
          <Plus size={14} /> Record {noun}
        </button>
      )}

      {canRecord && adding && (
        <div className="space-y-2.5 rounded-lg border border-gray-200 p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[12.5px] font-semibold text-gray-800">
              New {noun}
            </h3>
            <button type="button" onClick={reset} aria-label="Cancel"
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
              <X size={14} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="pay_amount" className="mb-1 block text-[11px] text-gray-500">
                Amount (₹)
              </label>
              <input id="pay_amount" type="number" min="0.01" step="0.01" value={amount}
                     onChange={e => setAmount(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="pay_date" className="mb-1 block text-[11px] text-gray-500">Date</label>
              <input id="pay_date" type="date" value={date} max={isoDate()}
                     onChange={e => setDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="pay_method" className="mb-1 block text-[11px] text-gray-500">Method</label>
              <select id="pay_method" value={method}
                      onChange={e => setMethod(e.target.value as PaymentMethod)} className={inputClass}>
                {PAYMENT_METHODS.map(m => (
                  <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="pay_ref" className="mb-1 block text-[11px] text-gray-500">
                Reference
              </label>
              <input id="pay_ref" value={reference} onChange={e => setReference(e.target.value)}
                     placeholder="Cheque / UTR no." className={inputClass} />
            </div>
            <div className="col-span-2">
              <label htmlFor="pay_remarks" className="mb-1 block text-[11px] text-gray-500">
                Remarks
              </label>
              <input id="pay_remarks" value={remarks} onChange={e => setRemarks(e.target.value)}
                     className={inputClass} />
            </div>
          </div>

          <button
            type="button" onClick={submit} disabled={pending}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg
                       bg-emerald-700 px-3 py-2 text-[12.5px] font-semibold text-white
                       transition hover:bg-emerald-800 disabled:opacity-60"
          >
            {pending && <Loader2 size={13} className="animate-spin" />}
            {pending ? 'Saving…' : `Save ${noun}`}
          </button>
        </div>
      )}

      {balance <= 0 && entries.length > 0 && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-center text-[12.5px] font-medium text-emerald-800">
          Fully settled
        </p>
      )}
    </div>
  )
}
