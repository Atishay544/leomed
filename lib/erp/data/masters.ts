import 'server-only'
import {
  erpDb, ilikeAny, PAGE_SIZE, rangeFor, safeSearch, toPage, type PageResult,
} from './query'
import type {
  Chemist, Distributor, Doctor, ErpProduct, ProductBatch, Supplier,
} from '../types'

/**
 * Read helpers for master data. All of them page and filter in PostgreSQL —
 * "fetch all doctors to the browser" is explicitly called out as a thing not
 * to do (spec §55).
 */

export interface MasterListParams {
  q?: string
  page?: number
  territory?: string
  city?: string
  includeInactive?: boolean
}

export async function listDoctors(params: MasterListParams = {}): Promise<PageResult<Doctor>> {
  const db = await erpDb()
  const page = params.page ?? 1
  const [from, to] = rangeFor(page)

  let query = db
    .from('erp_doctors')
    .select('*', { count: 'exact' })
    .order('doctor_name', { ascending: true })
    .range(from, to)

  if (!params.includeInactive) query = query.eq('active', true)
  if (params.territory) query = query.eq('territory', params.territory)
  if (params.city) query = query.eq('city', params.city)

  const term = safeSearch(params.q)
  if (term) {
    query = query.or(ilikeAny(
      ['doctor_name', 'doctor_code', 'phone', 'clinic_name', 'area', 'city', 'specialization'],
      term,
    ))
  }

  const { data, count } = await query
  return toPage<Doctor>(data as Doctor[] | null, count, page)
}

export async function getDoctor(id: string): Promise<Doctor | null> {
  const db = await erpDb()
  const { data } = await db.from('erp_doctors').select('*').eq('id', id).maybeSingle()
  return (data as Doctor) ?? null
}

export async function listChemists(params: MasterListParams = {}): Promise<PageResult<Chemist>> {
  const db = await erpDb()
  const page = params.page ?? 1
  const [from, to] = rangeFor(page)

  let query = db
    .from('erp_chemists')
    .select('*', { count: 'exact' })
    .order('chemist_name', { ascending: true })
    .range(from, to)

  if (!params.includeInactive) query = query.eq('active', true)
  if (params.territory) query = query.eq('territory', params.territory)
  if (params.city) query = query.eq('city', params.city)

  const term = safeSearch(params.q)
  if (term) {
    query = query.or(ilikeAny(
      ['chemist_name', 'chemist_code', 'owner_name', 'phone', 'area', 'city'],
      term,
    ))
  }

  const { data, count } = await query
  return toPage<Chemist>(data as Chemist[] | null, count, page)
}

export async function getChemist(id: string): Promise<Chemist | null> {
  const db = await erpDb()
  const { data } = await db.from('erp_chemists').select('*').eq('id', id).maybeSingle()
  return (data as Chemist) ?? null
}

export async function listDistributors(params: MasterListParams = {}): Promise<PageResult<Distributor>> {
  const db = await erpDb()
  const page = params.page ?? 1
  const [from, to] = rangeFor(page)

  let query = db
    .from('erp_distributors')
    .select('*', { count: 'exact' })
    .order('distributor_name', { ascending: true })
    .range(from, to)

  if (!params.includeInactive) query = query.eq('active', true)

  const term = safeSearch(params.q)
  if (term) {
    query = query.or(ilikeAny(
      ['distributor_name', 'distributor_code', 'city', 'territory', 'phone', 'contact_person'],
      term,
    ))
  }

  const { data, count } = await query
  return toPage<Distributor>(data as Distributor[] | null, count, page)
}

export async function listSuppliers(params: MasterListParams = {}): Promise<PageResult<Supplier>> {
  const db = await erpDb()
  const page = params.page ?? 1
  const [from, to] = rangeFor(page)

  let query = db
    .from('erp_suppliers')
    .select('*', { count: 'exact' })
    .order('supplier_name', { ascending: true })
    .range(from, to)

  if (!params.includeInactive) query = query.eq('active', true)

  const term = safeSearch(params.q)
  if (term) {
    query = query.or(ilikeAny(
      ['supplier_name', 'supplier_code', 'city', 'phone', 'contact_person'],
      term,
    ))
  }

  const { data, count } = await query
  return toPage<Supplier>(data as Supplier[] | null, count, page)
}

export interface ProductListParams extends MasterListParams {
  category?: string
}

export async function listProducts(params: ProductListParams = {}): Promise<PageResult<ErpProduct>> {
  const db = await erpDb()
  const page = params.page ?? 1
  const [from, to] = rangeFor(page)

  let query = db
    .from('erp_products')
    .select('*', { count: 'exact' })
    .order('product_name', { ascending: true })
    .range(from, to)

  if (!params.includeInactive) query = query.eq('active', true)
  if (params.category) query = query.eq('category', params.category)

  const term = safeSearch(params.q)
  if (term) {
    query = query.or(ilikeAny(
      ['product_name', 'product_code', 'generic_name', 'brand_name', 'category'],
      term,
    ))
  }

  const { data, count } = await query
  return toPage<ErpProduct>(data as ErpProduct[] | null, count, page)
}

export async function getProduct(id: string): Promise<ErpProduct | null> {
  const db = await erpDb()
  const { data } = await db.from('erp_products').select('*').eq('id', id).maybeSingle()
  return (data as ErpProduct) ?? null
}

/**
 * The public storefront catalogue (public.products) — a separate table from
 * this product master, used only to populate the optional "link to
 * storefront listing" field. Linking is a pure cross-reference: it does not
 * pull price/stock into the catalogue (still not shown publicly) and does
 * not push the ERP product's own fields onto the storefront record.
 */
export async function listStorefrontProductOptions(): Promise<{ value: string; label: string }[]> {
  const db = await erpDb()
  const { data } = await (db as any)
    .from('products')
    .select('id, name')
    .order('name', { ascending: true })
  return ((data ?? []) as { id: string; name: string }[]).map(p => ({ value: p.id, label: p.name }))
}

/** Typeahead source for the visit and billing forms. Capped hard — this feeds
 *  a dropdown, and a dropdown with 4,000 entries is not a dropdown. */
export async function searchProductsForPicker(q: string, limit = 20) {
  const db = await erpDb()
  const term = safeSearch(q)

  let query = db
    .from('erp_products')
    .select('id, product_code, product_name, strength, pack_size, unit, sale_rate, gst_rate')
    .eq('active', true)
    .order('product_name', { ascending: true })
    .limit(limit)

  if (term) query = query.or(ilikeAny(['product_name', 'product_code', 'generic_name', 'brand_name'], term))

  const { data } = await query
  return data ?? []
}

export type BatchWithProduct = ProductBatch & {
  erp_products: Pick<ErpProduct, 'product_name' | 'product_code' | 'unit' | 'gst_rate'> | null
}

export interface BatchListParams {
  q?: string
  page?: number
  productId?: string
  /** 'in-stock' | 'expiring' | 'expired' | 'all' */
  filter?: string
  expiryWarningDays?: number
}

export async function listBatches(params: BatchListParams = {}): Promise<PageResult<BatchWithProduct>> {
  const db = await erpDb()
  const page = params.page ?? 1
  const [from, to] = rangeFor(page)
  const today = new Date().toISOString().slice(0, 10)

  let query = db
    .from('erp_product_batches')
    .select(
      'id, product_id, batch_number, manufacturing_date, expiry_date, mrp, purchase_rate, ' +
      'sale_rate, opening_quantity, current_quantity, created_at, updated_at, ' +
      'erp_products!inner(product_name, product_code, unit, gst_rate)',
      { count: 'exact' },
    )
    .order('expiry_date', { ascending: true })
    .range(from, to)

  if (params.productId) query = query.eq('product_id', params.productId)

  if (params.filter === 'in-stock')  query = query.gt('current_quantity', 0)
  if (params.filter === 'expired')   query = query.lt('expiry_date', today)
  if (params.filter === 'expiring') {
    const horizon = new Date()
    horizon.setDate(horizon.getDate() + (params.expiryWarningDays ?? 90))
    query = query
      .gte('expiry_date', today)
      .lte('expiry_date', horizon.toISOString().slice(0, 10))
      .gt('current_quantity', 0)
  }

  const term = safeSearch(params.q)
  if (term) {
    // The search box accepts a batch number or a product name, but PostgREST
    // will not filter parent rows by an embedded table's column inside an
    // `or()`. Resolving the matching product ids first keeps the filter a
    // plain top-level condition, which behaves predictably.
    const { data: matches } = await db
      .from('erp_products')
      .select('id')
      .or(ilikeAny(['product_name', 'product_code', 'generic_name'], term))
      .limit(100)

    const productIds = (matches ?? []).map(row => (row as { id: string }).id)

    query = productIds.length
      ? query.or(`batch_number.ilike.%${term}%,product_id.in.(${productIds.join(',')})`)
      : query.ilike('batch_number', `%${term}%`)
  }

  const { data, count } = await query
  return toPage<BatchWithProduct>(data as unknown as BatchWithProduct[] | null, count, page)
}

/** Batches available to sell, earliest-expiry first (FEFO) — the order a
 *  storekeeper would pick them in, so the sales form suggests the same. */
export async function batchesForSale(productId: string, allowExpired = false) {
  const db = await erpDb()
  const today = new Date().toISOString().slice(0, 10)

  let query = db
    .from('erp_product_batches')
    .select('id, batch_number, expiry_date, current_quantity, sale_rate, mrp')
    .eq('product_id', productId)
    .gt('current_quantity', 0)
    .order('expiry_date', { ascending: true })
    .limit(50)

  if (!allowExpired) query = query.gte('expiry_date', today)

  const { data } = await query
  return data ?? []
}

/** Distinct territories, for filter dropdowns. Free text by design (Q8), so
 *  the option list is derived from what has actually been entered. */
export async function listTerritories(): Promise<string[]> {
  const db = await erpDb()
  const { data } = await db
    .from('erp_users')
    .select('territory')
    .not('territory', 'is', null)
    .limit(500)

  const set = new Set<string>()
  for (const row of data ?? []) {
    const t = (row as { territory: string | null }).territory
    if (t) set.add(t)
  }
  return [...set].sort()
}

export { PAGE_SIZE }
