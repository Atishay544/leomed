import { Megaphone } from 'lucide-react'
import {
  ACTIVITY_STATUS_LABELS, ACTIVITY_STATUS_STYLES, ACTIVITY_TYPE_LABELS, formatDate, money,
} from '@/lib/erp/format'
import type { ActivityRequestRow } from '@/lib/erp/types'
import { Badge, EmptyState, TableWrap, Td, Th } from '../ui'
import ActivityReviewButtons from './ActivityReviewButtons'
import ApprovalTrail from './ApprovalTrail'
import CancelActivityButton from './CancelActivityButton'

/**
 * One table for all three activity screens.
 *   mine      — the requester's own requests, with Cancel while pending
 *   approvals — requests to decide; Approve/Reject on the ones waiting on you
 *   records   — read-only (the approved record kept against a doctor/chemist)
 */
export default function ActivityTable({
  rows, mode, viewerId, viewerIsAdmin = false, emptyTitle, emptyDescription,
}: {
  rows: ActivityRequestRow[]
  mode: 'mine' | 'approvals' | 'records'
  viewerId: string
  viewerIsAdmin?: boolean
  emptyTitle: string
  emptyDescription?: string
}) {
  if (rows.length === 0) {
    return <EmptyState icon={Megaphone} title={emptyTitle} description={emptyDescription} />
  }

  const showRequester = mode !== 'mine'
  const showAction = mode !== 'records'

  return (
    <TableWrap>
      <table className="w-full min-w-[980px]">
        <thead className="bg-gray-50">
          <tr>
            <Th>Raised</Th>
            {showRequester && <Th>By</Th>}
            <Th>For</Th>
            <Th>Activity</Th>
            <Th align="right">Budget</Th>
            <Th>Status</Th>
            <Th>Approval trail</Th>
            {showAction && <Th align="right">Action</Th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map(r => {
            // Final only when an admin is the one acting — a non-admin's
            // approval just forwards it up the chain.
            const canDecide = r.status === 'PENDING' && (viewerIsAdmin || r.current_approver_id === viewerId)
            return (
              <tr key={r.id} className="align-top">
                <Td className="whitespace-nowrap">
                  {formatDate(r.created_at)}
                  {r.planned_date && (
                    <p className="mt-0.5 text-[11.5px] text-gray-400">for {formatDate(r.planned_date)}</p>
                  )}
                </Td>
                {showRequester && <Td className="font-medium text-gray-900">{r.requester_name}</Td>}
                <Td>
                  <span className="font-medium text-gray-900">{r.target_name}</span>
                  <p className="mt-0.5 text-[11.5px] text-gray-400">
                    {r.target_type === 'DOCTOR' ? 'Doctor' : 'Chemist'}
                  </p>
                </Td>
                <Td className="max-w-[240px]">
                  <span className="font-medium text-gray-900">{ACTIVITY_TYPE_LABELS[r.activity_type]}</span>
                  {r.description && (
                    <p className="mt-0.5 line-clamp-3 text-[11.5px] text-gray-500">{r.description}</p>
                  )}
                </Td>
                <Td align="right" className="whitespace-nowrap tabular-nums">{money(r.budget)}</Td>
                <Td>
                  <Badge className={ACTIVITY_STATUS_STYLES[r.status]}>{ACTIVITY_STATUS_LABELS[r.status]}</Badge>
                  {r.status === 'PENDING' && (
                    <p className="mt-1 text-[11.5px] text-gray-500">Awaiting {r.awaiting_name ?? 'Administrator'}</p>
                  )}
                </Td>
                <Td className="min-w-[220px]"><ApprovalTrail steps={r.erp_activity_request_steps} /></Td>
                {showAction && (
                  <Td align="right">
                    {mode === 'mine' && r.status === 'PENDING' && r.requester_id === viewerId && (
                      <CancelActivityButton id={r.id} />
                    )}
                    {mode === 'approvals' && canDecide && (
                      <ActivityReviewButtons id={r.id} finalApproval={viewerIsAdmin} />
                    )}
                  </Td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </TableWrap>
  )
}
