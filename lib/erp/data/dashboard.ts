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
  const { data, error } = await db.rpc('erp_dashboard_summary', {
    p_from: from,
    p_to: to,
    p_mr: mrId ?? null,
    p_territory: territory ?? null,
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
