'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Repeat } from 'lucide-react'
import type { ActionState } from '@/lib/erp/actions/shared'

interface Option { id: string; name: string }

/**
 * Bulk-moves every territory/area currently pointing at one MR (or
 * distributor) onto another — an MR leaving the company, or a distributor
 * being replaced, without hand-editing each territory and area whose
 * mr_id/distributor_id happened to be theirs.
 */
export default function ReassignPanel({
  title, description, fromLabel, toLabel, options, action, fromKey, toKey, followupOption,
}: {
  title: string
  description: string
  fromLabel: string
  toLabel: string
  options: Option[]
  action: (input: unknown) => Promise<ActionState>
  fromKey: string
  toKey: string
  /** MR reassignment only — offers to also move the outgoing MR's still-
   *  PENDING follow-ups over to the new one, since those don't follow
   *  geography on their own (they're tied to the MR, not the area). */
  followupOption?: boolean
}) {
  const router = useRouter()
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [moveFollowups, setMoveFollowups] = useState(true)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  function submit() {
    setError(null)
    setResult(null)
    if (!fromId || !toId) return setError('Choose both options.')
    if (fromId === toId) return setError('Choose two different options.')

    const fromName = options.find(o => o.id === fromId)?.name ?? fromId
    const toName = options.find(o => o.id === toId)?.name ?? toId
    const followupNote = followupOption && moveFollowups ? ' and their pending follow-ups' : ''
    if (!confirm(`Move every territory and area${followupNote} currently assigned to "${fromName}" over to "${toName}"?`)) return

    startTransition(async () => {
      const res = await action({
        [fromKey]: fromId,
        [toKey]: toId,
        ...(followupOption ? { move_pending_followups: moveFollowups } : {}),
      })
      if (res.ok) {
        const d = res.data as {
          territories_reassigned?: number; areas_reassigned?: number; followups_reassigned?: number
        } | undefined
        const followupsText = followupOption ? `, ${d?.followups_reassigned ?? 0} pending follow-ups` : ''
        setResult(`Reassigned ${d?.territories_reassigned ?? 0} territories, ${d?.areas_reassigned ?? 0} areas${followupsText}.`)
        setFromId('')
        setToId('')
        router.refresh()
      } else {
        setError(res.error ?? 'Could not reassign.')
      }
    })
  }

  const selectClass = 'w-full rounded-lg border border-gray-300 px-2.5 py-2 text-[13px] text-gray-900 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 focus:outline-none'

  return (
    <div className="mb-4 rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-[14px] font-semibold text-gray-900">{title}</h2>
      <p className="mt-0.5 text-[12px] text-gray-500">{description}</p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <label className="mb-1 block text-[12px] font-medium text-gray-700">{fromLabel}</label>
          <select value={fromId} onChange={e => setFromId(e.target.value)} className={selectClass}>
            <option value="">— Select —</option>
            {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-medium text-gray-700">{toLabel}</label>
          <select value={toId} onChange={e => setToId(e.target.value)} className={selectClass}>
            <option value="">— Select —</option>
            {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <button
          type="button" onClick={submit} disabled={pending}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60"
        >
          {pending && <Loader2 size={14} className="animate-spin" />}
          <Repeat size={14} /> Reassign
        </button>
      </div>
      {followupOption && (
        <label className="mt-3 flex items-center gap-2 text-[12.5px] text-gray-700">
          <input
            type="checkbox" checked={moveFollowups}
            onChange={e => setMoveFollowups(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300 text-emerald-700 focus:ring-emerald-600/20"
          />
          Also move their pending follow-ups (completed/cancelled ones stay as history)
        </label>
      )}
      {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
      {result && <p className="mt-2 text-[12px] text-emerald-700">{result}</p>}
    </div>
  )
}
