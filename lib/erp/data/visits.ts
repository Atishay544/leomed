import 'server-only'
import { erpDb, parsePage, rangeFor, safeSearch, toPage, type PageResult } from './query'
import type {
  ChemistVisit, DoctorVisit, FieldOrder, FieldOrderStatus, Followup,
} from '../types'

/**
 * Reads for visits, field orders and follow-ups.
 *
 * EMBED HINTS: erp_doctor_visits has three foreign keys to erp_users
 * (mr_id, created_by, updated_by), so a bare `erp_users(...)` embed is
 * ambiguous and PostgREST rejects it. Every embed below names its constraint
 * — the same class of bug the storefront hit with products→categories.
 *
 * RLS does the row filtering: an MR's query returns their own visits without
 * this file passing an mr_id at all. The explicit mrId parameter exists for
 * admins looking at one person's work.
 */

const MR_EMBED = (fk: string) => `erp_users!${fk}(id, name, mr_code)`

export interface VisitListParams {
  mrId?: string
  from?: string
  to?: string
  q?: string
  page?: number
  doctorId?: string
  chemistId?: string
  status?: string
}

export type DoctorVisitRow = DoctorVisit & {
  erp_doctors: { id: string; doctor_name: string; doctor_code: string; area: string | null; city: string | null } | null
  erp_users: { id: string; name: string; mr_code: string | null } | null
  erp_doctor_visit_products: { product_id: string }[] | null
  erp_field_orders: { id: string; order_number: string; estimated_value: number }[] | null
}

export async function listDoctorVisits(params: VisitListParams = {}): Promise<PageResult<DoctorVisitRow>> {
  const db = await erpDb()
  const page = params.page ?? 1
  const [from, to] = rangeFor(page)

  let query = db
    .from('erp_doctor_visits')
    .select(
      `*,
       erp_doctors!erp_doctor_visits_doctor_id_fkey(id, doctor_name, doctor_code, area, city),
       ${MR_EMBED('erp_doctor_visits_mr_id_fkey')},
       erp_doctor_visit_products(product_id),
       erp_field_orders!erp_field_orders_doctor_visit_id_fkey(id, order_number, estimated_value)`,
      { count: 'exact' },
    )
    .order('visit_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (params.mrId)     query = query.eq('mr_id', params.mrId)
  if (params.doctorId) query = query.eq('doctor_id', params.doctorId)
  if (params.from)     query = query.gte('visit_date', params.from)
  if (params.to)       query = query.lte('visit_date', params.to)
  if (params.status === 'NEW' || params.status === 'EXISTING') {
    query = query.eq('doctor_status', params.status)
  }

  // A filter written against an embedded table only prunes the embed, not the
  // parent rows, unless the join is inner. Resolving ids first keeps this a
  // top-level condition on erp_doctor_visits, where it means what it looks like.
  const term = safeSearch(params.q)
  if (term) {
    const { data: matches } = await db
      .from('erp_doctors').select('id').ilike('doctor_name', `%${term}%`).limit(200)
    const ids = (matches ?? []).map(row => (row as { id: string }).id)
    if (ids.length === 0) return toPage<DoctorVisitRow>([], 0, page)
    query = query.in('doctor_id', ids)
  }

  const { data, count } = await query
  return toPage<DoctorVisitRow>(data as unknown as DoctorVisitRow[] | null, count, page)
}

export type ChemistVisitRow = ChemistVisit & {
  erp_chemists: { id: string; chemist_name: string; chemist_code: string; area: string | null; city: string | null } | null
  erp_users: { id: string; name: string; mr_code: string | null } | null
  erp_field_orders: { id: string; order_number: string; estimated_value: number }[] | null
}

export async function listChemistVisits(params: VisitListParams = {}): Promise<PageResult<ChemistVisitRow>> {
  const db = await erpDb()
  const page = params.page ?? 1
  const [from, to] = rangeFor(page)

  let query = db
    .from('erp_chemist_visits')
    .select(
      `*,
       erp_chemists!erp_chemist_visits_chemist_id_fkey(id, chemist_name, chemist_code, area, city),
       ${MR_EMBED('erp_chemist_visits_mr_id_fkey')},
       erp_field_orders!erp_field_orders_chemist_visit_id_fkey(id, order_number, estimated_value)`,
      { count: 'exact' },
    )
    .order('visit_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (params.mrId)      query = query.eq('mr_id', params.mrId)
  if (params.chemistId) query = query.eq('chemist_id', params.chemistId)
  if (params.from)      query = query.gte('visit_date', params.from)
  if (params.to)        query = query.lte('visit_date', params.to)

  const term = safeSearch(params.q)
  if (term) {
    const { data: matches } = await db
      .from('erp_chemists').select('id').ilike('chemist_name', `%${term}%`).limit(200)
    const ids = (matches ?? []).map(row => (row as { id: string }).id)
    if (ids.length === 0) return toPage<ChemistVisitRow>([], 0, page)
    query = query.in('chemist_id', ids)
  }

  const { data, count } = await query
  return toPage<ChemistVisitRow>(data as unknown as ChemistVisitRow[] | null, count, page)
}

export async function getDoctorVisit(id: string) {
  const db = await erpDb()
  const { data } = await db
    .from('erp_doctor_visits')
    .select(
      `*,
       erp_doctors!erp_doctor_visits_doctor_id_fkey(*),
       ${MR_EMBED('erp_doctor_visits_mr_id_fkey')},
       erp_doctor_visit_products(id, product_id, discussion_type, sample_quantity, remarks,
         erp_products(product_name, product_code, strength, unit)),
       erp_field_orders!erp_field_orders_doctor_visit_id_fkey(
         id, order_number, order_book_number, status, estimated_value, order_date,
         erp_field_order_items(id, quantity, unit, unit_rate, discount_percent, line_value, remarks,
           erp_products(product_name, product_code, strength)))`,
    )
    .eq('id', id)
    .maybeSingle()

  return data
}

export async function getChemistVisit(id: string) {
  const db = await erpDb()
  const { data } = await db
    .from('erp_chemist_visits')
    .select(
      `*,
       erp_chemists!erp_chemist_visits_chemist_id_fkey(*),
       ${MR_EMBED('erp_chemist_visits_mr_id_fkey')},
       erp_field_orders!erp_field_orders_chemist_visit_id_fkey(
         id, order_number, order_book_number, status, estimated_value, order_date,
         erp_field_order_items(id, quantity, unit, unit_rate, discount_percent, line_value, remarks,
           erp_products(product_name, product_code, strength)))`,
    )
    .eq('id', id)
    .maybeSingle()

  return data
}

// ─── Field orders ───────────────────────────────────────────────────────────

export type FieldOrderRow = FieldOrder & {
  erp_doctors: { doctor_name: string; doctor_code: string } | null
  erp_chemists: { chemist_name: string; chemist_code: string } | null
  erp_users: { id: string; name: string; mr_code: string | null } | null
  erp_field_order_items: { id: string; quantity: number }[] | null
}

export interface FieldOrderListParams extends VisitListParams {
  customerType?: 'DOCTOR' | 'CHEMIST'
}

export async function listFieldOrders(params: FieldOrderListParams = {}): Promise<PageResult<FieldOrderRow>> {
  const db = await erpDb()
  const page = params.page ?? 1
  const [from, to] = rangeFor(page)

  let query = db
    .from('erp_field_orders')
    .select(
      `*,
       erp_doctors!erp_field_orders_doctor_id_fkey(doctor_name, doctor_code),
       erp_chemists!erp_field_orders_chemist_id_fkey(chemist_name, chemist_code),
       ${MR_EMBED('erp_field_orders_mr_id_fkey')},
       erp_field_order_items(id, quantity)`,
      { count: 'exact' },
    )
    .order('order_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (params.mrId)         query = query.eq('mr_id', params.mrId)
  if (params.customerType) query = query.eq('customer_type', params.customerType)
  if (params.from)         query = query.gte('order_date', params.from)
  if (params.to)           query = query.lte('order_date', params.to)
  if (params.status && params.status !== 'ALL') {
    query = query.eq('status', params.status as FieldOrderStatus)
  }

  const term = safeSearch(params.q)
  if (term) query = query.or(`order_number.ilike.%${term}%,order_book_number.ilike.%${term}%`)

  const { data, count } = await query
  return toPage<FieldOrderRow>(data as unknown as FieldOrderRow[] | null, count, page)
}

export async function getFieldOrder(id: string) {
  const db = await erpDb()
  const { data } = await db
    .from('erp_field_orders')
    .select(
      `*,
       erp_doctors!erp_field_orders_doctor_id_fkey(doctor_name, doctor_code, phone, area, city, clinic_name),
       erp_chemists!erp_field_orders_chemist_id_fkey(chemist_name, chemist_code, phone, area, city, owner_name),
       ${MR_EMBED('erp_field_orders_mr_id_fkey')},
       erp_field_order_items(id, product_id, quantity, unit, unit_rate, discount_percent, line_value, remarks,
         erp_products(product_name, product_code, strength, pack_size))`,
    )
    .eq('id', id)
    .maybeSingle()

  return data
}

// ─── Follow-ups ─────────────────────────────────────────────────────────────

export type FollowupRow = Followup & {
  erp_doctors: { doctor_name: string; phone: string | null; area: string | null } | null
  erp_chemists: { chemist_name: string; phone: string | null; area: string | null } | null
  erp_users: { id: string; name: string; mr_code: string | null } | null
}

export async function listFollowups(params: {
  mrId?: string
  status?: string
  page?: number
  upTo?: string
} = {}): Promise<PageResult<FollowupRow>> {
  const db = await erpDb()
  const page = params.page ?? 1
  const [from, to] = rangeFor(page)

  let query = db
    .from('erp_followups')
    .select(
      `*,
       erp_doctors!erp_followups_doctor_id_fkey(doctor_name, phone, area),
       erp_chemists!erp_followups_chemist_id_fkey(chemist_name, phone, area),
       ${MR_EMBED('erp_followups_mr_id_fkey')}`,
      { count: 'exact' },
    )
    .order('followup_date', { ascending: true })
    .range(from, to)

  if (params.mrId) query = query.eq('mr_id', params.mrId)
  if (params.status && params.status !== 'ALL') query = query.eq('status', params.status)
  if (params.upTo) query = query.lte('followup_date', params.upTo)

  const { data, count } = await query
  return toPage<FollowupRow>(data as unknown as FollowupRow[] | null, count, page)
}

// ─── MR home ────────────────────────────────────────────────────────────────

export interface MrDayStats {
  doctorVisits: number
  chemistVisits: number
  newDoctors: number
  fieldOrders: number
  orderValue: number
  followupsDue: number
  followupsOverdue: number
}

/**
 * Counts for the MR's own day. Uses head:true count queries so no rows travel
 * over the wire — the numbers are computed in PostgreSQL (spec §55).
 */
export async function getMrDayStats(mrId: string, day: string): Promise<MrDayStats> {
  const db = await erpDb()

  const [doctors, chemists, newDoctors, orders, followupsDue, followupsOverdue] = await Promise.all([
    db.from('erp_doctor_visits').select('id', { count: 'exact', head: true })
      .eq('mr_id', mrId).eq('visit_date', day),
    db.from('erp_chemist_visits').select('id', { count: 'exact', head: true })
      .eq('mr_id', mrId).eq('visit_date', day),
    db.from('erp_doctor_visits').select('id', { count: 'exact', head: true })
      .eq('mr_id', mrId).eq('visit_date', day).eq('doctor_status', 'NEW'),
    db.from('erp_field_orders').select('id, estimated_value')
      .eq('mr_id', mrId).eq('order_date', day),
    db.from('erp_followups').select('id', { count: 'exact', head: true })
      .eq('mr_id', mrId).eq('status', 'PENDING').eq('followup_date', day),
    db.from('erp_followups').select('id', { count: 'exact', head: true })
      .eq('mr_id', mrId).eq('status', 'PENDING').lt('followup_date', day),
  ])

  const orderRows = (orders.data ?? []) as { estimated_value: number }[]

  return {
    doctorVisits:      doctors.count ?? 0,
    chemistVisits:     chemists.count ?? 0,
    newDoctors:        newDoctors.count ?? 0,
    fieldOrders:       orderRows.length,
    orderValue:        orderRows.reduce((sum, o) => sum + Number(o.estimated_value ?? 0), 0),
    followupsDue:      followupsDue.count ?? 0,
    followupsOverdue:  followupsOverdue.count ?? 0,
  }
}

export { parsePage }
