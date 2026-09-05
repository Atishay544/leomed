'use client'

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { setFieldOrderStatus } from '@/lib/erp/actions/visits'
import { FIELD_ORDER_STATUS_LABELS } from '@/lib/erp/format'
import { FIELD_ORDER_STATUSES, type FieldOrderStatus } from '@/lib/erp/types'

/**
 * Moves a field order through its demand-tracking statuses.
 *
 * Marking one FULFILLED records that the distributor network served it. It
 * does not create a sales invoice and does not deduct stock — those are
 * separate business events with their own screens (spec §26, §29).
 */
export default function FieldOrderStatusSelect({
  orderId, status,
}: {
  orderId: string
  status: FieldOrderStatus
}) {
  const [current, setCurrent] = useState(status)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const onChange = (next: FieldOrderStatus) => {
    const previous = current
    setCurrent(next)
    setError(null)

    startTransition(async () => {
      const result = await setFieldOrderStatus({ order_id: orderId, status: next })
      if (!result.ok) {
        // Put the control back where it was — the change did not happen.
        setCurrent(previous)
        setError(result.error ?? 'Could not update the status.')
      }
    })
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <select
          value={current}
          disabled={pending}
          onChange={e => onChange(e.target.value as FieldOrderStatus)}
          aria-label="Order status"
          className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-[12.5px]
                     text-gray-900 focus:border-emerald-600 focus:outline-none disabled:opacity-60"
        >
          {FIELD_ORDER_STATUSES.map(s => (
            <option key={s} value={s}>{FIELD_ORDER_STATUS_LABELS[s]}</option>
          ))}
        </select>
        {pending && <Loader2 size={14} className="animate-spin text-gray-400" />}
      </div>
      {error && <p className="mt-1 text-[11.5px] text-red-600">{error}</p>}
    </div>
  )
}
