'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import type { InvoiceOrder } from '@/lib/invoice'

export default function InvoiceDownload({ order }: { order: InvoiceOrder }) {
  const [loading, setLoading] = useState(false)

  async function handleDownload() {
    setLoading(true)
    try {
      const { downloadInvoicePDF } = await import('@/lib/invoice')
      await downloadInvoicePDF(order)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className="flex items-center gap-2 text-sm text-gray-600 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition disabled:opacity-50"
    >
      <Download size={14} />
      {loading ? 'Generating…' : 'Download Invoice'}
    </button>
  )
}
