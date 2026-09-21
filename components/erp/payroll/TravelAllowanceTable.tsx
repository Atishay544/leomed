'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { bulkApproveTravelAllowance, reviewTravelAllowance } from '@/lib/erp/actions/travel-allowance'
import { formatDate, money } from '@/lib/erp/format'
import type { TravelAllowanceStatus } from '@/lib/erp/types'
import type { TravelAllowanceRow } from '@/lib/erp/data/travel-allowance'
import { Badge, Td, Th } from '@/components/erp/ui'

const STATUS_STYLES: Record<TravelAllowanceStatus, string> = {
  PENDING:  'bg-amber-50 text-amber-700 ring-amber-600/20',
  APPROVED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  REJECTED: 'bg-red-50 text-red-600 ring-red-600/20',
}

/** One PENDING row: an editable amount (defaults to what was auto-computed)
 *  plus Approve/Reject — approving always sends whatever the input
 *  currently holds, rejecting ignores it and zeroes the row out server-side
 *  regardless (see reviewTravelAllowance). */
function ReviewRow({ row, onDone }: { row: TravelAllowanceRow; onDone: () => void }) {
  const [amount, setAmount] = useState(String(row.computed_amount))
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function submit(status: 'APPROVED' | 'REJECTED') {
    setError(null)
    startTransition(async () => {
      const result = await reviewTravelAllowance({
        id: row.id, status, approved_amount: status === 'APPROVED' ? Number(amount) || 0 : undefined,
      })
      if (result.ok) onDone()
      else setError(result.error ?? 'Could not update this row.')
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {error && <span className="text-[11px] text-red-600">{error}</span>}
      <div className="flex items-center gap-1.5">
        <input
          type="number" min="0" step="1" value={amount} onFocus={e => e.target.select()}
          onChange={e => setAmount(e.target.value)} disabled={pending}
          className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-[12.5px] text-gray-900
                     focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 focus:outline-none"
        />
        <button
          type="button" onClick={() => submit('APPROVED')} disabled={pending}
          className="rounded-lg bg-emerald-700 px-2.5 py-1 text-[11.5px] font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {pending ? <Loader2 size={12} className="animate-spin" /> : 'Approve'}
        </button>
        <button
          type="button" onClick={() => submit('REJECTED')} disabled={pending}
          className="rounded-lg border border-red-300 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </div>
  )
}

export default function TravelAllowanceTable({ rows }: { rows: TravelAllowanceRow[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkPending, startBulk] = useTransition()
  const [bulkError, setBulkError] = useState<string | null>(null)

  const pendingIds = rows.filter(r => r.status === 'PENDING').map(r => r.id)
  const allSelected = pendingIds.length > 0 && pendingIds.every(id => selected.has(id))

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(pendingIds))
  }

  function bulkApprove() {
    setBulkError(null)
    startBulk(async () => {
      const result = await bulkApproveTravelAllowance([...selected])
      if (result.ok) {
        setSelected(new Set())
        router.refresh()
      } else {
        setBulkError(result.error ?? 'Could not approve the selection.')
      }
    })
  }

  return (
    <div>
      {pendingIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-amber-50/50 px-4 py-2.5">
          <label className="flex items-center gap-2 text-[12.5px] text-gray-700">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-3.5 w-3.5 rounded border-gray-300" />
            Select all pending ({pendingIds.length})
          </label>
          <div className="flex items-center gap-2">
            {bulkError && <span className="text-[11px] text-red-600">{bulkError}</span>}
            <button
              type="button" onClick={bulkApprove} disabled={selected.size === 0 || bulkPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {bulkPending && <Loader2 size={12} className="animate-spin" />}
              Approve selected at computed amount ({selected.size})
            </button>
          </div>
        </div>
      )}

      <table className="w-full min-w-[900px]">
        <thead className="bg-gray-50">
          <tr>
            <Th></Th>
            <Th>Date</Th>
            <Th>MR</Th>
            <Th>Areas visited</Th>
            <Th align="right">Computed</Th>
            <Th>Status</Th>
            <Th align="right">Review</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map(row => (
            <tr key={row.id} className="hover:bg-gray-50/60">
              <Td>
                {row.status === 'PENDING' && (
                  <input
                    type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)}
                    className="h-3.5 w-3.5 rounded border-gray-300"
                  />
                )}
              </Td>
              <Td>{formatDate(row.allowance_date)}</Td>
              <Td>
                <span className="font-medium text-gray-900">{row.mr_name}</span>
                {row.mr_code && <span className="ml-1.5 font-mono text-[11px] text-gray-400">{row.mr_code}</span>}
              </Td>
              <Td className="max-w-[260px] text-[12px] text-gray-600">
                {row.detected_areas.length === 0
                  ? '—'
                  : row.detected_areas.map(a => `${a.area_name} (${money(a.rate)})`).join(', ')}
              </Td>
              <Td align="right" className="tabular-nums font-medium text-gray-900">{money(row.computed_amount)}</Td>
              <Td>
                <Badge className={STATUS_STYLES[row.status]}>{row.status}</Badge>
                {row.status !== 'PENDING' && row.approved_amount != null && (
                  <p className="mt-0.5 text-[11px] text-gray-400">
                    {row.status === 'APPROVED' ? `Approved at ${money(row.approved_amount)}` : 'Rejected'}
                  </p>
                )}
              </Td>
              <Td align="right">
                {row.status === 'PENDING'
                  ? <ReviewRow row={row} onDone={() => router.refresh()} />
                  : <span className="text-[11px] text-gray-400">—</span>}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
