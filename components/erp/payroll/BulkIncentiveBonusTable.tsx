'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save } from 'lucide-react'
import { addPayrollItem } from '@/lib/erp/actions/payroll'
import { money } from '@/lib/erp/format'
import { TableWrap, Td, Th } from '@/components/erp/ui'
import type { ErpPayrollRecord } from '@/lib/erp/types'
import type { IncentiveSuggestion } from '@/lib/erp/data/incentives'

const SUGGESTION_SOURCE_LABELS: Record<IncentiveSuggestion['source'], string> = {
  FLAT: 'flat rate', MR_TIER: 'this MR\'s bracket', DEFAULT_TIER: 'default bracket', NONE: 'no bracket configured',
}

interface RowState {
  incentiveAmount: string
  bonusAmount: string
  error: string | null
}

function emptyRow(): RowState {
  return { incentiveAmount: '', bonusAmount: '', error: null }
}

/**
 * One row per employee, an incentive amount and a bonus amount side by side —
 * each row saves independently since the amounts genuinely differ per
 * employee (spec: admin wants to set them per-MR, per-accountant, etc. from
 * one screen rather than opening each employee's payroll record).
 *
 * Both amounts on a row are added as separate erp_payroll_items via the same
 * addPayrollItem action the individual-record screen already uses — no new
 * write path, just a bulk-friendly presentation of the existing one.
 */
export default function BulkIncentiveBonusTable({
  records, editable, suggestions,
}: {
  records: ErpPayrollRecord[]
  editable: boolean
  /** Keyed by employee_id — only present for MRs, since secondary sales is
   *  a field-force concept. A suggestion never writes anything by itself;
   *  "Use" just copies it into the input, same as typing it by hand. */
  suggestions?: Map<string, IncentiveSuggestion>
}) {
  const router = useRouter()
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(records.map(r => [r.id, emptyRow()])))
  const [savingId, setSavingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function patch(id: string, next: Partial<RowState>) {
    setRows(prev => ({ ...prev, [id]: { ...prev[id], ...next } }))
  }

  function save(recordId: string) {
    const row = rows[recordId]
    const incentive = Number(row.incentiveAmount)
    const bonus = Number(row.bonusAmount)
    const hasIncentive = row.incentiveAmount.trim() !== '' && incentive > 0
    const hasBonus = row.bonusAmount.trim() !== '' && bonus > 0
    if (!hasIncentive && !hasBonus) {
      patch(recordId, { error: 'Enter an incentive or bonus amount above zero.' })
      return
    }

    patch(recordId, { error: null })
    setSavingId(recordId)

    startTransition(async () => {
      const results = await Promise.all([
        hasIncentive ? addPayrollItem({ record_id: recordId, item_type: 'INCENTIVE', label: 'Incentive', amount: incentive }) : null,
        hasBonus ? addPayrollItem({ record_id: recordId, item_type: 'BONUS', label: 'Bonus', amount: bonus }) : null,
      ])
      const failed = results.find(r => r && !r.ok)

      setSavingId(null)
      if (failed) {
        patch(recordId, { error: failed?.error ?? 'Could not save this row.' })
        return
      }
      patch(recordId, emptyRow())
      router.refresh()
    })
  }

  return (
    <TableWrap>
      <table className="w-full min-w-[760px]">
        <thead className="bg-gray-50">
          <tr>
            <Th>Employee</Th>
            <Th align="right">Incentive so far</Th>
            <Th align="right">Bonus so far</Th>
            <Th align="right">New incentive (₹)</Th>
            <Th align="right">New bonus (₹)</Th>
            <Th align="right">Save</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {records.map(r => {
            const row = rows[r.id]
            const saving = savingId === r.id
            const suggestion = suggestions?.get(r.employee_id)
            return (
              <tr key={r.id} className="hover:bg-gray-50/60 align-top">
                <Td>
                  <span className="font-medium text-gray-900">{r.employee_name}</span>
                  {r.department && <p className="text-[11px] text-gray-400">{r.department}</p>}
                  {row.error && <p className="mt-1 text-[11.5px] text-red-700">{row.error}</p>}
                </Td>
                <Td align="right" className="tabular-nums">{r.incentives > 0 ? money(r.incentives) : '—'}</Td>
                <Td align="right" className="tabular-nums">{r.bonus > 0 ? money(r.bonus) : '—'}</Td>
                <Td align="right">
                  <input
                    type="number" onFocus={e => e.target.select()} min="0" step="0.01" placeholder="0.00"
                    value={row.incentiveAmount}
                    onChange={e => patch(r.id, { incentiveAmount: e.target.value })}
                    disabled={!editable || saving}
                    className="w-28 rounded-lg border border-gray-300 px-2.5 py-1.5 text-[12.5px] text-right
                               focus:border-emerald-600 focus:outline-none disabled:bg-gray-100"
                  />
                  {suggestion && suggestion.incentive_amount > 0 && (
                    <p className="mt-1 max-w-[160px] text-[10.5px] leading-snug text-gray-400">
                      {money(suggestion.secondary_sales)} sales × {suggestion.percentage}%
                      ({SUGGESTION_SOURCE_LABELS[suggestion.source]}) ={' '}
                      <button
                        type="button" disabled={!editable || saving}
                        onClick={() => patch(r.id, { incentiveAmount: String(suggestion.incentive_amount) })}
                        className="font-semibold text-emerald-700 underline decoration-dotted hover:text-emerald-800 disabled:no-underline disabled:text-gray-400"
                      >
                        {money(suggestion.incentive_amount)}
                      </button>
                    </p>
                  )}
                </Td>
                <Td align="right">
                  <input
                    type="number" onFocus={e => e.target.select()} min="0" step="0.01" placeholder="0.00"
                    value={row.bonusAmount}
                    onChange={e => patch(r.id, { bonusAmount: e.target.value })}
                    disabled={!editable || saving}
                    className="w-28 rounded-lg border border-gray-300 px-2.5 py-1.5 text-[12.5px] text-right
                               focus:border-emerald-600 focus:outline-none disabled:bg-gray-100"
                  />
                </Td>
                <Td align="right">
                  <button
                    type="button" onClick={() => save(r.id)} disabled={!editable || saving}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-[12.5px]
                               font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                    Save
                  </button>
                </Td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </TableWrap>
  )
}
