'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ExternalLink, Loader2, Paperclip, X } from 'lucide-react'
import { submitOrderInvoice, reviewOrderInvoice } from '@/lib/erp/actions/visits'
import { money } from '@/lib/erp/format'
import type { OrderInvoiceStatus } from '@/lib/erp/types'

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-900 ' +
  'focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 focus:outline-none'

/**
 * Business value for a field order now comes from here, not from product
 * lines typed in at order time: the MR submits the real invoice's number,
 * amount and a photo once it exists (from the distributor or from Leomed
 * directly — same flow either way), and an admin can accept or reject it.
 * Rough by design — SUBMITTED is what "business generated" counts,
 * REJECTED is strictly excluded, until someone properly reconciles it at
 * incentive time.
 */
export default function OrderInvoicePanel({
  orderId, invoiceStatus, invoiceNumber, invoiceAmount, photoUrl, rejectionReason,
  canSubmit, canReview,
}: {
  orderId: string
  invoiceStatus: OrderInvoiceStatus
  invoiceNumber: string | null
  invoiceAmount: number | null
  photoUrl: string | null
  rejectionReason: string | null
  canSubmit: boolean
  canReview: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(invoiceStatus === 'PENDING')
  const [number, setNumber] = useState(invoiceNumber ?? '')
  const [amount, setAmount] = useState(invoiceAmount != null ? String(invoiceAmount) : '')
  const [uploadedPhotoUrl, setUploadedPhotoUrl] = useState(photoUrl ?? '')
  const [uploading, setUploading] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const fileInput = useRef<HTMLInputElement>(null)

  async function handleFile(file: File | undefined) {
    if (!file) return
    setUploading(true)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/erp/upload-order-invoice', { method: 'POST', body })
      const json = await res.json()
      if (res.ok) setUploadedPhotoUrl(json.url as string)
      else setError(json.error ?? 'Could not upload the photo.')
    } finally {
      setUploading(false)
    }
  }

  function submit() {
    setError(null)
    if (!number.trim()) return setError('Enter the invoice number.')
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) return setError('Enter the invoice amount.')

    startTransition(async () => {
      const result = await submitOrderInvoice({
        order_id: orderId, invoice_number: number, invoice_amount: value,
        photo_url: uploadedPhotoUrl || undefined,
      })
      if (result.ok) { setEditing(false); router.refresh() }
      else setError(result.error ?? 'Could not submit the invoice.')
    })
  }

  function review(status: 'SUBMITTED' | 'REJECTED') {
    if (status === 'REJECTED' && !reason.trim()) {
      setError('Enter a reason for rejecting this submission.')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await reviewOrderInvoice({ order_id: orderId, status, reason: reason || undefined })
      if (result.ok) { setReason(''); router.refresh() }
      else setError(result.error ?? 'Could not review this invoice.')
    })
  }

  return (
    <div className="space-y-3">
      {error && <p role="alert" className="text-[12.5px] text-red-700">{error}</p>}

      {invoiceStatus !== 'PENDING' && !editing && (
        <div className="space-y-2 text-[13px]">
          <div className="flex justify-between gap-3">
            <span className="text-gray-500">Invoice number</span>
            <span className="font-mono font-medium text-gray-900">{invoiceNumber}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-gray-500">Amount reported</span>
            <span className="font-semibold text-gray-900">{money(invoiceAmount ?? 0)}</span>
          </div>
          {photoUrl && (
            <a
              href={photoUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[12.5px] font-medium text-emerald-700 hover:underline"
            >
              <ExternalLink size={13} /> View invoice photo
            </a>
          )}
          {invoiceStatus === 'REJECTED' && rejectionReason && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-800">
              Rejected: {rejectionReason}
            </p>
          )}
        </div>
      )}

      {invoiceStatus === 'PENDING' && !canSubmit && (
        <p className="text-[13px] text-gray-500">The MR hasn&apos;t submitted invoice proof for this order yet.</p>
      )}

      {canSubmit && !editing && (
        <button
          type="button" onClick={() => setEditing(true)}
          className="text-[12.5px] font-medium text-emerald-700 hover:underline"
        >
          {invoiceStatus === 'PENDING' ? 'Submit invoice' : 'Edit submission'}
        </button>
      )}

      {canSubmit && editing && (
        <div className="space-y-2.5 rounded-lg border border-gray-200 p-3">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-gray-600">Invoice number</label>
            <input value={number} onChange={e => setNumber(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-gray-600">Amount (₹)</label>
            <input
              type="number" onFocus={e => e.target.select()} min="0.01" step="0.01"
              value={amount} onChange={e => setAmount(e.target.value)} className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-gray-600">Photo of the invoice</label>
            <input
              ref={fileInput} type="file" accept="image/*,application/pdf" className="hidden"
              onChange={e => handleFile(e.target.files?.[0])}
            />
            <button
              type="button" onClick={() => fileInput.current?.click()} disabled={uploading}
              className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-[12.5px]
                         font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
              {uploading ? 'Uploading…' : uploadedPhotoUrl ? 'Photo attached' : 'Attach photo'}
            </button>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button" onClick={submit} disabled={pending || uploading}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-[12.5px]
                         font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              {invoiceStatus === 'PENDING' ? 'Submit' : 'Resubmit'}
            </button>
            {invoiceStatus !== 'PENDING' && (
              <button type="button" onClick={() => setEditing(false)} disabled={pending}
                      className="text-[12.5px] font-medium text-gray-500 hover:text-gray-700">
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {canReview && invoiceStatus === 'SUBMITTED' && (
        <div className="space-y-2 border-t border-gray-100 pt-3">
          <label className="block text-[11px] font-medium text-gray-600">Reason (required to reject)</label>
          <input value={reason} onChange={e => setReason(e.target.value)} className={inputClass}
                 placeholder="Why this submission looks wrong…" />
          <button
            type="button" onClick={() => review('REJECTED')} disabled={pending}
            className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-[12px]
                       font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {pending ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
            Reject
          </button>
        </div>
      )}

      {canReview && invoiceStatus === 'REJECTED' && (
        <button
          type="button" onClick={() => review('SUBMITTED')} disabled={pending}
          className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-[12px]
                     font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
        >
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          Un-reject (mark submitted)
        </button>
      )}
    </div>
  )
}
