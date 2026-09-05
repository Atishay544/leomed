import 'server-only'
import { erpDb, rangeFor, safeSearch, ilikeAny, toPage, type PageResult } from './query'
import type { ErpUser } from '../types'

/** RLS decides visibility here: an MR reading this table sees only their own
 *  row, an admin sees everyone. No extra filtering is needed in the query. */
export async function listErpUsers(params: {
  q?: string
  page?: number
  role?: string
  includeInactive?: boolean
} = {}): Promise<PageResult<ErpUser>> {
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

  const { data, count } = await query
  return toPage<ErpUser>(data as ErpUser[] | null, count, page)
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
