import 'server-only'
import { erpDb, rangeFor, toPage, type PageResult } from './query'
import type { ErpPricingRule, ErpScheme, ErpSchemeCustomer } from '../types'

/**
 * Admin-only pricing/scheme reads (pricing.manage). Nothing here is called
 * from a non-admin screen — the sales invoice form gets a price through
 * erp_explain_price() (lib/erp/actions/pricing.ts's resolvePrice), which
 * never returns these raw rows to a non-admin caller.
 */

export interface PricingRuleRow extends ErpPricingRule {
  erp_products: { product_name: string; product_code: string } | null
  erp_distributors: { distributor_name: string } | null
  erp_chemists: { chemist_name: string } | null
  erp_doctors: { doctor_name: string } | null
}

export interface PricingRuleListParams {
  page?: number
  productId?: string
  customerType?: string
  status?: string
  scope?: 'ALL' | 'DEFAULT' | 'NEGOTIATED'
}

export async function listPricingRules(params: PricingRuleListParams = {}): Promise<PageResult<PricingRuleRow>> {
  const db = await erpDb()
  const page = params.page ?? 1
  const [from, to] = rangeFor(page)

  let query = db
    .from('erp_pricing_rules')
    .select(
      `*,
       erp_products!erp_pricing_rules_product_id_fkey(product_name, product_code),
       erp_distributors!erp_pricing_rules_distributor_id_fkey(distributor_name),
       erp_chemists!erp_pricing_rules_chemist_id_fkey(chemist_name),
       erp_doctors!erp_pricing_rules_doctor_id_fkey(doctor_name)`,
      { count: 'exact' },
    )
    .order('product_id', { ascending: true })
    .order('version', { ascending: false })
    .range(from, to)

  if (params.productId) query = query.eq('product_id', params.productId)
  if (params.customerType) query = query.eq('customer_type', params.customerType)
  if (params.status) query = query.eq('status', params.status)
  if (params.scope === 'DEFAULT') query = query.is('distributor_id', null).is('chemist_id', null).is('doctor_id', null)
  if (params.scope === 'NEGOTIATED') {
    query = query.or('distributor_id.not.is.null,chemist_id.not.is.null,doctor_id.not.is.null')
  }

  const { data, count } = await query
  return toPage<PricingRuleRow>(data as unknown as PricingRuleRow[] | null, count, page)
}

export interface SchemeRow extends ErpScheme {
  erp_products: { product_name: string; product_code: string } | null
}

export async function listSchemes(params: { page?: number; status?: string; schemeType?: string } = {}): Promise<PageResult<SchemeRow>> {
  const db = await erpDb()
  const page = params.page ?? 1
  const [from, to] = rangeFor(page)

  let query = db
    .from('erp_schemes')
    .select('*, erp_products!erp_schemes_product_id_fkey(product_name, product_code)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (params.status) query = query.eq('status', params.status)
  if (params.schemeType) query = query.eq('scheme_type', params.schemeType)

  const { data, count } = await query
  return toPage<SchemeRow>(data as unknown as SchemeRow[] | null, count, page)
}

export interface SchemeCustomerRow extends ErpSchemeCustomer {
  erp_distributors: { distributor_name: string } | null
  erp_chemists: { chemist_name: string } | null
  erp_doctors: { doctor_name: string } | null
}

export async function listSchemeCustomers(schemeId: string): Promise<SchemeCustomerRow[]> {
  const db = await erpDb()
  const { data } = await db
    .from('erp_scheme_customers')
    .select(`*,
      erp_distributors!erp_scheme_customers_distributor_id_fkey(distributor_name),
      erp_chemists!erp_scheme_customers_chemist_id_fkey(chemist_name),
      erp_doctors!erp_scheme_customers_doctor_id_fkey(doctor_name)`)
    .eq('scheme_id', schemeId)
  return (data ?? []) as unknown as SchemeCustomerRow[]
}

export async function getScheme(id: string): Promise<SchemeRow | null> {
  const db = await erpDb()
  const { data } = await db
    .from('erp_schemes')
    .select('*, erp_products!erp_schemes_product_id_fkey(product_name, product_code)')
    .eq('id', id)
    .maybeSingle()
  return (data as unknown as SchemeRow | null) ?? null
}
