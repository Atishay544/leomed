'use client'

import { useState, useTransition } from 'react'
import { Download, Loader2, Mail } from 'lucide-react'
import { emailPayslip } from '@/lib/erp/actions/payroll'

export default function PayslipActions({ recordId }: { recordId: string }) {
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function sendEmail() {
    setError(null)
    setSent(false)
    startTransition(async () => {
      const result = await emailPayslip(recordId)
      if (result.ok) setSent(true)
      else setError(result.error ?? 'Could not send the email.')
    })
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      {error && <p role="alert" className="text-[11.5px] text-red-700">{error}</p>}
      {sent && <p className="text-[11.5px] text-emerald-700">Emailed.</p>}
      <div className="flex gap-2">
        <a
          href={`/api/erp/payslip/${recordId}`} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2
                     text-[12.5px] font-medium text-gray-700 hover:bg-gray-50"
        >
          <Download size={14} /> Download PDF
        </a>
        <button
          type="button" onClick={sendEmail} disabled={pending}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-[12.5px]
                     font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
          Send via email
        </button>
      </div>
    </div>
  )
}
