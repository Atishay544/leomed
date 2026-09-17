import 'server-only'
import { erpDb } from './query'
import type { Area, Territory } from '../types'

/**
 * Territories & areas — the geography hierarchy layered on top of (not
 * replacing) the free-text territory strings elsewhere in the app. See
 * the migration for why these are additive.
 */

export interface TerritoryRow extends Territory {
  distributor_name: string | null
  area_count: number
}

export async function listTerritories(includeInactive = false): Promise<TerritoryRow[]> {
  const db = await erpDb()
  let query = db
    .from('erp_territories')
    .select('*, erp_distributors(distributor_name)')
    .order('name', { ascending: true })
  if (!includeInactive) query = query.eq('active', true)

  const [{ data }, { data: areaRows }] = await Promise.all([
    query,
    db.from('erp_areas').select('territory_id'),
  ])

  const counts = new Map<string, number>()
  for (const a of areaRows ?? []) {
    counts.set(a.territory_id, (counts.get(a.territory_id) ?? 0) + 1)
  }

  return (data ?? []).map((row: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const { erp_distributors, ...rest } = row
    return {
      ...rest,
      distributor_name: erp_distributors?.distributor_name ?? null,
      area_count: counts.get(row.id) ?? 0,
    } as TerritoryRow
  })
}

export interface AreaRow extends Area {
  territory_name: string
  mr_name: string | null
}

export async function listAreas(params: { territoryId?: string; includeInactive?: boolean } = {}): Promise<AreaRow[]> {
  const db = await erpDb()
  let query = db
    .from('erp_areas')
    .select('*, erp_territories(name), erp_users(name)')
    .order('name', { ascending: true })
  if (!params.includeInactive) query = query.eq('active', true)
  if (params.territoryId) query = query.eq('territory_id', params.territoryId)

  const { data } = await query
  return (data ?? []).map((row: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const { erp_territories, erp_users, ...rest } = row
    return {
      ...rest,
      territory_name: erp_territories?.name ?? '—',
      mr_name: erp_users?.name ?? null,
    } as AreaRow
  })
}

/** Active MRs, for the Area form's "Assigned MR" dropdown — a short list,
 *  unpaginated is fine (matches listPotentialManagers() for offer letters). */
export async function listActiveMRs(): Promise<{ id: string; name: string }[]> {
  const db = await erpDb()
  const { data } = await db
    .from('erp_users')
    .select('id, name')
    .eq('active', true)
    .eq('role', 'MR')
    .order('name', { ascending: true })
  return (data ?? []) as { id: string; name: string }[]
}

/** Active distributors, for the Territory form's dropdown — listDistributors()
 *  is paginated at 25 for its own list screen, too small for "every
 *  distributor" here, so this queries unpaginated directly. */
export async function listActiveDistributorsForDropdown(): Promise<{ id: string; distributor_name: string }[]> {
  const db = await erpDb()
  const { data } = await db
    .from('erp_distributors')
    .select('id, distributor_name')
    .eq('active', true)
    .order('distributor_name', { ascending: true })
  return (data ?? []) as { id: string; distributor_name: string }[]
}
