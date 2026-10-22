import 'server-only'
import { erpDb, rangeFor, safeSearch, ilikeAny, toPage, type PageResult } from './query'
import type { ErpUser } from '../types'

export interface StaffListRow extends ErpUser {
  reports_to_name: string | null
}

/** RLS decides visibility here: an MR reading this table sees only their own
 *  row, an admin sees everyone. No extra filtering is needed in the query.
 *
 *  Deliberately two queries, not one with an embedded
 *  erp_users!erp_users_reports_to_fkey(name) self-join: erp_users embedding
 *  itself through a column that's also subject to erp_users' own RLS policy
 *  made PostgREST treat the embed as effectively required, so any row whose
 *  reports_to didn't resolve under RLS — including a top-level admin with no
 *  manager at all — silently vanished from the result instead of just
 *  getting a null reports_to_name. Found when an admin with exactly one
 *  erp_users row (reports_to null) saw zero rows on the Staff page despite
 *  the row existing and RLS allowing it under a direct, non-embedded query. */
export async function listErpUsers(params: {
  q?: string
  page?: number
  role?: string
  includeInactive?: boolean
} = {}): Promise<PageResult<StaffListRow>> {
  const db = await erpDb()
  const page = params.page ?? 1
  const [from, to] = rangeFor(page)

  let query = db
    .from('erp_users')
    .select('*', { count: 'exact' })
    .order('name', { ascending: true })
    .range(from, to)

  if (!params.includeInactive) query = query.eq('active', true)
  if (params.role && params.role !== 'ALL') query = query.eq('role', params.role)

  const term = safeSearch(params.q)
  if (term) query = query.or(ilikeAny(['name', 'email', 'mr_code', 'territory'], term))

  const { data, error, count } = await query
  if (error) console.error('[erp] listErpUsers failed', error.message)
  const erpUsers = (data ?? []) as unknown as ErpUser[]

  const managerIds = [...new Set(erpUsers.map(u => u.reports_to).filter((id): id is string => !!id))]
  const managerNames = new Map<string, string>()
  if (managerIds.length > 0) {
    const { data: managers, error: managerError } = await db
      .from('erp_users')
      .select('id, name')
      .in('id', managerIds)
    if (managerError) console.error('[erp] listErpUsers manager lookup failed', managerError.message)
    for (const m of (managers ?? []) as { id: string; name: string }[]) managerNames.set(m.id, m.name)
  }

  const rows = erpUsers.map(u => ({
    ...u,
    reports_to_name: u.reports_to ? (managerNames.get(u.reports_to) ?? null) : null,
  }))
  return toPage<StaffListRow>(rows, count, page)
}

/** One employee's own directory row — RLS returns null if the caller may not
 *  see it (an MR reading someone else's id, say), which callers must handle
 *  as "not found" rather than assuming the row exists. */
export async function getErpUserById(id: string): Promise<ErpUser | null> {
  const db = await erpDb()
  const { data } = await db.from('erp_users').select('*').eq('id', id).maybeSingle()
  return (data as ErpUser | null) ?? null
}

export interface MrOption {
  id: string
  name: string
  mr_code: string | null
  territory: string | null
}

/** MRs for filter dropdowns and target assignment. Returns [] for a user whose
 *  RLS policy hides other staff, which is the correct outcome — their screens
 *  simply show no MR filter. */
export async function listMrs(): Promise<MrOption[]> {
  const db = await erpDb()
  const { data } = await db
    .from('erp_users')
    .select('id, name, mr_code, territory')
    .eq('role', 'MR')
    .eq('active', true)
    .order('mr_code', { ascending: true })
    .limit(300)

  return (data ?? []) as unknown as MrOption[]
}
