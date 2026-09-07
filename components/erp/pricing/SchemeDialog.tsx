'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, X } from 'lucide-react'
import { lookupBillingCustomers, lookupProducts, type BillingCustomerOption, type ProductOption } from '@/lib/erp/actions/lookup'
import { saveScheme } from '@/lib/erp/actions/pricing'
import { isoDate } from '@/lib/erp/format'
import { previewPrice, priceInclGst } from '@/lib/erp/pricing-preview'
import { BILLING_CUSTOMER_TYPES, CALCULATION_BASES, CALCULATION_METHODS } from '@/lib/erp/types'
import type { BillingCustomerType } from '@/lib/erp/types'

const CUSTOMER_TYPE_LABELS: Record<BillingCustomerType, string> = {
  DISTRIBUTOR: 'Distributor', CHEMIST: 'Retailer / Chemist', DOCTOR: 'Doctor (direct sale)',
}

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] focus:border-emerald-600 focus:outline-none'

interface Target extends BillingCustomerOption {
  type: BillingCustomerType
}

/**
 * Create a commercial scheme (spec §18, §48) — either a percentage-margin
 * override or a Buy-X-Get-Y free-quantity scheme. Targeting defaults to
 * "every customer of this type"; adding one or more specific customers
 * narrows it to only them (spec §23).
 */
export default function SchemeDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [schemeType, setSchemeType] = useState<'PERCENTAGE_MARGIN' | 'FREE_QUANTITY'>('FREE_QUANTITY')
  const [customerType, setCustomerType] = useState<BillingCustomerType | ''>('')

  const [productTerm, setProductTerm] = useState('')
  const [productResults, setProductResults] = useState<ProductOption[]>([])
  const [product, setProduct] = useState<ProductOption | null>(null)

  const [targetTerm, setTargetTerm] = useState('')
  const [targetResults, setTargetResults] = useState<BillingCustomerOption[]>([])
  const [targets, setTargets] = useState<Target[]>([])

  const [basis, setBasis] = useState<'MRP' | 'PTR' | 'PTS' | 'COST' | 'FIXED'>('MRP')
  const [method, setMethod] = useState<'MARGIN' | 'DISCOUNT' | 'MARKUP' | 'FIXED_PRICE'>('MARGIN')
  const [percentage, setPercentage] = useState('')
  const [buyQty, setBuyQty] = useState('')
  const [freeQty, setFreeQty] = useState('')
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
    if (!open || !customerType) return
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => setTargetResults(await lookupBillingCustomers(customerType, targetTerm)), 250)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [targetTerm, customerType, open])

  const preview = product && schemeType === 'PERCENTAGE_MARGIN'
    ? previewPrice(basis, method, parseFloat(percentage) || 0, 0, product.mrp, product.retailer_price)
    : null

  function reset() {
    setSchemeType('FREE_QUANTITY'); setCustomerType('')
    setProductTerm(''); setProductResults([]); setProduct(null)
    setTargetTerm(''); setTargetResults([]); setTargets([])
    setBasis('MRP'); setMethod('MARGIN'); setPercentage(''); setBuyQty(''); setFreeQty(''); setError(null)
  }

  function submit(formData: FormData) {
    setError(null)
    if (!product) { setError('Choose a product.'); return }

    startTransition(async () => {
      const result = await saveScheme({
        scheme_name: String(formData.get('scheme_name')),
        scheme_type: schemeType,
        product_id: product.id,
        customer_type: customerType || undefined,
        calculation_basis: schemeType === 'PERCENTAGE_MARGIN' ? basis : undefined,
        calculation_method: schemeType === 'PERCENTAGE_MARGIN' ? method : undefined,
        percentage: schemeType === 'PERCENTAGE_MARGIN' ? (percentage || undefined) : undefined,
        buy_quantity: schemeType === 'FREE_QUANTITY' ? (buyQty || undefined) : undefined,
        free_quantity: schemeType === 'FREE_QUANTITY' ? (freeQty || undefined) : undefined,
        effective_from: String(formData.get('effective_from')),
        effective_to: String(formData.get('effective_to') || ''),
        priority: String(formData.get('priority') || '100'),
        status: String(formData.get('status') || 'ACTIVE'),
        notes: String(formData.get('notes') || ''),
        customers: targets.map(t => ({
          distributor_id: t.type === 'DISTRIBUTOR' ? t.id : undefined,
          chemist_id:     t.type === 'CHEMIST' ? t.id : undefined,
          doctor_id:      t.type === 'DOCTOR' ? t.id : undefined,
        })),
      })
      if (result.ok) { setOpen(false); reset(); router.refresh() }
      else setError(result.error ?? 'Could not save the scheme.')
    })
  }

  return (
    <>
      <button
        type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-emerald-800"
      >
        <Plus size={15} /> New scheme
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} aria-hidden="true" />
          <div role="dialog" aria-modal="true" className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
              <h2 className="text-[14px] font-semibold text-gray-900">New scheme</h2>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close"><X size={17} /></button>
            </div>

            <form action={submit} className="space-y-3.5 px-5 py-4">
              {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12.5px] text-red-800">{error}</div>}

              <div>
                <label className="mb-1 block text-[12px] font-medium text-gray-700">Scheme name</label>
                <input name="scheme_name" required placeholder="e.g. Diwali Buy 10 Get 1" className={inputClass} />
              </div>

              <div>
                <label className="mb-1 block text-[12px] font-medium text-gray-700">Scheme type</label>
                <div className="flex gap-2">
                  {(['FREE_QUANTITY', 'PERCENTAGE_MARGIN'] as const).map(t => (
                    <button
                      key={t} type="button" onClick={() => setSchemeType(t)}
                      className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-medium ${schemeType === t ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-gray-300 text-gray-600'}`}
                    >
                      {t === 'FREE_QUANTITY' ? 'Free Quantity (Buy X Get Y)' : 'Percentage Margin'}
                    </button>
                  ))}
                </div>
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

              <div>
                <label className="mb-1 block text-[12px] font-medium text-gray-700">Customer type (optional — blank applies to all)</label>
                <select value={customerType} onChange={e => { setCustomerType(e.target.value as BillingCustomerType | ''); setTargets([]) }} className={inputClass}>
                  <option value="">All customer types</option>
                  {BILLING_CUSTOMER_TYPES.map(t => <option key={t} value={t}>{CUSTOMER_TYPE_LABELS[t]}</option>)}
                </select>
              </div>

              {customerType && (
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-gray-700">
                    Target specific customers (optional — blank applies to every {CUSTOMER_TYPE_LABELS[customerType]})
                  </label>
                  {targets.length > 0 && (
                    <ul className="mb-2 flex flex-wrap gap-1.5">
                      {targets.map(t => (
                        <li key={t.id} className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11.5px] text-emerald-800">
                          {t.name}
                          <button type="button" onClick={() => setTargets(rows => rows.filter(r => r.id !== t.id))}><X size={11} /></button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <input value={targetTerm} onChange={e => setTargetTerm(e.target.value)} placeholder="Search to add a specific customer…" className={inputClass} />
                  {targetResults.length > 0 && (
                    <ul className="mt-1 max-h-28 overflow-y-auto rounded-lg border border-gray-200">
                      {targetResults.filter(r => !targets.some(t => t.id === r.id)).map(c => (
                        <li key={c.id}>
                          <button type="button" onClick={() => { setTargets(rows => [...rows, { ...c, type: customerType }]); setTargetTerm('') }} className="block w-full px-3 py-2 text-left text-[13px] hover:bg-gray-50">{c.name}</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {schemeType === 'FREE_QUANTITY' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[12px] font-medium text-gray-700">Buy quantity</label>
                    <input type="number" min="1" value={buyQty} onChange={e => setBuyQty(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className="mb-1 block text-[12px] font-medium text-gray-700">Free quantity</label>
                    <input type="number" min="1" value={freeQty} onChange={e => setFreeQty(e.target.value)} className={inputClass} />
                  </div>
                </div>
              ) : (
                <>
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
                  <div>
                    <label className="mb-1 block text-[12px] font-medium text-gray-700">Percentage</label>
                    <input type="number" min="0" max="100" step="0.01" value={percentage} onChange={e => setPercentage(e.target.value)} className={inputClass} />
                  </div>
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
                </>
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-gray-700">Priority (lower wins ties)</label>
                  <input name="priority" type="number" defaultValue={100} className={inputClass} />
                </div>
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-gray-700">Status</label>
                  <select name="status" defaultValue="ACTIVE" className={inputClass}>
                    <option value="DRAFT">Draft</option>
                    <option value="ACTIVE">Active</option>
                  </select>
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
