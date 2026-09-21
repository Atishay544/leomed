import 'server-only'
import { erpDb, rangeFor, toPage, type PageResult } from './query'
import type { DetectedTravelArea, ErpMrTravelAllowance, TravelAllowanceStatus } from '../types'

/**
 * MR travel allowance — admin/HR's review queue for the daily auto-computed
 * amounts (erp_compute_daily_travel_allowance), plus an MR's own read-only
 * view of their own history.
 */

export interface TravelAllowanceRow extends ErpMrTravelAllowance {
  mr_name: string
  mr_code: string | null
}

export interface TravelAllowanceListParams {
  page?: number
  status?: TravelAllowanceStatus | 'ALL'
  mrId?: string
  from?: string
  to?: string
}

function mapRow(row: Record<string, unknown>): TravelAllowanceRow {
  const { erp_users, ...rest } = row as Record<string, unknown> & {
    erp_users: { name: string; mr_code: string | null } | null
  }
  return {
    ...(rest as unknown as ErpMrTravelAllowance),
    detected_areas: (rest.detected_areas ?? []) as DetectedTravelArea[],
    mr_name: erp_users?.name ?? '—',
    mr_code: erp_users?.mr_code ?? null,
  }
}

/** Admin/HR's review list — every MR, filterable by status/date/MR. */
export async function listTravelAllowance(params: TravelAllowanceListParams = {}): Promise<PageResult<TravelAllowanceRow>> {
  const db = await erpDb()
  const page = params.page ?? 1
  const [from, to] = rangeFor(page)

  let query = db
    .from('erp_mr_travel_allowance')
    // erp_mr_travel_allowance has two FKs to erp_users (mr_id, reviewed_by)
    // — an unqualified erp_users(...) embed would be ambiguous, same fix as
    // Territories/Areas needed.
    .select('*, erp_users!erp_mr_travel_allowance_mr_id_fkey(name, mr_code)', { count: 'exact' })
    .order('allowance_date', { ascending: false })
    .range(from, to)

  if (params.status && params.status !== 'ALL') query = query.eq('status', params.status)
  if (params.mrId) query = query.eq('mr_id', params.mrId)
  if (params.from) query = query.gte('allowance_date', params.from)
  if (params.to) query = query.lte('allowance_date', params.to)

  const { data, count, error } = await query
  if (error) console.error('[erp] listTravelAllowance failed', error.message)
  return toPage<TravelAllowanceRow>((data ?? []).map(mapRow), count, page)
}

export async function countPendingTravelAllowance(): Promise<number> {
  const db = await erpDb()
  const { count, error } = await db
    .from('erp_mr_travel_allowance')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'PENDING')
  if (error) console.error('[erp] countPendingTravelAllowance failed', error.message)
  return count ?? 0
}

/** An MR's own history — read-only, RLS already restricts this to their
 *  own rows regardless (see the migration), scoping here just avoids an
 *  unnecessary wide select. */
export async function listMyTravelAllowance(mrId: string, page = 1): Promise<PageResult<ErpMrTravelAllowance>> {
  const db = await erpDb()
  const [from, to] = rangeFor(page)
  const { data, count, error } = await db
    .from('erp_mr_travel_allowance')
    .select('*', { count: 'exact' })
    .eq('mr_id', mrId)
    .order('allowance_date', { ascending: false })
    .range(from, to)
  if (error) console.error('[erp] listMyTravelAllowance failed', error.message)
  const rows = (data ?? []).map(r => ({ ...r, detected_areas: (r.detected_areas ?? []) as DetectedTravelArea[] }))
  return toPage<ErpMrTravelAllowance>(rows as ErpMrTravelAllowance[], count, page)
}
