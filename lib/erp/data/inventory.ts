import 'server-only'
import { erpDb, rangeFor, toPage, type PageResult } from './query'
import type { InventoryTransaction } from '../types'

/**
 * Inventory reads.
 *
 * Stock figures come from erp_product_batches.current_quantity, which a
 * database trigger keeps equal to SUM(ledger.quantity). The ledger itself is
 * the audit trail; erp_reconcile_batch_quantities() proves the two agree and
 * is surfaced on the inventory screen.
 */

export type LedgerRow = InventoryTransaction & {
  erp_products: { product_name: string; product_code: string; unit: string } | null
  erp_product_batches: { batch_number: string; expiry_date: string } | null
  erp_users: { name: string } | null
}

export async function listInventoryTransactions(params: {
  page?: number
  productId?: string
  batchId?: string
  type?: string
  from?: string
  to?: string
} = {}): Promise<PageResult<LedgerRow>> {
  const db = await erpDb()
  const page = params.page ?? 1
  const [from, to] = rangeFor(page)

  let query = db
    .from('erp_inventory_transactions')
    .select(
      `*,
       erp_products(product_name, product_code, unit),
       erp_product_batches(batch_number, expiry_date),
       erp_users!erp_inventory_transactions_created_by_fkey(name)`,
      { count: 'exact' },
    )
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (params.productId) query = query.eq('product_id', params.productId)
  if (params.batchId)   query = query.eq('batch_id', params.batchId)
  if (params.from)      query = query.gte('transaction_date', params.from)
  if (params.to)        query = query.lte('transaction_date', params.to)
  if (params.type && params.type !== 'ALL') query = query.eq('transaction_type', params.type)

  const { data, count } = await query
  return toPage<LedgerRow>(data as unknown as LedgerRow[] | null, count, page)
}

export interface StockSummary {
  totalBatches: number
  inStockBatches: number
  stockValue: number
  expiredBatches: number
  expiringBatches: number
  expiredValue: number
}

/**
 * Headline stock numbers.
 *
 * Only batches holding stock are loaded — an empty batch contributes nothing
 * to any of these figures, and skipping them keeps the query small on a
 * catalogue with years of exhausted batches behind it.
 */
export async function getStockSummary(expiryWarningDays: number): Promise<StockSummary> {
  const db = await erpDb()
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const horizon = new Date(today)
  horizon.setDate(horizon.getDate() + expiryWarningDays)
  const horizonStr = horizon.toISOString().slice(0, 10)

  const [{ data: batches }, { count: totalBatches }] = await Promise.all([
    db.from('erp_product_batches')
      .select('current_quantity, purchase_rate, expiry_date')
      .gt('current_quantity', 0)
      .limit(5000),
    db.from('erp_product_batches').select('id', { count: 'exact', head: true }),
  ])

  const rows = (batches ?? []) as { current_quantity: number; purchase_rate: number; expiry_date: string }[]

  let stockValue = 0
  let expiredBatches = 0
  let expiringBatches = 0
  let expiredValue = 0

  for (const b of rows) {
    const value = Number(b.current_quantity) * Number(b.purchase_rate)
    stockValue += value
    if (b.expiry_date < todayStr) {
      expiredBatches += 1
      expiredValue += value
    } else if (b.expiry_date <= horizonStr) {
      expiringBatches += 1
    }
  }

  return {
    totalBatches: totalBatches ?? 0,
    inStockBatches: rows.length,
    stockValue,
    expiredBatches,
    expiringBatches,
    expiredValue,
  }
}

export interface LowStockRow {
  productId: string
  productName: string
  productCode: string
  unit: string
  minStockLevel: number
  onHand: number
}

/**
 * Products at or below their configured low-stock level.
 *
 * Stock lives per batch and the threshold per product, so the two are summed
 * and compared here. Only products with a threshold set are considered —
 * min_stock_level 0 means "don't alert on this".
 */
export async function getLowStockProducts(limit = 20): Promise<LowStockRow[]> {
  const db = await erpDb()

  const { data: products } = await db
    .from('erp_products')
    .select('id, product_name, product_code, unit, min_stock_level')
    .eq('active', true)
    .gt('min_stock_level', 0)
    .limit(500)

  const list = (products ?? []) as {
    id: string; product_name: string; product_code: string; unit: string; min_stock_level: number
  }[]
  if (list.length === 0) return []

  const { data: batches } = await db
    .from('erp_product_batches')
    .select('product_id, current_quantity')
    .in('product_id', list.map(p => p.id))
    .gt('current_quantity', 0)
    .limit(5000)

  const onHand = new Map<string, number>()
  for (const b of (batches ?? []) as { product_id: string; current_quantity: number }[]) {
    onHand.set(b.product_id, (onHand.get(b.product_id) ?? 0) + Number(b.current_quantity))
  }

  return list
    .map(p => ({
      productId: p.id,
      productName: p.product_name,
      productCode: p.product_code,
      unit: p.unit,
      minStockLevel: p.min_stock_level,
      onHand: onHand.get(p.id) ?? 0,
    }))
    .filter(row => row.onHand <= row.minStockLevel)
    .sort((a, b) => a.onHand - b.onHand)
    .slice(0, limit)
}

/** Batches where the cached quantity disagrees with the ledger. An empty
 *  result is the expected, healthy state. */
export async function getReconciliationIssues() {
  const db = await erpDb()
  const { data, error } = await db.rpc('erp_reconcile_batch_quantities')
  if (error) {
    console.error('[erp] reconciliation check failed', error.message)
    return []
  }
  return (data ?? []) as unknown as {
    batch_id: string; product_name: string; batch_number: string
    cached_quantity: number; ledger_quantity: number
  }[]
}
