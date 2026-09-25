'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Paperclip, Plus, X } from 'lucide-react'
import { recordCompanyExpense } from '@/lib/erp/actions/expenses'
import { IDLE, type ActionState } from '@/lib/erp/actions/shared'
import { EXPENSE_CATEGORY_LABELS, isoDate } from '@/lib/erp/format'
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from '@/lib/erp/types'

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-900 ' +
  'focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 focus:outline-none'

/**
 * A company-level cost (rent, utilities, a subscription renewal...) that
 * admin/HR is recording directly — never an employee claim awaiting
 * approval. Same fields as the self-service ExpenseForm; the only real
 * difference is server-side (recordCompanyExpense inserts it already
 * APPROVED, self-approved by whoever's logging it).
 */
export default function CompanyExpenseDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<ActionState>(IDLE)
  const [pending, startTransition] = useTransition()
  const [receiptUrl, setReceiptUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  async function handleFile(file: File | undefined) {
    if (!file) return
    setUploading(true)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/erp/upload-expense-receipt', { method: 'POST', body })
      const json = await res.json()
      if (res.ok) setReceiptUrl(json.url as string)
    } finally {
      setUploading(false)
    }
  }

  function submit(formData: FormData) {
    setState(IDLE)
    startTransition(async () => {
      const result = await recordCompanyExpense(IDLE, formData)
      setState(result)
      if (result.ok) { setOpen(false); setReceiptUrl(''); router.refresh() }
    })
  }

  return (
    <>
      <button
        type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-emerald-800"
      >
        <Plus size={15} /> Record company expense
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} aria-hidden="true" />
          <div role="dialog" aria-modal="true" className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
              <h2 className="text-[14px] font-semibold text-gray-900">Record a company expense</h2>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close"><X size={17} /></button>
            </div>

            <form action={submit} className="space-y-3.5 px-5 py-4">
              <p className="rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-gray-500">
                For a company cost — rent, utilities, a subscription, anything the business itself is paying for —
                not an employee&apos;s own claim. This is recorded already approved, under your name as the person who logged it.
              </p>

              {state.error && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12.5px] text-red-800">{state.error}</div>
              )}

              <input type="hidden" name="receipt_url" value={receiptUrl} />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="ce_expense_date" className="mb-1 block text-[12px] font-medium text-gray-700">Date</label>
                  <input id="ce_expense_date" name="expense_date" type="date" required defaultValue={isoDate()} max={isoDate()} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="ce_category" className="mb-1 block text-[12px] font-medium text-gray-700">Category</label>
                  <select id="ce_category" name="category" required defaultValue="RENT" className={inputClass}>
                    {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c]}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="ce_amount" className="mb-1 block text-[12px] font-medium text-gray-700">Amount (₹)</label>
                  <input id="ce_amount" name="amount" type="number" onFocus={e => e.target.select()} min="0.01" step="0.01" required className={inputClass} />
                </div>
                <div>
                  <label htmlFor="ce_payment_mode" className="mb-1 block text-[12px] font-medium text-gray-700">Payment mode</label>
                  <select id="ce_payment_mode" name="payment_mode" required defaultValue="BANK_TRANSFER" className={inputClass}>
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="ce_vendor_name" className="mb-1 block text-[12px] font-medium text-gray-700">Vendor / paid to (optional)</label>
                  <input id="ce_vendor_name" name="vendor_name" className={inputClass} placeholder="e.g. Landlord, Electricity Board, AWS" />
                </div>
              </div>

              <div>
                <label htmlFor="ce_description" className="mb-1 block text-[12px] font-medium text-gray-700">Description</label>
                <textarea id="ce_description" name="description" rows={2} className={inputClass} placeholder="What was this for?" />
              </div>

              <div>
                <label className="mb-1 block text-[12px] font-medium text-gray-700">Receipt / invoice (optional)</label>
                <input
                  ref={fileInput} type="file" accept="image/*,application/pdf" className="hidden"
                  onChange={e => handleFile(e.target.files?.[0])}
                />
                <button
                  type="button" onClick={() => fileInput.current?.click()} disabled={uploading}
                  className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  {uploading ? <Loader2 size={15} className="animate-spin" /> : <Paperclip size={15} />}
                  {uploading ? 'Uploading…' : receiptUrl ? 'Receipt attached' : 'Attach receipt'}
                </button>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-[12.5px] font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={pending} className="flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
                  {pending && <Loader2 size={13} className="animate-spin" />} {pending ? 'Recording…' : 'Record expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
