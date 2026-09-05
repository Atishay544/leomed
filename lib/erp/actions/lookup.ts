'use server'

import { assertCapability } from '../auth'
import { erpDb, ilikeAny, safeSearch } from '../data/query'

/**
 * Typeahead lookups called directly from client components.
 *
 * These are server actions, so they are reachable by direct POST — each one
 * checks a capability rather than trusting that it was called from a form the
 * user was allowed to see.
 *
 * They exist so the visit and billing screens never ship the full doctor,
 * chemist or product tables to the browser (spec §55).
 */

export interface DoctorOption {
  id: string
  doctor_code: string
  doctor_name: string
  specialization: string | null
  clinic_name: string | null
  area: string | null
  city: string | null
  phone: string | null
}

export async function lookupDoctors(term: string): Promise<DoctorOption[]> {
  await assertCapability('masters.read')
  const db = await erpDb()

  let query = db
    .from('erp_doctors')
    .select('id, doctor_code, doctor_name, specialization, clinic_name, area, city, phone')
    .eq('active', true)
    .order('doctor_name')
    .limit(15)

  const q = safeSearch(term)
  if (q) query = query.or(ilikeAny(['doctor_name', 'doctor_code', 'phone', 'clinic_name', 'area'], q))

  const { data } = await query
  return (data ?? []) as unknown as DoctorOption[]
}

export interface ChemistOption {
  id: string
  chemist_code: string
  chemist_name: string
  owner_name: string | null
  area: string | null
  city: string | null
  phone: string | null
}

export async function lookupChemists(term: string): Promise<ChemistOption[]> {
  await assertCapability('masters.read')
  const db = await erpDb()

  let query = db
    .from('erp_chemists')
    .select('id, chemist_code, chemist_name, owner_name, area, city, phone')
    .eq('active', true)
    .order('chemist_name')
    .limit(15)

  const q = safeSearch(term)
  if (q) query = query.or(ilikeAny(['chemist_name', 'chemist_code', 'owner_name', 'phone', 'area'], q))

  const { data } = await query
  return (data ?? []) as unknown as ChemistOption[]
}

export interface ProductOption {
  id: string
  product_code: string
  product_name: string
  strength: string | null
  pack_size: string | null
  unit: string
  sale_rate: number
  gst_rate: number
}

export async function lookupProducts(term: string): Promise<ProductOption[]> {
  await assertCapability('masters.read')
  const db = await erpDb()

  let query = db
    .from('erp_products')
    .select('id, product_code, product_name, strength, pack_size, unit, sale_rate, gst_rate')
    .eq('active', true)
    .order('product_name')
    .limit(15)

  const q = safeSearch(term)
  if (q) query = query.or(ilikeAny(['product_name', 'product_code', 'generic_name', 'brand_name'], q))

  const { data } = await query
  return (data ?? []) as unknown as ProductOption[]
}

export interface SimilarDoctor extends DoctorOption {
  match_score: number
}

/**
 * Warns before a duplicate is created (spec §44). Trigram similarity on the
 * name, plus an exact phone match treated as near-certain — so "Dr Rajesh
 * Kumar" typed a second time surfaces the existing record instead of adding a
 * fifth copy of the same doctor.
 */
export async function findSimilarDoctors(
  name: string, phone?: string, area?: string,
): Promise<SimilarDoctor[]> {
  await assertCapability('masters.read')
  if (!name || name.trim().length < 3) return []

  const db = await erpDb()
  const { data, error } = await db.rpc('erp_find_similar_doctors', {
    p_name:  name.trim(),
    p_phone: phone?.trim() || null,
    p_area:  area?.trim() || null,
  })

  // A failed duplicate check must never block the MR from recording the visit.
  if (error) {
    console.error('[erp] duplicate doctor check failed', error.message)
    return []
  }
  return (data ?? []) as unknown as SimilarDoctor[]
}

export interface SimilarChemist extends ChemistOption {
  match_score: number
}

export async function findSimilarChemists(name: string, phone?: string): Promise<SimilarChemist[]> {
  await assertCapability('masters.read')
  if (!name || name.trim().length < 3) return []

  const db = await erpDb()
  const { data, error } = await db.rpc('erp_find_similar_chemists', {
    p_name:  name.trim(),
    p_phone: phone?.trim() || null,
  })

  if (error) {
    console.error('[erp] duplicate chemist check failed', error.message)
    return []
  }
  return (data ?? []) as unknown as SimilarChemist[]
}

/** Batches available to sell for one product, earliest expiry first (FEFO). */
export async function lookupBatchesForSale(productId: string) {
  await assertCapability('billing.sales.write')
  const db = await erpDb()

  const { data } = await db
    .from('erp_product_batches')
    .select('id, batch_number, expiry_date, current_quantity, sale_rate, mrp')
    .eq('product_id', productId)
    .gt('current_quantity', 0)
    .order('expiry_date', { ascending: true })
    .limit(50)

  return data ?? []
}

/**
 * Every batch of a product, including empty ones.
 *
 * Adjustments need the empty batches too: correcting an opening balance or
 * writing a batch back up after a mistaken issue both start from zero, which
 * the sales lookup deliberately filters out.
 */
export async function lookupAllBatches(productId: string) {
  await assertCapability('inventory.adjust')
  const db = await erpDb()

  const { data } = await db
    .from('erp_product_batches')
    .select('id, batch_number, expiry_date, current_quantity, sale_rate, mrp')
    .eq('product_id', productId)
    .order('expiry_date', { ascending: true })
    .limit(100)

  return data ?? []
}
