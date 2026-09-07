'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, X } from 'lucide-react'
import { lookupBillingCustomers, type BillingCustomerOption } from '@/lib/erp/actions/lookup'
import { lookupProducts, type ProductOption } from '@/lib/erp/actions/lookup'
import { savePricingRule } from '@/lib/erp/actions/pricing'
import { isoDate } from '@/lib/erp/format'
import { previewPrice, priceInclGst } from '@/lib/erp/pricing-preview'
import { BILLING_CUSTOMER_TYPES, CALCULATION_BASES, CALCULATION_METHODS } from '@/lib/erp/types'
import type { BillingCustomerType } from '@/lib/erp/types'

const CUSTOMER_TYPE_LABELS: Record<BillingCustomerType, string> = {
  DISTRIBUTOR: 'Distributor', CHEMIST: 'Retailer / Chemist', DOCTOR: 'Doctor (direct sale)',
}

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] focus:border-emerald-600 focus:outline-none'

/**
 * Create a customer-specific negotiated price (spec §13, §47). A search box
 * for both product and customer, not a 1000-row dropdown — the same reason
 * every other admin picker in this ERP works this way.
 */
export default function NegotiatedPricingDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [customerType, setCustomerType] = useState<BillingCustomerType>('CHEMIST')

  const [productTerm, setProductTerm] = useState('')
  const [productResults, setProductResults] = useState<ProductOption[]>([])
  const [product, setProduct] = useState<ProductOption | null>(null)

  const [customerTerm, setCustomerTerm] = useState('')
  const [customerResults, setCustomerResults] = useState<BillingCustomerOption[]>([])
  const [customer, setCustomer] = useState<BillingCustomerOption | null>(null)

  const [basis, setBasis] = useState<'MRP' | 'PTR' | 'PTS' | 'COST' | 'FIXED'>('MRP')
  const [method, setMethod] = useState<'MARGIN' | 'DISCOUNT' | 'MARKUP' | 'FIXED_PRICE'>('MARGIN')
  const [percentage, setPercentage] = useState('')
  const [fixedAmount, setFixedAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) return
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => setProductResults(await lookupProducts(productTerm)), 250)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [productTerm, open])

  useEffect(() => {
    if (!open) return
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => setCustomerResults(await lookupBillingCustomers(customerType, customerTerm)), 250)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [customerTerm, customerType, open])

  const preview = product
    ? previewPrice(basis, method, parseFloat(percentage) || 0, parseFloat(fixedAmount) || 0, product.mrp, product.retailer_price)
    : null

  function reset() {
    setProductTerm(''); setProductResults([]); setProduct(null)
    setCustomerTerm(''); setCustomerResults([]); setCustomer(null)
    setBasis('MRP'); setMethod('MARGIN'); setPercentage(''); setFixedAmount(''); setError(null)
  }

  function submit(formData: FormData) {
    setError(null)
    if (!product) { setError('Choose a product.'); return }
    if (!customer) { setError('Choose a customer.'); return }

    startTransition(async () => {
      const result = await savePricingRule({
        distributor_id: customerType === 'DISTRIBUTOR' ? customer.id : undefined,
        chemist_id:     customerType === 'CHEMIST' ? customer.id : undefined,
        doctor_id:      customerType === 'DOCTOR' ? customer.id : undefined,
        customer_type: customerType,
        product_id: product.id,
        calculation_basis: basis,
        calculation_method: method,
        percentage: method === 'FIXED_PRICE' ? undefined : (percentage || undefined),
        fixed_amount: method === 'FIXED_PRICE' ? (fixedAmount || undefined) : undefined,
        effective_from: String(formData.get('effective_from')),
        effective_to: String(formData.get('effective_to') || ''),
        notes: String(formData.get('notes') || ''),
      })
      if (result.ok) { setOpen(false); reset(); router.refresh() }
      else setError(result.error ?? 'Could not save the pricing rule.')
    })
  }

  return (
    <>
      <button
        type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-emerald-800"
      >
        <Plus size={15} /> New negotiated price
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} aria-hidden="true" />
          <div role="dialog" aria-modal="true" className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
              <h2 className="text-[14px] font-semibold text-gray-900">Negotiated price</h2>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close"><X size={17} /></button>
            </div>

            <form action={submit} className="space-y-3.5 px-5 py-4">
              {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12.5px] text-red-800">{error}</div>}

              <div>
                <label className="mb-1 block text-[12px] font-medium text-gray-700">Customer type</label>
                <select
                  value={customerType}
                  onChange={e => { setCustomerType(e.target.value as BillingCustomerType); setCustomer(null); setCustomerTerm('') }}
                  className={inputClass}
                >
                  {BILLING_CUSTOMER_TYPES.map(t => <option key={t} value={t}>{CUSTOMER_TYPE_LABELS[t]}</option>)}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[12px] font-medium text-gray-700">Customer</label>
                {customer ? (
                  <div className="flex items-center justify-between rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2">
                    <span className="text-[13px] font-medium text-emerald-900">{customer.name}</span>
                    <button type="button" onClick={() => setCustomer(null)} className="text-emerald-700 hover:text-emerald-900"><X size={14} /></button>
                  </div>
                ) : (
                  <>
                    <input value={customerTerm} onChange={e => setCustomerTerm(e.target.value)} placeholder="Search…" className={inputClass} />
                    {customerResults.length > 0 && (
                      <ul className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-gray-200">
                        {customerResults.map(c => (
                          <li key={c.id}><button type="button" onClick={() => setCustomer(c)} className="block w-full px-3 py-2 text-left text-[13px] hover:bg-gray-50">{c.name}</button></li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>

              <div>
                <label className="mb-1 block text-[12px] font-medium text-gray-700">Product</label>
                {product ? (
                  <div className="flex items-center justify-between rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2">
                    <span className="text-[13px] font-medium text-emerald-900">{product.product_name}</span>
                    <button type="button" onClick={() => setProduct(null)} className="text-emerald-700 hover:text-emerald-900"><X size={14} /></button>
                  </div>
                ) : (
                  <>
                    <input value={productTerm} onChange={e => setProductTerm(e.target.value)} placeholder="Search…" className={inputClass} />
                    {productResults.length > 0 && (
                      <ul className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-gray-200">
                        {productResults.map(p => (
                          <li key={p.id}><button type="button" onClick={() => setProduct(p)} className="block w-full px-3 py-2 text-left text-[13px] hover:bg-gray-50">{p.product_name}</button></li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-gray-700">Calculation basis</label>
                  <select value={basis} onChange={e => setBasis(e.target.value as typeof basis)} className={inputClass}>
                    {CALCULATION_BASES.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-gray-700">Calculation method</label>
                  <select value={method} onChange={e => setMethod(e.target.value as typeof method)} className={inputClass}>
                    {CALCULATION_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>

              {method === 'FIXED_PRICE' ? (
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-gray-700">Fixed amount (₹)</label>
                  <input type="number" min="0" step="0.01" value={fixedAmount} onChange={e => setFixedAmount(e.target.value)} className={inputClass} />
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-gray-700">Percentage</label>
                  <input type="number" min="0" max="100" step="0.01" value={percentage} onChange={e => setPercentage(e.target.value)} className={inputClass} />
                </div>
              )}

              {preview !== null && product && (
                <p className="text-[11.5px] text-gray-500">
                  Works out to <strong className="text-gray-700">₹{preview.toFixed(2)}</strong>
                  {' '}(≈ ₹{priceInclGst(preview, product.gst_rate).toFixed(2)} incl. {product.gst_rate}% GST)
                </p>
              )}
              {basis === 'COST' && (
                <p className="text-[11.5px] text-gray-500">
                  COST has no single preview — it&apos;s whichever batch&apos;s actual purchase rate is on hand at sale time.
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-gray-700">Effective from</label>
                  <input name="effective_from" type="date" required defaultValue={isoDate()} className={inputClass} />
                </div>
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-gray-700">Effective to (optional)</label>
                  <input name="effective_to" type="date" className={inputClass} />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[12px] font-medium text-gray-700">Notes</label>
                <textarea name="notes" rows={2} className={inputClass} />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-[12.5px] font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={pending} className="flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
                  {pending && <Loader2 size={13} className="animate-spin" />} Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
