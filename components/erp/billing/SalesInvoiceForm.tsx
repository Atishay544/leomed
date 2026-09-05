'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { AlertTriangle, Check, Loader2, ShoppingCart, Trash2 } from 'lucide-react'
import ProductPicker from '../visits/ProductPicker'
import { lookupBatchesForSale, type ProductOption } from '@/lib/erp/actions/lookup'
import { saveSalesInvoice } from '@/lib/erp/actions/billing'
import { invoiceTotals, lineAmounts } from '@/lib/erp/invoice-math'
import { daysUntil, formatDate, isoDate, money, PAYMENT_METHOD_LABELS, qty } from '@/lib/erp/format'
import { PAYMENT_METHODS, type PaymentMethod } from '@/lib/erp/types'

/**
 * Raise a sales invoice to a distributor, or direct to a chemist → stock out.
 *
 * This is actual Leomed revenue, unrelated to the field orders MRs collect
 * (spec §29). Every line needs a batch, and batches are offered
 * earliest-expiry-first because that is the order a storekeeper picks them in.
 *
 * The availability checks here are guidance. The binding checks — stock on
 * hand, and whether expired stock may be sold at all — run inside the database
 * transaction, which aborts the whole invoice rather than overselling.
 */

interface DistributorOption { id: string; distributor_name: string; distributor_code: string }
interface ChemistOption { id: string; chemist_name: string }
type BuyerType = 'DISTRIBUTOR' | 'CHEMIST'

interface BatchOption {
  id: string
  batch_number: string
  expiry_date: string
  current_quantity: number
  sale_rate: number
  mrp: number
}

interface Line {
  /** Stable row identity. Batches load asynchronously, so the result must be
   *  matched back by id — an array index goes stale the moment a second
   *  product is added before the first one's batches arrive. */
  uid: string
  product: ProductOption
  batches: BatchOption[]
  loadingBatches: boolean
  batch_id: string
  quantity: number
  free_quantity: number
  sale_rate: number
  discount_percent: number
  gst_rate: number
}

let rowCounter = 0
const nextUid = () => `line-${++rowCounter}`

const inputClass =
  'w-full rounded-lg border border-gray-300 px-2.5 py-2 text-base text-gray-900 ' +
  'focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 focus:outline-none sm:text-[13px]'

export default function SalesInvoiceForm({
  distributors, chemists, isAdmin, allowExpiredSale,
}: {
  distributors: DistributorOption[]
  chemists: ChemistOption[]
  /** Only an administrator may authorise selling an expired batch (Q9). */
  isAdmin: boolean
  /** The business-level switch in Settings. Off by default. */
  allowExpiredSale: boolean
}) {
  const router = useRouter()
  const [buyerType, setBuyerType] = useState<BuyerType>('DISTRIBUTOR')
  const [distributorId, setDistributorId] = useState('')
  const [chemistId, setChemistId] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(isoDate())
  const [isInterstate, setIsInterstate] = useState(false)
  const [initialPayment, setInitialPayment] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('BANK_TRANSFER')
  const [paymentReference, setPaymentReference] = useState('')
  const [expiredReason, setExpiredReason] = useState('')
  const [remarks, setRemarks] = useState('')
  const [lines, setLines] = useState<Line[]>([])

  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<Record<string, unknown> | null>(null)
  const [pending, startSubmit] = useTransition()

  const totals = invoiceTotals(lines.map(l => ({
    quantity: l.quantity, rate: l.sale_rate,
    discountPercent: l.discount_percent, gstRate: l.gst_rate,
  })))

  /** Every line whose chosen batch has already expired (Q9). */
  const expiredLines = lines.filter(line => {
    const batch = line.batches.find(b => b.id === line.batch_id)
    const days = batch ? daysUntil(batch.expiry_date) : null
    return days != null && days < 0
  })
  const hasExpired = expiredLines.length > 0

  /** Clears the form for the next invoice without a page reload. */
  function startAnother() {
    setBuyerType('DISTRIBUTOR')
    setDistributorId('')
    setChemistId('')
    setInvoiceDate(isoDate())
    setIsInterstate(false)
    setInitialPayment(0)
    setPaymentMethod('BANK_TRANSFER')
    setPaymentReference('')
    setExpiredReason('')
    setRemarks('')
    setLines([])
    setError(null)
    setSaved(null)
  }

  const patch = (uid: string, changes: Partial<Line>) =>
    setLines(rows => rows.map(row => (row.uid === uid ? { ...row, ...changes } : row)))

  async function addLine(product: ProductOption) {
    const uid = nextUid()
    setLines(rows => [...rows, {
      uid,
      product,
      batches: [],
      loadingBatches: true,
      batch_id: '',
      quantity: 1,
      free_quantity: 0,
      sale_rate: Number(product.sale_rate) || 0,
      discount_percent: 0,
      gst_rate: Number(product.gst_rate) || 0,
    }])

    const batches = (await lookupBatchesForSale(product.id)) as unknown as BatchOption[]
    setLines(rows => rows.map(row => row.uid === uid
      ? {
          ...row,
          batches,
          loadingBatches: false,
          // FEFO: the batch expiring soonest is preselected.
          batch_id: batches[0]?.id ?? '',
          sale_rate: batches[0] ? Number(batches[0].sale_rate) || row.sale_rate : row.sale_rate,
        }
      : row))
  }

  function handleSubmit() {
    setError(null)

    if (buyerType === 'DISTRIBUTOR' && !distributorId) return setError('Choose the distributor this invoice is for.')
    if (buyerType === 'CHEMIST' && !chemistId)         return setError('Choose the chemist this invoice is for.')
    if (lines.length === 0) return setError('Add at least one product line.')

    const noBatch = lines.findIndex(l => !l.batch_id)
    if (noBatch >= 0) {
      const line = lines[noBatch]
      return setError(
        line.batches.length === 0
          ? `${line.product.product_name} has no stock available to sell.`
          : `Choose a batch for ${line.product.product_name}.`,
      )
    }

    // Q9: expired stock is blocked by default. The database refuses it too —
    // these checks exist so the operator is told why before submitting.
    if (hasExpired) {
      if (!allowExpiredSale) {
        return setError(
          'This invoice includes expired stock, which cannot be sold. ' +
          'An administrator can enable expired sales in Settings if the business allows it.',
        )
      }
      if (!isAdmin) {
        return setError(
          'This invoice includes expired stock. Only an administrator can authorise that sale.',
        )
      }
      if (expiredReason.trim().length < 10) {
        return setError('Give a written reason for selling expired stock — at least a sentence.')
      }
    }

    if (initialPayment > totals.grandTotal) {
      return setError(
        `The amount received (${money(initialPayment)}) is more than the invoice total of ${money(totals.grandTotal)}.`,
      )
    }

    const payload = {
      distributor_id: buyerType === 'DISTRIBUTOR' ? distributorId : undefined,
      chemist_id:     buyerType === 'CHEMIST'     ? chemistId     : undefined,
      invoice_date: invoiceDate,
      is_interstate: isInterstate,
      initial_payment: initialPayment,
      payment_method: paymentMethod,
      payment_reference: paymentReference || undefined,
      expired_sale_reason: hasExpired ? expiredReason.trim() : undefined,
      remarks: remarks || undefined,
      items: lines.map(l => ({
        product_id: l.product.id,
        batch_id: l.batch_id,
        quantity: l.quantity,
        free_quantity: l.free_quantity,
        sale_rate: l.sale_rate,
        discount_percent: l.discount_percent,
        gst_rate: l.gst_rate,
      })),
    }

    startSubmit(async () => {
      const result = await saveSalesInvoice(payload)
      if (result.ok) setSaved(result.data ?? {})
      else setError(result.error ?? 'Could not save the invoice.')
    })
  }

  if (saved) {
    return (
      <div className="mx-auto max-w-md py-8 text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
          <Check size={26} strokeWidth={2.6} />
        </span>
        <h1 className="text-lg font-bold text-gray-900">Sales invoice raised</h1>
        <p className="mt-1.5 text-[13px] text-gray-600">Stock has been deducted from the batches sold.</p>
        {typeof saved.invoice_number === 'string' && (
          <p className="mt-3 font-mono text-[14px] font-semibold text-gray-900">{saved.invoice_number}</p>
        )}
        <p className="mt-1 text-[15px] font-semibold text-gray-900">
          {money(Number(saved.grand_total ?? 0))}
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => router.push('/erp/accounting/sales')}
            className="rounded-lg bg-emerald-700 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-emerald-800"
          >
            View sales
          </button>
          <button
            type="button"
            onClick={startAnother}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-[13px] font-semibold text-gray-700 hover:bg-gray-50"
          >
            Raise another
          </button>
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

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <ShoppingCart size={15} />
          </span>
          <h2 className="text-[14px] font-semibold text-gray-900">Invoice details</h2>
        </div>

        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-[12px] font-medium text-gray-700">
              Bill to <span className="text-red-500">*</span>
            </label>
            <div className="mb-2 flex gap-2">
              {(['DISTRIBUTOR', 'CHEMIST'] as BuyerType[]).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setBuyerType(t)}
                  className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition ${
                    buyerType === t
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                      : 'border-gray-300 text-gray-600 hover:border-gray-400'
                  }`}
                >
                  {t === 'DISTRIBUTOR' ? 'Distributor' : 'Chemist (direct sale)'}
                </button>
              ))}
            </div>
            {buyerType === 'DISTRIBUTOR' ? (
              <select id="distributor" value={distributorId}
                      onChange={e => setDistributorId(e.target.value)} className={inputClass}>
                <option value="">Choose a distributor…</option>
                {distributors.map(d => (
                  <option key={d.id} value={d.id}>{d.distributor_name} ({d.distributor_code})</option>
                ))}
              </select>
            ) : (
              <select id="chemist" value={chemistId}
                      onChange={e => setChemistId(e.target.value)} className={inputClass}>
                <option value="">Choose a chemist…</option>
                {chemists.map(c => (
                  <option key={c.id} value={c.id}>{c.chemist_name}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label htmlFor="s_date" className="mb-1 block text-[12px] font-medium text-gray-700">
              Invoice date
            </label>
            <input id="s_date" type="date" value={invoiceDate}
                   onChange={e => setInvoiceDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="s_paid" className="mb-1 block text-[12px] font-medium text-gray-700">
              Received now (₹)
            </label>
            <input id="s_paid" type="number" min={0} step="0.01" value={initialPayment}
                   onChange={e => setInitialPayment(Math.max(0, parseFloat(e.target.value) || 0))}
                   className={inputClass} />
            <p className="mt-1 text-[11px] text-gray-400">
              Leave at 0 if on credit. More receipts can be added later.
            </p>
          </div>
          <div>
            <label htmlFor="s_method" className="mb-1 block text-[12px] font-medium text-gray-700">
              Payment method
            </label>
            <select id="s_method" value={paymentMethod} disabled={initialPayment <= 0}
                    onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
                    className={inputClass}>
              {PAYMENT_METHODS.map(m => (
                <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="s_ref" className="mb-1 block text-[12px] font-medium text-gray-700">
              Payment reference
            </label>
            <input id="s_ref" value={paymentReference} disabled={initialPayment <= 0}
                   onChange={e => setPaymentReference(e.target.value)}
                   placeholder="Cheque / UTR no." className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className="flex items-center gap-2 text-[13px] text-gray-700">
              <input type="checkbox" checked={isInterstate}
                     onChange={e => setIsInterstate(e.target.checked)}
                     className="h-4 w-4 rounded border-gray-300 text-emerald-700 focus:ring-emerald-600/30" />
              Interstate sale (IGST instead of CGST + SGST)
            </label>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="s_remarks" className="mb-1 block text-[12px] font-medium text-gray-700">Remarks</label>
            <input id="s_remarks" value={remarks} onChange={e => setRemarks(e.target.value)} className={inputClass} />
          </div>
        </div>
        <p className="mt-3 text-[11.5px] text-gray-400">
          The invoice number is issued by the system when you save.
        </p>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-[14px] font-semibold text-gray-900">Products</h2>
        <ProductPicker onPick={addLine} placeholder="Search products to add to this invoice…" />

        {lines.length > 0 && (
          <ul className="mt-4 space-y-3">
            {lines.map(line => {
              const batch = line.batches.find(b => b.id === line.batch_id)
              const needed = line.quantity + line.free_quantity
              const short = batch ? needed > batch.current_quantity : false
              const days = batch ? daysUntil(batch.expiry_date) : null
              const expired = days != null && days < 0
              const amounts = lineAmounts({
                quantity: line.quantity, rate: line.sale_rate,
                discountPercent: line.discount_percent, gstRate: line.gst_rate,
              })

              return (
                <li key={line.uid} className="rounded-xl border border-gray-200 p-3.5">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[13.5px] font-medium text-gray-900">
                        {line.product.product_name}
                        {line.product.strength && <span className="ml-1 text-gray-500">{line.product.strength}</span>}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-gray-400">{line.product.product_code}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLines(rows => rows.filter(row => row.uid !== line.uid))}
                      className="shrink-0 rounded-lg p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                      aria-label={`Remove ${line.product.product_name}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  {line.loadingBatches ? (
                    <p className="flex items-center gap-2 text-[12.5px] text-gray-500">
                      <Loader2 size={13} className="animate-spin" /> Checking available stock…
                    </p>
                  ) : line.batches.length === 0 ? (
                    <p className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-800">
                      <AlertTriangle size={14} className="shrink-0" />
                      No stock available for this product. Record a purchase first.
                    </p>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
                        <div className="col-span-2">
                          <label className="mb-1 block text-[11px] text-gray-500">Batch (earliest expiry first)</label>
                          <select
                            value={line.batch_id}
                            onChange={e => {
                              const next = line.batches.find(b => b.id === e.target.value)
                              patch(line.uid, {
                                batch_id: e.target.value,
                                sale_rate: next ? Number(next.sale_rate) || line.sale_rate : line.sale_rate,
                              })
                            }}
                            className={inputClass}
                          >
                            {line.batches.map(b => (
                              <option key={b.id} value={b.id}>
                                {b.batch_number} · exp {formatDate(b.expiry_date)} · {qty(b.current_quantity)} in stock
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] text-gray-500">Qty</label>
                          <input type="number" min={1} inputMode="numeric" value={line.quantity}
                                 onChange={e => patch(line.uid, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                                 className={inputClass} />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] text-gray-500">Free</label>
                          <input type="number" min={0} inputMode="numeric" value={line.free_quantity}
                                 onChange={e => patch(line.uid, { free_quantity: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                                 className={inputClass} />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] text-gray-500">Rate ₹</label>
                          <input type="number" min={0} step="0.01" inputMode="decimal" value={line.sale_rate}
                                 onChange={e => patch(line.uid, { sale_rate: Math.max(0, parseFloat(e.target.value) || 0) })}
                                 className={inputClass} />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] text-gray-500">Disc %</label>
                          <input type="number" min={0} max={100} step="0.01" value={line.discount_percent}
                                 onChange={e => patch(line.uid, { discount_percent: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) })}
                                 className={inputClass} />
                        </div>
                      </div>

                      {(short || expired) && (
                        <p className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                          <AlertTriangle size={14} className="mt-px shrink-0" />
                          {expired
                            ? `This batch expired on ${formatDate(batch!.expiry_date)} — see the authorisation notice below.`
                            : `Only ${qty(batch!.current_quantity)} in this batch — ${qty(needed)} requested. Saving will be refused.`}
                        </p>
                      )}

                      <div className="mt-2.5 flex flex-wrap items-center justify-end gap-x-4 gap-y-1
                                      border-t border-gray-100 pt-2.5 text-[12px] text-gray-500">
                        <span>GST {line.gst_rate}% · {money(amounts.tax)}</span>
                        <span className="text-[13px] font-semibold text-gray-900">
                          Line total {money(amounts.total)}
                        </span>
                      </div>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Q9: appears only when an expired batch is actually on the invoice.
          Blocked outright unless the business has enabled it AND the person
          raising it is an administrator AND they write down why. */}
      {hasExpired && (
        <section className="rounded-xl border-2 border-red-300 bg-red-50 p-4 sm:p-5">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-600" />
            <div className="min-w-0 flex-1">
              <h2 className="text-[14px] font-bold text-red-900">
                This invoice contains expired stock
              </h2>
              <ul className="mt-2 space-y-0.5 text-[12.5px] text-red-800">
                {expiredLines.map(line => {
                  const batch = line.batches.find(b => b.id === line.batch_id)!
                  return (
                    <li key={line.uid}>
                      {line.product.product_name} — batch {batch.batch_number}, expired{' '}
                      {formatDate(batch.expiry_date)}
                    </li>
                  )
                })}
              </ul>

              {!allowExpiredSale ? (
                <p className="mt-3 rounded-lg bg-white px-3 py-2.5 text-[12.5px] leading-relaxed text-red-900">
                  Selling expired stock is switched off for this business. Remove these lines, or
                  ask an administrator to change it in Settings. Saving will be refused.
                </p>
              ) : !isAdmin ? (
                <p className="mt-3 rounded-lg bg-white px-3 py-2.5 text-[12.5px] leading-relaxed text-red-900">
                  Only an administrator can authorise this. Remove these lines, or ask an
                  administrator to raise the invoice. Saving will be refused.
                </p>
              ) : (
                <div className="mt-3">
                  <label htmlFor="expired_reason"
                         className="mb-1 block text-[12.5px] font-semibold text-red-900">
                    Reason for authorising this sale <span className="text-red-600">*</span>
                  </label>
                  <textarea
                    id="expired_reason"
                    rows={2}
                    value={expiredReason}
                    onChange={e => setExpiredReason(e.target.value)}
                    placeholder="Why is this expired stock being sold, and on whose instruction?"
                    className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-[13px]
                               text-gray-900 focus:border-red-500 focus:ring-2 focus:ring-red-500/20
                               focus:outline-none"
                  />
                  <p className="mt-1.5 text-[11.5px] leading-relaxed text-red-800">
                    Your name and the time will be recorded against this invoice and written to the
                    audit log.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 px-4 py-3
                      backdrop-blur lg:sticky lg:bottom-4 lg:rounded-xl lg:border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-gray-500">
            <span>Subtotal <strong className="text-gray-800">{money(totals.subtotal)}</strong></span>
            {totals.discount > 0 && <span>Discount <strong className="text-gray-800">{money(totals.discount)}</strong></span>}
            <span>GST <strong className="text-gray-800">{money(totals.tax)}</strong></span>
            <span className="text-[15px] font-bold text-gray-900">{money(totals.grandTotal)}</span>
          </div>
          <button
            type="button" onClick={handleSubmit} disabled={pending}
            className="flex items-center gap-2 rounded-lg bg-emerald-700 px-6 py-3 text-[14px]
                       font-semibold text-white transition hover:bg-emerald-800
                       disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending && <Loader2 size={16} className="animate-spin" />}
            {pending ? 'Saving…' : 'Save invoice'}
          </button>
        </div>
        <p className="mx-auto mt-1.5 max-w-5xl text-[10.5px] text-gray-400">
          Totals shown are a preview — the stored figures are recalculated on the server.
        </p>
      </div>
    </div>
  )
}
