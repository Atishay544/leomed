'use client'

import { useActionState, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Loader2, Paperclip } from 'lucide-react'
import { submitExpense } from '@/lib/erp/actions/expenses'
import { IDLE } from '@/lib/erp/actions/shared'
import { EXPENSE_CATEGORY_LABELS, isoDate } from '@/lib/erp/format'
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from '@/lib/erp/types'

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-900 ' +
  'focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 focus:outline-none'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit" disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-[13px]
                 font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
    >
      {pending && <Loader2 size={14} className="animate-spin" />}
      {pending ? 'Submitting…' : 'Submit expense'}
    </button>
  )
}

export default function ExpenseForm() {
  const [state, formAction] = useActionState(submitExpense, IDLE)
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

  return (
    <form action={formAction} className="space-y-3.5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      {state.error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12.5px] text-red-800">{state.error}</div>
      )}
      {state.ok && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[12.5px] text-emerald-800">Expense submitted.</div>
      )}

      <input type="hidden" name="receipt_url" value={receiptUrl} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="expense_date" className="mb-1 block text-[12px] font-medium text-gray-700">Date</label>
          <input id="expense_date" name="expense_date" type="date" required defaultValue={isoDate()} max={isoDate()} className={inputClass} />
        </div>
        <div>
          <label htmlFor="category" className="mb-1 block text-[12px] font-medium text-gray-700">Category</label>
          <select id="category" name="category" required className={inputClass}>
            {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="amount" className="mb-1 block text-[12px] font-medium text-gray-700">Amount (₹)</label>
          <input id="amount" name="amount" type="number" min="0.01" step="0.01" required className={inputClass} />
        </div>
        <div>
          <label htmlFor="payment_mode" className="mb-1 block text-[12px] font-medium text-gray-700">Payment mode</label>
          <select id="payment_mode" name="payment_mode" required defaultValue="CASH" className={inputClass}>
            {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="vendor_name" className="mb-1 block text-[12px] font-medium text-gray-700">Vendor / paid to (optional)</label>
          <input id="vendor_name" name="vendor_name" className={inputClass} placeholder="e.g. Indian Oil, XYZ Ad Agency" />
        </div>
      </div>

      <div>
        <label htmlFor="description" className="mb-1 block text-[12px] font-medium text-gray-700">Description</label>
        <textarea id="description" name="description" rows={2} className={inputClass} placeholder="What was this for?" />
      </div>

      <div>
        <label className="mb-1 block text-[12px] font-medium text-gray-700">Receipt (optional)</label>
        <input
          ref={fileInput} type="file" accept="image/*,application/pdf" className="hidden"
          onChange={e => handleFile(e.target.files?.[0])}
        />
        <button
          type="button" onClick={() => fileInput.current?.click()} disabled={uploading}
          className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-[13px]
                     font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          {uploading ? <Loader2 size={15} className="animate-spin" /> : <Paperclip size={15} />}
          {uploading ? 'Uploading…' : receiptUrl ? 'Receipt attached' : 'Attach receipt'}
        </button>
      </div>

      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  )
}
