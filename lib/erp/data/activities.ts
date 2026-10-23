import 'server-only'
import { erpDb, rangeFor, toPage, type PageResult } from './query'
import type { ActivityRequestRow, ActivityStatus } from '../types'

/**
 * Activity requests. Visibility is entirely the table's own RLS (requester,
 * current approver, admin, anyone above the requester in the reporting
 * chain) — these helpers only narrow, they never widen.
 */

const SELECT = '*, erp_activity_request_steps(id, request_id, actor_id, actor_name, action, remarks, created_at)'

export interface ActivityListParams {
  page?: number
  status?: ActivityStatus | 'ALL'
  /** Only requests raised by this employee. */
  requesterId?: string
  /** Only PENDING requests currently waiting on this employee. */
  approverId?: string
  /** Admin's queue: every PENDING request regardless of who it's waiting on. */
  pendingOnly?: boolean
  /** Already-decided requests only (approved, rejected, cancelled). */
  decidedOnly?: boolean
  /** Leave out requests this employee raised themselves. */
  excludeRequesterId?: string
  targetType?: 'DOCTOR' | 'CHEMIST'
  doctorId?: string
  chemistId?: string
  q?: string
  /** Newest decision first (the Approved Activities record) vs newest request first. */
  orderBy?: 'created_at' | 'decided_at'
}

export async function listActivityRequests(params: ActivityListParams = {}): Promise<PageResult<ActivityRequestRow>> {
  const db = await erpDb()
  const page = params.page ?? 1
  const [from, to] = rangeFor(page)

  let query = db
    .from('erp_activity_requests')
    .select(SELECT, { count: 'exact' })
    .order(params.orderBy ?? 'created_at', { ascending: false })
    .range(from, to)

  if (params.status && params.status !== 'ALL') query = query.eq('status', params.status)
  if (params.requesterId) query = query.eq('requester_id', params.requesterId)
  if (params.approverId) query = query.eq('current_approver_id', params.approverId).eq('status', 'PENDING')
  if (params.pendingOnly) query = query.eq('status', 'PENDING')
  if (params.decidedOnly) query = query.neq('status', 'PENDING')
  if (params.excludeRequesterId) query = query.neq('requester_id', params.excludeRequesterId)
  if (params.targetType) query = query.eq('target_type', params.targetType)
  if (params.doctorId) query = query.eq('doctor_id', params.doctorId)
  if (params.chemistId) query = query.eq('chemist_id', params.chemistId)
  if (params.q) {
    const term = params.q.trim().replace(/[,()%_*\\"']/g, ' ').replace(/\s+/g, ' ').trim()
    if (term.length >= 2) query = query.or(`target_name.ilike.%${term}%,requester_name.ilike.%${term}%`)
  }

  const { data, count, error } = await query
  if (error) console.error('[erp] listActivityRequests failed', error.message)
  const result = toPage<ActivityRequestRow>(data as unknown as ActivityRequestRow[] | null, count, page)
  for (const r of result.rows) {
    r.erp_activity_request_steps = [...(r.erp_activity_request_steps ?? [])]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
  }
  return result
}

/** How many PENDING requests are waiting on this person (admin: all pending). */
export async function countActivitiesAwaiting(employeeId: string, isAdmin: boolean): Promise<number> {
  const db = await erpDb()
  let query = db
    .from('erp_activity_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'PENDING')
  if (!isAdmin) query = query.eq('current_approver_id', employeeId)
  const { count } = await query
  return count ?? 0
}
