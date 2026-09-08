import 'server-only'
import { erpDb } from './query'

/**
 * Dashboard and report reads.
 *
 * Each of these is a single database round trip into a SQL function that does
 * the aggregation (see migration 20260904000007). Those functions are
 * SECURITY INVOKER, so RLS scopes the answer to the caller automatically —
 * an admin gets company-wide figures from the same call that gives an MR
 * only their own.
 */

export interface DashboardSummary {
  doctor_visits: number
  new_doctors: number
  existing_doctors: number
  chemist_visits: number
  field_orders: number
  field_order_value: number
  doctor_orders: number
  chemist_orders: number
  sales_count: number
  sales_value: number
  sales_outstanding: number
  purchase_count: number
  purchase_value: number
}

const EMPTY_SUMMARY: DashboardSummary = {
  doctor_visits: 0, new_doctors: 0, existing_doctors: 0, chemist_visits: 0,
  field_orders: 0, field_order_value: 0, doctor_orders: 0, chemist_orders: 0,
  sales_count: 0, sales_value: 0, sales_outstanding: 0,
  purchase_count: 0, purchase_value: 0,
}

export async function getDashboardSummary(
  from: string, to: string, mrId?: string, territory?: string,
): Promise<DashboardSummary> {
  const db = await erpDb()
  // `|| null`, not `?? null`: the filter form's "All MRs"/"All territories"
  // option submits as an empty string, not an absent param, since a GET
  // form includes every named field regardless of whether it was touched.
  // p_mr is uuid-typed in erp_dashboard_summary() — an empty string there
  // would fail outright rather than degrade quietly, same bug class as
  // erp_attendance_summary's p_role (see getAttendanceSummary above).
  const { data, error } = await db.rpc('erp_dashboard_summary', {
    p_from: from,
    p_to: to,
    p_mr: mrId || null,
    p_territory: territory || null,
  })

  // A dashboard that renders zeroes beats one that 500s: the tiles stay
  // readable while the operator fixes whatever is wrong (missing migration,
  // usually), and the reason is in the server log.
  if (error) {
    console.error('[erp] dashboard summary failed', error.message)
    return EMPTY_SUMMARY
  }

  return { ...EMPTY_SUMMARY, ...((data ?? {}) as Partial<DashboardSummary>) }
}

export interface MrPerformanceRow {
  mr_id: string
  mr_name: string
  mr_code: string | null
  territory: string | null
  doctor_visits: number
  chemist_visits: number
  new_doctors: number
  doctors_covered: number
  chemists_covered: number
  field_orders: number
  order_value: number
  followups_open: number
  orders_submitted: number
  orders_pending: number
  orders_rejected: number
  /** Present days (full credit) + half-days at 0.5 — week-offs/holidays are
   *  excluded from both this and attendance_days, same basis so the ratio
   *  of the two is a meaningful attendance rate. */
  attendance_present: number
  attendance_days: number
}

export async function getMrPerformance(from: string, to: string): Promise<MrPerformanceRow[]> {
  const db = await erpDb()
  const { data, error } = await db.rpc('erp_mr_performance', { p_from: from, p_to: to })
  if (error) {
    console.error('[erp] MR performance failed', error.message)
    return []
  }
  return (data ?? []) as unknown as MrPerformanceRow[]
}

export interface ProductPerformanceRow {
  product_id: string
  product_name: string
  product_code: string
  demand_quantity: number
  demand_value: number
  sold_quantity: number
  sold_value: number
  stock_on_hand: number
}

export async function getProductPerformance(
  from: string, to: string,
): Promise<ProductPerformanceRow[]> {
  const db = await erpDb()
  const { data, error } = await db.rpc('erp_product_performance', { p_from: from, p_to: to })
  if (error) {
    console.error('[erp] product performance failed', error.message)
    return []
  }
  return (data ?? []) as unknown as ProductPerformanceRow[]
}

export interface DistributorPerformanceRow {
  distributor_id: string
  distributor_name: string
  distributor_code: string
  city: string | null
  invoice_count: number
  sales_value: number
  outstanding: number
}

export async function getDistributorPerformance(
  from: string, to: string,
): Promise<DistributorPerformanceRow[]> {
  const db = await erpDb()
  const { data, error } = await db.rpc('erp_distributor_performance', { p_from: from, p_to: to })
  if (error) {
    console.error('[erp] distributor performance failed', error.message)
    return []
  }
  return (data ?? []) as unknown as DistributorPerformanceRow[]
}

export interface TerritoryPerformanceRow {
  territory: string
  mr_count: number
  doctor_visits: number
  chemist_visits: number
  new_doctors: number
  field_orders: number
  order_value: number
}

export async function getTerritoryPerformance(
  from: string, to: string,
): Promise<TerritoryPerformanceRow[]> {
  const db = await erpDb()
  const { data, error } = await db.rpc('erp_territory_performance', { p_from: from, p_to: to })
  if (error) {
    console.error('[erp] territory performance failed', error.message)
    return []
  }
  return (data ?? []) as unknown as TerritoryPerformanceRow[]
}

export interface TargetProgressRow {
  target_id: string
  mr_id: string | null
  mr_name: string | null
  mr_code: string | null
  territory: string | null
  target_type: string
  target_value: number
  achieved: number
  period_start: string
  period_end: string
}

export async function getTargetProgress(): Promise<TargetProgressRow[]> {
  const db = await erpDb()
  const { data, error } = await db.rpc('erp_target_progress')
  if (error) {
    console.error('[erp] target progress failed', error.message)
    return []
  }
  return (data ?? []) as unknown as TargetProgressRow[]
}

// ─── Admin insight reporting ────────────────────────────────────────────────
// Gross margin and scheme-discount cost are admin-only at the database
// (erp_is_admin() inside the function) — a non-admin caller gets a thrown
// error, not a masked/zeroed figure, so callers should only reach these from
// a screen already gated on inventory.valuation / pricing.manage.

export interface GrossMarginSummary {
  sales_value: number
  cogs: number
  gross_margin: number
  margin_pct: number
}

export async function getGrossMarginSummary(from: string, to: string): Promise<GrossMarginSummary | null> {
  const db = await erpDb()
  const { data, error } = await db.rpc('erp_gross_margin_summary', { p_from: from, p_to: to })
  if (error) {
    console.error('[erp] gross margin summary failed', error.message)
    return null
  }
  return data as GrossMarginSummary
}

export interface AgingBucket {
  bucket: '0-30' | '31-60' | '60+'
  invoice_count: number
  outstanding: number
}

export async function getSalesAgingSummary(): Promise<AgingBucket[]> {
  const db = await erpDb()
  const { data, error } = await db.rpc('erp_sales_aging_summary')
  if (error) {
    console.error('[erp] sales aging summary failed', error.message)
    return []
  }
  return (data ?? []) as unknown as AgingBucket[]
}

export async function getPurchaseAgingSummary(): Promise<AgingBucket[]> {
  const db = await erpDb()
  const { data, error } = await db.rpc('erp_purchase_aging_summary')
  if (error) {
    console.error('[erp] purchase aging summary failed', error.message)
    return []
  }
  return (data ?? []) as unknown as AgingBucket[]
}

export interface OrderInvoiceConversion {
  pending: number
  submitted: number
  rejected: number
  submitted_value: number
  conversion_rate: number
}

export async function getOrderInvoiceConversion(from: string, to: string): Promise<OrderInvoiceConversion> {
  const db = await erpDb()
  const EMPTY: OrderInvoiceConversion = { pending: 0, submitted: 0, rejected: 0, submitted_value: 0, conversion_rate: 0 }
  const { data, error } = await db.rpc('erp_order_invoice_conversion', { p_from: from, p_to: to })
  if (error) {
    console.error('[erp] order invoice conversion failed', error.message)
    return EMPTY
  }
  return { ...EMPTY, ...(data as Partial<OrderInvoiceConversion>) }
}

export interface ExpiredSaleSummary { count: number; value: number }

export async function getExpiredSaleSummary(from: string, to: string): Promise<ExpiredSaleSummary> {
  const db = await erpDb()
  const { data, error } = await db.rpc('erp_expired_sale_summary', { p_from: from, p_to: to })
  if (error) {
    console.error('[erp] expired sale summary failed', error.message)
    return { count: 0, value: 0 }
  }
  return data as ExpiredSaleSummary
}

export interface SchemeDiscountSummary {
  margin_scheme_lines: number
  margin_scheme_value: number
  free_scheme_lines: number
  free_units_given: number
  free_units_value: number
}

export async function getSchemeDiscountSummary(from: string, to: string): Promise<SchemeDiscountSummary | null> {
  const db = await erpDb()
  const { data, error } = await db.rpc('erp_scheme_discount_summary', { p_from: from, p_to: to })
  if (error) {
    console.error('[erp] scheme discount summary failed', error.message)
    return null
  }
  return data as SchemeDiscountSummary
}

export interface GstSummary { output_tax: number; input_tax: number; net_payable: number }

export async function getGstSummary(from: string, to: string): Promise<GstSummary> {
  const db = await erpDb()
  const { data, error } = await db.rpc('erp_gst_summary', { p_from: from, p_to: to })
  if (error) {
    console.error('[erp] GST summary failed', error.message)
    return { output_tax: 0, input_tax: 0, net_payable: 0 }
  }
  return data as GstSummary
}

export interface ExpensePeriodSummary { approved_value: number; pending_value: number }

export async function getExpensePeriodSummary(from: string, to: string): Promise<ExpensePeriodSummary> {
  const db = await erpDb()
  const { data, error } = await db.rpc('erp_expense_period_summary', { p_from: from, p_to: to })
  if (error) {
    console.error('[erp] expense period summary failed', error.message)
    return { approved_value: 0, pending_value: 0 }
  }
  return data as ExpensePeriodSummary
}

export interface DoctorPerformanceRow {
  doctor_id: string
  doctor_name: string
  doctor_code: string
  city: string | null
  order_count: number
  submitted_value: number
}

export async function getDoctorPerformance(from: string, to: string): Promise<DoctorPerformanceRow[]> {
  const db = await erpDb()
  const { data, error } = await db.rpc('erp_doctor_performance', { p_from: from, p_to: to })
  if (error) {
    console.error('[erp] doctor performance failed', error.message)
    return []
  }
  return (data ?? []) as unknown as DoctorPerformanceRow[]
}

export interface ChemistPerformanceRow {
  chemist_id: string
  chemist_name: string
  chemist_code: string
  city: string | null
  order_count: number
  submitted_value: number
}

export async function getChemistPerformance(from: string, to: string): Promise<ChemistPerformanceRow[]> {
  const db = await erpDb()
  const { data, error } = await db.rpc('erp_chemist_performance', { p_from: from, p_to: to })
  if (error) {
    console.error('[erp] chemist performance failed', error.message)
    return []
  }
  return (data ?? []) as unknown as ChemistPerformanceRow[]
}

export interface ChemistNewVsRepeat { new_chemists: number; repeat_chemists: number }

export async function getChemistNewVsRepeat(from: string, to: string): Promise<ChemistNewVsRepeat> {
  const db = await erpDb()
  const { data, error } = await db.rpc('erp_chemist_new_vs_repeat', { p_from: from, p_to: to })
  if (error) {
    console.error('[erp] chemist new-vs-repeat failed', error.message)
    return { new_chemists: 0, repeat_chemists: 0 }
  }
  return data as ChemistNewVsRepeat
}

export interface SlowMovingProduct {
  product_id: string
  product_name: string
  product_code: string
  stock_on_hand: number
  last_sold_date: string | null
}

export async function getSlowMovingProducts(days = 90): Promise<SlowMovingProduct[]> {
  const db = await erpDb()
  const { data, error } = await db.rpc('erp_slow_moving_products', { p_days: days })
  if (error) {
    console.error('[erp] slow moving products failed', error.message)
    return []
  }
  return (data ?? []) as unknown as SlowMovingProduct[]
}

/** First and last day of the current month, as yyyy-mm-dd. The default window
 *  for every dashboard and report. */
export function currentMonthRange(): { from: string; to: string } {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const year = now.getFullYear()
  const month = now.getMonth()
  const lastDay = new Date(year, month + 1, 0).getDate()
  return {
    from: `${year}-${pad(month + 1)}-01`,
    to:   `${year}-${pad(month + 1)}-${pad(lastDay)}`,
  }
}
