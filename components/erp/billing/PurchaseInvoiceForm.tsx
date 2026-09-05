'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Check, Loader2, Receipt, Trash2 } from 'lucide-react'
import ProductPicker from '../visits/ProductPicker'
import type { ProductOption } from '@/lib/erp/actions/lookup'
import { savePurchaseInvoice } from '@/lib/erp/actions/billing'
import { invoiceTotals, lineAmounts } from '@/lib/erp/invoice-math'
import { isoDate, money, PAYMENT_METHOD_LABELS } from '@/lib/erp/format'
import { PAYMENT_METHODS, type PaymentMethod } from '@/lib/erp/types'

/**
 * Record a purchase invoice → stock in.
 *
 * Each line opens or restocks a batch, so batch number and expiry are required
 * per line: pharma inventory without them cannot be recalled or written off.
 * Free quantity increases stock but never the money (spec §27, §53).
 */

interface SupplierOption { id: string; supplier_name: string; supplier_code: string }

interface Line {
  product: ProductOption
  batch_number: string
  expiry_date: string
  manufacturing_date: string
  quantity: number
  free_quantity: number
  purchase_rate: number
  discount_percent: number
  gst_rate: number
  mrp: number
  sale_rate: number
}

const inputClass =
  'w-full rounded-lg border border-gray-300 px-2.5 py-2 text-base text-gray-900 ' +
  'focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 focus:outline-none sm:text-[13px]'

export default function PurchaseInvoiceForm({ suppliers }: { suppliers: SupplierOption[] }) {
  const router = useRouter()
  const [supplierId, setSupplierId] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(isoDate())
  const [isInterstate, setIsInterstate] = useState(false)
  // Anything settled now becomes the first row in the invoice's payment
  // history — invoices are commonly part-paid on receipt (Q6).
  const [initialPayment, setInitialPayment] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('BANK_TRANSFER')
  const [paymentReference, setPaymentReference] = useState('')
  const [remarks, setRemarks] = useState('')
  const [lines, setLines] = useState<Line[]>([])

  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<Record<string, unknown> | null>(null)
  const [pending, startSubmit] = useTransition()

  const totals = invoiceTotals(lines.map(l => ({
    quantity: l.quantity, rate: l.purchase_rate,
    discountPercent: l.discount_percent, gstRate: l.gst_rate,
  })))

  /** Clears the form for the next invoice without a page reload — invoices
   *  usually arrive in a batch and get entered one after another. */
  function startAnother() {
    setSupplierId('')
    setInvoiceNumber('')
    setInvoiceDate(isoDate())
    setIsInterstate(false)
    setInitialPayment(0)
    setPaymentMethod('BANK_TRANSFER')
    setPaymentReference('')
    setRemarks('')
    setLines([])
    setError(null)
    setSaved(null)
  }

  const addLine = (product: ProductOption) =>
    setLines(rows => [...rows, {
      product,
      batch_number: '',
      expiry_date: '',
      manufacturing_date: '',
      quantity: 1,
      free_quantity: 0,
      purchase_rate: 0,
      discount_percent: 0,
      gst_rate: Number(product.gst_rate) || 0,
      mrp: 0,
      sale_rate: Number(product.sale_rate) || 0,
    }])

  const patch = (index: number, changes: Partial<Line>) =>
    setLines(rows => rows.map((row, i) => (i === index ? { ...row, ...changes } : row)))

  function handleSubmit() {
    setError(null)

    if (!supplierId)          return setError('Choose the supplier this invoice is from.')
    if (!invoiceNumber.trim()) return setError('Enter the supplier’s invoice number.')
    if (lines.length === 0)    return setError('Add at least one product line.')

    const incomplete = lines.findIndex(l => !l.batch_number.trim() || !l.expiry_date)
    if (incomplete >= 0) {
      return setError(
        `Enter the batch number and expiry date for ${lines[incomplete].product.product_name}.`,
      )
    }

    if (initialPayment > totals.grandTotal) {
      return setError(
        `The amount paid (${money(initialPayment)}) is more than the invoice total of ${money(totals.grandTotal)}.`,
      )
    }

    const payload = {
      supplier_id: supplierId,
      invoice_number: invoiceNumber.trim(),
      invoice_date: invoiceDate,
      is_interstate: isInterstate,
      initial_payment: initialPayment,
      payment_method: paymentMethod,
      payment_reference: paymentReference || undefined,
      remarks: remarks || undefined,
      items: lines.map(l => ({
        product_id: l.product.id,
        batch_number: l.batch_number.trim(),
        expiry_date: l.expiry_date,
        manufacturing_date: l.manufacturing_date || undefined,
        mrp: l.mrp || undefined,
        sale_rate: l.sale_rate || undefined,
        quantity: l.quantity,
        free_quantity: l.free_quantity,
        purchase_rate: l.purchase_rate,
        discount_percent: l.discount_percent,
        gst_rate: l.gst_rate,
      })),
    }

    startSubmit(async () => {
      const result = await savePurchaseInvoice(payload)
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
        <h1 className="text-lg font-bold text-gray-900">Purchase recorded</h1>
        <p className="mt-1.5 text-[13px] text-gray-600">
          Stock has been added to the batches on this invoice.
        </p>
        <p className="mt-3 text-[15px] font-semibold text-gray-900">
          {money(Number(saved.grand_total ?? 0))}
        </p>
        {Number(saved.balance ?? 0) > 0 && (
          <p className="mt-1 text-[12.5px] text-gray-500">
            {money(Number(saved.amount_paid ?? 0))} paid ·{' '}
            <span className="font-medium text-red-700">
              {money(Number(saved.balance ?? 0))} outstanding
            </span>
          </p>
        )}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => router.push('/erp/accounting/purchases')}
            className="rounded-lg bg-emerald-700 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-emerald-800"
          >
            View purchases
          </button>
          <button
            type="button"
            onClick={startAnother}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-[13px] font-semibold text-gray-700 hover:bg-gray-50"
          >
            Record another
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
            <Receipt size={15} />
          </span>
          <h2 className="text-[14px] font-semibold text-gray-900">Invoice details</h2>
        </div>

        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label htmlFor="supplier" className="mb-1 block text-[12px] font-medium text-gray-700">
              Supplier <span className="text-red-500">*</span>
            </label>
            <select id="supplier" value={supplierId} onChange={e => setSupplierId(e.target.value)} className={inputClass}>
              <option value="">Choose a supplier…</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.supplier_name} ({s.supplier_code})</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="inv_no" className="mb-1 block text-[12px] font-medium text-gray-700">
              Invoice number <span className="text-red-500">*</span>
            </label>
            <input id="inv_no" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)}
                   placeholder="As printed on the bill" className={inputClass} />
          </div>
          <div>
            <label htmlFor="inv_date" className="mb-1 block text-[12px] font-medium text-gray-700">
              Invoice date
            </label>
            <input id="inv_date" type="date" value={invoiceDate}
                   onChange={e => setInvoiceDate(e.target.value)} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className="flex items-center gap-2 pt-6 text-[13px] text-gray-700">
              <input type="checkbox" checked={isInterstate}
                     onChange={e => setIsInterstate(e.target.checked)}
                     className="h-4 w-4 rounded border-gray-300 text-emerald-700 focus:ring-emerald-600/30" />
              Interstate purchase (IGST instead of CGST + SGST)
            </label>
          </div>
          <div>
            <label htmlFor="paid" className="mb-1 block text-[12px] font-medium text-gray-700">
              Paid now (₹)
            </label>
            <input id="paid" type="number" min={0} step="0.01" value={initialPayment}
                   onChange={e => setInitialPayment(Math.max(0, parseFloat(e.target.value) || 0))}
                   className={inputClass} />
            <p className="mt-1 text-[11px] text-gray-400">
              Leave at 0 if unpaid. More payments can be added later.
            </p>
          </div>
          <div>
            <label htmlFor="pay_method" className="mb-1 block text-[12px] font-medium text-gray-700">
              Payment method
            </label>
            <select id="pay_method" value={paymentMethod} disabled={initialPayment <= 0}
                    onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
                    className={inputClass}>
              {PAYMENT_METHODS.map(m => (
                <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="pay_ref" className="mb-1 block text-[12px] font-medium text-gray-700">
              Payment reference
            </label>
            <input id="pay_ref" value={paymentReference} disabled={initialPayment <= 0}
                   onChange={e => setPaymentReference(e.target.value)}
                   placeholder="Cheque / UTR no." className={inputClass} />
          </div>
          <div>
            <label htmlFor="remarks" className="mb-1 block text-[12px] font-medium text-gray-700">Remarks</label>
            <input id="remarks" value={remarks} onChange={e => setRemarks(e.target.value)} className={inputClass} />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-[14px] font-semibold text-gray-900">Products</h2>
        <ProductPicker onPick={addLine} placeholder="Search products to add to this invoice…" />

        {lines.length > 0 && (
          <ul className="mt-4 space-y-3">
            {lines.map((line, index) => {
              const amounts = lineAmounts({
                quantity: line.quantity, rate: line.purchase_rate,
                discountPercent: line.discount_percent, gstRate: line.gst_rate,
              })
              return (
                <li key={`${line.product.id}-${index}`} className="rounded-xl border border-gray-200 p-3.5">
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
                      onClick={() => setLines(rows => rows.filter((_, i) => i !== index))}
                      className="shrink-0 rounded-lg p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                      aria-label={`Remove ${line.product.product_name}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-8">
                    <div className="col-span-2 sm:col-span-1">
                      <label className="mb-1 block text-[11px] text-gray-500">Batch no. *</label>
                      <input value={line.batch_number} onChange={e => patch(index, { batch_number: e.target.value })}
                             className={inputClass} />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <label className="mb-1 block text-[11px] text-gray-500">Expiry *</label>
                      <input type="date" value={line.expiry_date}
                             onChange={e => patch(index, { expiry_date: e.target.value })} className={inputClass} />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] text-gray-500">Qty</label>
                      <input type="number" min={1} inputMode="numeric" value={line.quantity}
                             onChange={e => patch(index, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                             className={inputClass} />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] text-gray-500">Free</label>
                      <input type="number" min={0} inputMode="numeric" value={line.free_quantity}
                             onChange={e => patch(index, { free_quantity: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                             className={inputClass} />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] text-gray-500">Rate ₹</label>
                      <input type="number" min={0} step="0.01" inputMode="decimal" value={line.purchase_rate}
                             onChange={e => patch(index, { purchase_rate: Math.max(0, parseFloat(e.target.value) || 0) })}
                             className={inputClass} />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] text-gray-500">Disc %</label>
                      <input type="number" min={0} max={100} step="0.01" value={line.discount_percent}
                             onChange={e => patch(index, { discount_percent: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) })}
                             className={inputClass} />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] text-gray-500">GST %</label>
                      <input type="number" min={0} max={28} step="0.01" value={line.gst_rate}
                             onChange={e => patch(index, { gst_rate: Math.min(28, Math.max(0, parseFloat(e.target.value) || 0)) })}
                             className={inputClass} />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] text-gray-500">MRP ₹</label>
                      <input type="number" min={0} step="0.01" value={line.mrp}
                             onChange={e => patch(index, { mrp: Math.max(0, parseFloat(e.target.value) || 0) })}
                             className={inputClass} />
                    </div>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center justify-end gap-x-4 gap-y-1
                                  border-t border-gray-100 pt-2.5 text-[12px] text-gray-500">
                    <span>Taxable {money(amounts.taxable)}</span>
                    <span>GST {money(amounts.tax)}</span>
                    <span className="text-[13px] font-semibold text-gray-900">
                      Line total {money(amounts.total)}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

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
