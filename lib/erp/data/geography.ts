import 'server-only'
import { erpDb } from './query'
import type { Area, Territory } from '../types'

/**
 * Territories & areas — the geography hierarchy layered on top of (not
 * replacing) the free-text territory strings elsewhere in the app. See
 * the migrations for why these are additive.
 *
 * MR and distributor can each be set at the territory level (a default for
 * everything under it) and overridden per-area — an area's own value, when
 * set, wins; when null, it "follows" the territory. Every list function
 * here resolves and exposes both the raw and the effective value.
 */

export interface TerritoryRow extends Territory {
  distributor_name: string | null
  mr_name: string | null
  area_count: number
}

export async function listTerritories(includeInactive = false): Promise<TerritoryRow[]> {
  const db = await erpDb()
  let query = db
    .from('erp_territories')
    .select('*, erp_distributors(distributor_name), erp_users(name)')
    .order('name', { ascending: true })
  if (!includeInactive) query = query.eq('active', true)

  const [{ data, error }, { data: areaRows }] = await Promise.all([
    query,
    db.from('erp_areas').select('territory_id'),
  ])
  // A query error here (e.g. a pending migration not yet run, so a joined
  // column/relationship doesn't exist yet) must not look identical to "no
  // territories exist" — that silent difference is exactly what made a real
  // territory disappear from both this list and the Areas form's dropdown
  // without any visible error.
  if (error) console.error('[erp] listTerritories failed', error.message)

  const counts = new Map<string, number>()
  for (const a of areaRows ?? []) {
    counts.set(a.territory_id, (counts.get(a.territory_id) ?? 0) + 1)
  }

  return (data ?? []).map((row: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const { erp_distributors, erp_users, ...rest } = row
    return {
      ...rest,
      distributor_name: erp_distributors?.distributor_name ?? null,
      mr_name: erp_users?.name ?? null,
      area_count: counts.get(row.id) ?? 0,
    } as TerritoryRow
  })
}

export interface AreaRow extends Area {
  territory_name: string
  /** This area's own override, if one was set (independent of the
   *  territory's default). */
  mr_name: string | null
  distributor_name: string | null
  /** What actually applies to this area once the territory's default is
   *  folded in — this area's own value if set, else the territory's. */
  effective_mr_id: string | null
  effective_mr_name: string | null
  effective_distributor_id: string | null
  effective_distributor_name: string | null
}

export async function listAreas(params: { territoryId?: string; includeInactive?: boolean } = {}): Promise<AreaRow[]> {
  const db = await erpDb()
  let query = db
    .from('erp_areas')
    .select('*, erp_territories(name, mr_id, distributor_id), erp_users(name), erp_distributors(distributor_name)')
    .order('name', { ascending: true })
  if (!params.includeInactive) query = query.eq('active', true)
  if (params.territoryId) query = query.eq('territory_id', params.territoryId)

  const { data, error } = await query
  if (error) console.error('[erp] listAreas failed', error.message)
  if (!data || data.length === 0) return []

  // Names for whichever MR/distributor a territory's own default points
  // to — resolved separately, in plain lookups, rather than a nested
  // embed three levels deep.
  const territoryMrIds = [...new Set((data as any[]).map(r => r.erp_territories?.mr_id).filter(Boolean))] // eslint-disable-line @typescript-eslint/no-explicit-any
  const territoryDistributorIds = [...new Set((data as any[]).map(r => r.erp_territories?.distributor_id).filter(Boolean))] // eslint-disable-line @typescript-eslint/no-explicit-any

  const [{ data: mrRows }, { data: distRows }] = await Promise.all([
    territoryMrIds.length > 0
      ? db.from('erp_users').select('id, name').in('id', territoryMrIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    territoryDistributorIds.length > 0
      ? db.from('erp_distributors').select('id, distributor_name').in('id', territoryDistributorIds)
      : Promise.resolve({ data: [] as { id: string; distributor_name: string }[] }),
  ])
  const mrNameById = new Map((mrRows ?? []).map(m => [m.id, m.name]))
  const distNameById = new Map((distRows ?? []).map(d => [d.id, d.distributor_name]))

  return (data as any[]).map((row) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const { erp_territories, erp_users, erp_distributors, ...rest } = row
    const effectiveMrId = rest.mr_id ?? erp_territories?.mr_id ?? null
    const effectiveDistributorId = rest.distributor_id ?? erp_territories?.distributor_id ?? null
    return {
      ...rest,
      territory_name: erp_territories?.name ?? '—',
      mr_name: erp_users?.name ?? null,
      distributor_name: erp_distributors?.distributor_name ?? null,
      effective_mr_id: effectiveMrId,
      effective_mr_name: rest.mr_id ? (erp_users?.name ?? null) : (mrNameById.get(effectiveMrId ?? '') ?? null),
      effective_distributor_id: effectiveDistributorId,
      effective_distributor_name: rest.distributor_id
        ? (erp_distributors?.distributor_name ?? null)
        : (distNameById.get(effectiveDistributorId ?? '') ?? null),
    } as AreaRow
  })
}

/** Active MRs, for the Area/Territory forms' "Assigned MR" dropdowns — a
 *  short list, unpaginated is fine (matches listPotentialManagers() for
 *  offer letters). */
export async function listActiveMRs(): Promise<{ id: string; name: string }[]> {
  const db = await erpDb()
  const { data, error } = await db
    .from('erp_users')
    .select('id, name')
    .eq('active', true)
    .eq('role', 'MR')
    .order('name', { ascending: true })
  if (error) console.error('[erp] listActiveMRs failed', error.message)
  return (data ?? []) as { id: string; name: string }[]
}

/** Every MR regardless of active status, for the "reassign FROM" side of
 *  the bulk-reassignment tool — the whole point is reassigning away from
 *  an MR who has already been (or is about to be) deactivated, so they
 *  must still be selectable even though listActiveMRs() would exclude
 *  them. */
export async function listAllMRs(): Promise<{ id: string; name: string; active: boolean }[]> {
  const db = await erpDb()
  const { data, error } = await db
    .from('erp_users')
    .select('id, name, active')
    .eq('role', 'MR')
    .order('name', { ascending: true })
  if (error) console.error('[erp] listAllMRs failed', error.message)
  return (data ?? []) as { id: string; name: string; active: boolean }[]
}

/** Active distributors, for the Territory/Area forms' dropdowns —
 *  listDistributors() is paginated at 25 for its own list screen, too
 *  small for "every distributor" here, so this queries unpaginated
 *  directly. */
export async function listActiveDistributorsForDropdown(): Promise<{ id: string; distributor_name: string }[]> {
  const db = await erpDb()
  const { data, error } = await db
    .from('erp_distributors')
    .select('id, distributor_name')
    .eq('active', true)
    .order('distributor_name', { ascending: true })
  if (error) console.error('[erp] listActiveDistributorsForDropdown failed', error.message)
  return (data ?? []) as { id: string; distributor_name: string }[]
}

/** Every distributor regardless of active status — same reasoning as
 *  listAllMRs(), for the "reassign FROM" side. */
export async function listAllDistributorsForDropdown(): Promise<{ id: string; distributor_name: string; active: boolean }[]> {
  const db = await erpDb()
  const { data, error } = await db
    .from('erp_distributors')
    .select('id, distributor_name, active')
    .order('distributor_name', { ascending: true })
  if (error) console.error('[erp] listAllDistributorsForDropdown failed', error.message)
  return (data ?? []) as { id: string; distributor_name: string; active: boolean }[]
}
