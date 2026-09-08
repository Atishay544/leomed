'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { addPayrollItem, deletePayrollItem } from '@/lib/erp/actions/payroll'
import { money } from '@/lib/erp/format'
import type { ErpPayrollItem, PayrollItemType } from '@/lib/erp/types'

const TYPE_LABELS: Record<PayrollItemType, string> = {
  INCENTIVE: 'Incentive',
  BONUS: 'Bonus',
  OTHER_EARNING: 'Other earning',
  DEDUCTION: 'Deduction',
}

export default function PayrollItemsPanel({
  recordId, items, editable,
}: {
  recordId: string
  items: ErpPayrollItem[]
  editable: boolean
}) {
  const router = useRouter()
  const [itemType, setItemType] = useState<PayrollItemType>('INCENTIVE')
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function add() {
    setError(null)
    startTransition(async () => {
      const result = await addPayrollItem({ record_id: recordId, item_type: itemType, label, amount: Number(amount) })
      if (result.ok) { setLabel(''); setAmount(''); router.refresh() }
      else setError(result.error ?? 'Could not add the item.')
    })
  }

  function remove(id: string) {
    setError(null)
    startTransition(async () => {
      const result = await deletePayrollItem(id)
      if (result.ok) router.refresh()
      else setError(result.error ?? 'Could not remove the item.')
    })
  }

  return (
    <div className="space-y-3">
      {error && <p role="alert" className="text-[12.5px] text-red-700">{error}</p>}

      {items.length === 0 ? (
        <p className="text-[13px] text-gray-500">No incentives, other earnings or deductions added yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map(item => (
            <li key={item.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
              <div>
                <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{TYPE_LABELS[item.item_type]}</span>
                <p className="text-[13px] text-gray-900">{item.label}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-[13px] font-semibold tabular-nums ${item.item_type === 'DEDUCTION' ? 'text-red-700' : 'text-emerald-700'}`}>
                  {item.item_type === 'DEDUCTION' ? '− ' : '+ '}{money(item.amount)}
                </span>
                {editable && (
                  <button type="button" onClick={() => remove(item.id)} disabled={pending}
                          className="rounded-lg p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50" aria-label="Remove">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg bg-gray-50 p-3">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-gray-600">Type</label>
            <select
              value={itemType} onChange={e => setItemType(e.target.value as PayrollItemType)}
              className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-[12.5px] focus:border-emerald-600 focus:outline-none"
            >
              {(Object.keys(TYPE_LABELS) as PayrollItemType[]).map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-[11px] font-medium text-gray-600">Label</label>
            <input
              value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Sales incentive"
              className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-[12.5px] focus:border-emerald-600 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-gray-600">Amount (₹)</label>
            <input
              type="number" onFocus={e => e.target.select()} min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
              className="w-28 rounded-lg border border-gray-300 px-2.5 py-1.5 text-[12.5px] focus:border-emerald-600 focus:outline-none"
            />
          </div>
          <button
            type="button" onClick={add} disabled={pending || !label.trim() || !amount}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-[12.5px] font-semibold
                       text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Add
          </button>
        </div>
      )}
    </div>
  )
}
