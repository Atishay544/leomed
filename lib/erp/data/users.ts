import 'server-only'
import { erpDb, rangeFor, safeSearch, ilikeAny, toPage, type PageResult } from './query'
import type { ErpUser } from '../types'

export interface StaffListRow extends ErpUser {
  reports_to_name: string | null
}

/** RLS decides visibility here: an MR reading this table sees only their own
 *  row, an admin sees everyone. No extra filtering is needed in the query. */
export async function listErpUsers(params: {
  q?: string
  page?: number
  role?: string
  includeInactive?: boolean
} = {}): Promise<PageResult<StaffListRow>> {
  const db = await erpDb()
  const page = params.page ?? 1
  const [from, to] = rangeFor(page)

  // erp_users has more than one FK to itself (reports_to, created_by,
  // updated_by) — an unqualified erp_users(...) embed is ambiguous, same
  // fix as Territories/Areas/Offer letters needed.
  let query = db
    .from('erp_users')
    .select('*, reports_to_user:erp_users!erp_users_reports_to_fkey(name)', { count: 'exact' })
    .order('name', { ascending: true })
    .range(from, to)

  if (!params.includeInactive) query = query.eq('active', true)
  if (params.role && params.role !== 'ALL') query = query.eq('role', params.role)

  const term = safeSearch(params.q)
  if (term) query = query.or(ilikeAny(['name', 'email', 'mr_code', 'territory'], term))

  const { data, error, count } = await query
  if (error) console.error('[erp] listErpUsers failed', error.message)
  const rows = (data ?? []).map((row: Record<string, unknown>) => {
    const { reports_to_user, ...rest } = row as Record<string, unknown> & { reports_to_user: { name: string } | null }
    return { ...(rest as unknown as ErpUser), reports_to_name: reports_to_user?.name ?? null }
  })
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
