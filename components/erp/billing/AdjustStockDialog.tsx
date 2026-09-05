'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Loader2, SlidersHorizontal, X } from 'lucide-react'
import ProductPicker from '../visits/ProductPicker'
import { lookupAllBatches, type ProductOption } from '@/lib/erp/actions/lookup'
import { adjustInventory } from '@/lib/erp/actions/billing'
import { INVENTORY_TXN_LABELS, formatDate, isoDate, qty } from '@/lib/erp/format'
import { MANUAL_TXN_TYPES, type ManualTxnType } from '@/lib/erp/types'

/**
 * Manual stock movement.
 *
 * Quantity is always entered as a positive number; the direction comes from
 * the transaction type, so an "adjustment in" cannot silently remove stock. A
 * reason is required — an unexplained movement is unauditable, and the table's
 * CHECK constraint refuses one anyway (spec §16).
 *
 * Nothing here overwrites a stock figure. Every adjustment is a new ledger row.
 */

interface BatchOption {
  id: string
  batch_number: string
  expiry_date: string
  current_quantity: number
}

const OUTWARD: ManualTxnType[] = ['ADJUSTMENT_OUT', 'DAMAGE', 'EXPIRY', 'PURCHASE_RETURN']

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-900 ' +
  'focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 focus:outline-none'

export default function AdjustStockDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [product, setProduct] = useState<ProductOption | null>(null)
  const [batches, setBatches] = useState<BatchOption[]>([])
  const [loadingBatches, setLoadingBatches] = useState(false)
  const [batchId, setBatchId] = useState('')
  const [type, setType] = useState<ManualTxnType>('ADJUSTMENT_IN')
  const [quantity, setQuantity] = useState(1)
  const [remarks, setRemarks] = useState('')
  const [date, setDate] = useState(isoDate())
  const [error, setError] = useState<string | null>(null)
  const [pending, startSubmit] = useTransition()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open])

  const reset = () => {
    setProduct(null); setBatches([]); setBatchId(''); setQuantity(1)
    setRemarks(''); setType('ADJUSTMENT_IN'); setError(null)
  }

  async function pickProduct(picked: ProductOption) {
    setProduct(picked)
    setLoadingBatches(true)
    setBatchId('')
    const rows = (await lookupAllBatches(picked.id)) as unknown as BatchOption[]
    setBatches(rows)
    setBatchId(rows[0]?.id ?? '')
    setLoadingBatches(false)
  }

  const batch = batches.find(b => b.id === batchId)
  const isOutward = OUTWARD.includes(type)
  const wouldGoNegative = isOutward && batch ? quantity > batch.current_quantity : false

  function handleSubmit() {
    setError(null)
    if (!batchId)        return setError('Choose the batch to adjust.')
    if (quantity <= 0)   return setError('Enter how many units to adjust.')
    if (!remarks.trim()) return setError('A reason is required for every stock adjustment.')

    startSubmit(async () => {
      const result = await adjustInventory({
        batch_id: batchId,
        transaction_type: type,
        quantity,
        remarks: remarks.trim(),
        transaction_date: date,
      })
      if (result.ok) {
        setOpen(false)
        reset()
        router.refresh()
      } else {
        setError(result.error ?? 'Could not record the adjustment.')
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2
                   text-[13px] font-semibold text-white shadow-sm transition hover:bg-emerald-800"
      >
        <SlidersHorizontal size={15} /> Adjust stock
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-[2px]"
               onClick={() => setOpen(false)} aria-hidden="true" />

          <div role="dialog" aria-modal="true" aria-label="Adjust stock"
               className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl
                          bg-white shadow-xl sm:max-w-lg sm:rounded-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-3.5">
              <h2 className="text-[14px] font-semibold text-gray-900">Adjust stock</h2>
              <button type="button" onClick={() => setOpen(false)}
                      className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                      aria-label="Close">
                <X size={17} />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-5 py-4">
              {error && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5
                                             text-[12.5px] text-red-800">
                  {error}
                </div>
              )}

              <div>
                <label className="mb-1 block text-[12px] font-medium text-gray-700">Product</label>
                {product ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg border
                                  border-emerald-300 bg-emerald-50 px-3 py-2">
                    <span className="truncate text-[13px] font-medium text-emerald-900">
                      {product.product_name}
                      {product.strength && <span className="ml-1 font-normal">{product.strength}</span>}
                    </span>
                    <button type="button" onClick={reset}
                            className="shrink-0 rounded p-1 text-emerald-700 hover:bg-emerald-100"
                            aria-label="Change product">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <ProductPicker onPick={pickProduct} placeholder="Search the product to adjust…" />
                )}
              </div>

              {product && (
                <div>
                  <label htmlFor="adj_batch" className="mb-1 block text-[12px] font-medium text-gray-700">
                    Batch
                  </label>
                  {loadingBatches ? (
                    <p className="flex items-center gap-2 text-[12.5px] text-gray-500">
                      <Loader2 size={13} className="animate-spin" /> Loading batches…
                    </p>
                  ) : batches.length === 0 ? (
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
                      This product has no batches yet. Record a purchase, or create a batch first.
                    </p>
                  ) : (
                    <select id="adj_batch" value={batchId}
                            onChange={e => setBatchId(e.target.value)} className={inputClass}>
                      {batches.map(b => (
                        <option key={b.id} value={b.id}>
                          {b.batch_number} · exp {formatDate(b.expiry_date)} · {qty(b.current_quantity)} on hand
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="adj_type" className="mb-1 block text-[12px] font-medium text-gray-700">
                    Type
                  </label>
                  <select id="adj_type" value={type}
                          onChange={e => setType(e.target.value as ManualTxnType)} className={inputClass}>
                    {MANUAL_TXN_TYPES.map(t => (
                      <option key={t} value={t}>{INVENTORY_TXN_LABELS[t]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="adj_qty" className="mb-1 block text-[12px] font-medium text-gray-700">
                    Quantity
                  </label>
                  <input id="adj_qty" type="number" min={1} value={quantity}
                         onChange={e => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                         className={inputClass} />
                </div>
              </div>

              <p className="text-[11.5px] text-gray-500">
                {isOutward
                  ? `This will remove ${qty(quantity)} units from the batch.`
                  : `This will add ${qty(quantity)} units to the batch.`}
              </p>

              {wouldGoNegative && (
                <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                  <AlertTriangle size={14} className="mt-px shrink-0" />
                  The batch only holds {qty(batch!.current_quantity)}. Stock cannot go negative, so
                  this will be refused.
                </p>
              )}

              <div>
                <label htmlFor="adj_date" className="mb-1 block text-[12px] font-medium text-gray-700">
                  Date
                </label>
                <input id="adj_date" type="date" value={date} max={isoDate()}
                       onChange={e => setDate(e.target.value)} className={inputClass} />
              </div>

              <div>
                <label htmlFor="adj_reason" className="mb-1 block text-[12px] font-medium text-gray-700">
                  Reason <span className="text-red-500">*</span>
                </label>
                <textarea id="adj_reason" rows={2} value={remarks}
                          onChange={e => setRemarks(e.target.value)} className={inputClass}
                          placeholder="Physical count correction, breakage in transit, expired stock destroyed…" />
                <p className="mt-1 text-[11px] text-gray-400">
                  Recorded in the audit log against your name.
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-100
                            bg-gray-50 px-5 py-3">
              <button type="button" onClick={() => setOpen(false)}
                      className="rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-[13px]
                                 font-medium text-gray-700 transition hover:bg-gray-50">
                Cancel
              </button>
              <button type="button" onClick={handleSubmit} disabled={pending || !batchId}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2
                                 text-[13px] font-semibold text-white transition hover:bg-emerald-800
                                 disabled:cursor-not-allowed disabled:opacity-60">
                {pending && <Loader2 size={14} className="animate-spin" />}
                {pending ? 'Recording…' : 'Record adjustment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
