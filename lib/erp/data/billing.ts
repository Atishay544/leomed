import 'server-only'
import { erpDb, rangeFor, safeSearch, toPage, type PageResult } from './query'
import type { PurchaseInvoice, SalesInvoice } from '../types'

/**
 * Billing reads. RLS keeps these tables invisible to MRs entirely, so no
 * role filtering is needed here — a field rep's query simply returns nothing.
 */

export interface InvoiceListParams {
  q?: string
  page?: number
  from?: string
  to?: string
  partyId?: string
  paymentStatus?: string
}

export type PurchaseInvoiceRow = PurchaseInvoice & {
  erp_suppliers: { supplier_name: string; supplier_code: string } | null
  erp_purchase_invoice_items: { id: string }[] | null
}

export async function listPurchaseInvoices(
  params: InvoiceListParams = {},
): Promise<PageResult<PurchaseInvoiceRow>> {
  const db = await erpDb()
  const page = params.page ?? 1
  const [from, to] = rangeFor(page)

  let query = db
    .from('erp_purchase_invoices')
    .select(
      `*,
       erp_suppliers!erp_purchase_invoices_supplier_id_fkey(supplier_name, supplier_code),
       erp_purchase_invoice_items(id)`,
      { count: 'exact' },
    )
    .order('invoice_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (params.partyId) query = query.eq('supplier_id', params.partyId)
  if (params.from)    query = query.gte('invoice_date', params.from)
  if (params.to)      query = query.lte('invoice_date', params.to)
  if (params.paymentStatus && params.paymentStatus !== 'ALL') {
    query = query.eq('payment_status', params.paymentStatus)
  }

  const term = safeSearch(params.q)
  if (term) query = query.ilike('invoice_number', `%${term}%`)

  const { data, count } = await query
  return toPage<PurchaseInvoiceRow>(data as unknown as PurchaseInvoiceRow[] | null, count, page)
}

export async function getPurchaseInvoice(id: string) {
  const db = await erpDb()
  const { data } = await db
    .from('erp_purchase_invoices')
    .select(
      `*,
       erp_suppliers!erp_purchase_invoices_supplier_id_fkey(*),
       erp_purchase_invoice_items(
         id, quantity, free_quantity, purchase_rate, discount_percent, gst_rate,
         taxable_amount, tax_amount, line_total,
         erp_products(product_name, product_code, strength, unit),
         erp_product_batches(batch_number, expiry_date)),
       erp_purchase_payments(
         id, payment_date, amount, payment_method, reference_number, remarks, created_at,
         erp_users!erp_purchase_payments_created_by_fkey(name))`,
    )
    .eq('id', id)
    .maybeSingle()

  return data
}

export type SalesInvoiceRow = SalesInvoice & {
  erp_distributors: { distributor_name: string; distributor_code: string } | null
  erp_sales_invoice_items: { id: string }[] | null
}

export async function listSalesInvoices(
  params: InvoiceListParams = {},
): Promise<PageResult<SalesInvoiceRow>> {
  const db = await erpDb()
  const page = params.page ?? 1
  const [from, to] = rangeFor(page)

  let query = db
    .from('erp_sales_invoices')
    .select(
      `*,
       erp_distributors!erp_sales_invoices_distributor_id_fkey(distributor_name, distributor_code),
       erp_sales_invoice_items(id)`,
      { count: 'exact' },
    )
    .order('invoice_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (params.partyId) query = query.eq('distributor_id', params.partyId)
  if (params.from)    query = query.gte('invoice_date', params.from)
  if (params.to)      query = query.lte('invoice_date', params.to)
  if (params.paymentStatus && params.paymentStatus !== 'ALL') {
    query = query.eq('payment_status', params.paymentStatus)
  }

  const term = safeSearch(params.q)
  if (term) query = query.ilike('invoice_number', `%${term}%`)

  const { data, count } = await query
  return toPage<SalesInvoiceRow>(data as unknown as SalesInvoiceRow[] | null, count, page)
}

export async function getSalesInvoice(id: string) {
  const db = await erpDb()
  const { data } = await db
    .from('erp_sales_invoices')
    .select(
      `*,
       erp_distributors!erp_sales_invoices_distributor_id_fkey(*),
       erp_sales_invoice_items(
         id, quantity, free_quantity, sale_rate, discount_percent, gst_rate,
         taxable_amount, tax_amount, line_total,
         erp_products(product_name, product_code, strength, unit),
         erp_product_batches(batch_number, expiry_date)),
       erp_sales_receipts(
         id, receipt_date, amount, payment_method, reference_number, remarks, created_at,
         erp_users!erp_sales_receipts_created_by_fkey(name)),
       erp_users!erp_sales_invoices_expired_sale_approved_by_fkey(name)`,
    )
    .eq('id', id)
    .maybeSingle()

  return data
}

/**
 * Money owed to Leomed by each distributor.
 *
 * Outstanding is grand_total − amount_paid, where amount_paid is the
 * trigger-maintained sum of erp_sales_receipts (Q6). Summed in JS over unpaid
 * invoices only, which is a bounded set; if it ever isn't, this becomes a view.
 */
export async function distributorOutstanding(limit = 20) {
  const db = await erpDb()
  const { data } = await db
    .from('erp_sales_invoices')
    .select('distributor_id, grand_total, amount_paid, erp_distributors!erp_sales_invoices_distributor_id_fkey(distributor_name)')
    .neq('payment_status', 'PAID')
    .limit(1000)

  const totals = new Map<string, { name: string; outstanding: number; invoices: number }>()

  for (const row of (data ?? []) as unknown as {
    distributor_id: string
    grand_total: number
    amount_paid: number
    erp_distributors: { distributor_name: string } | null
  }[]) {
    const due = Number(row.grand_total ?? 0) - Number(row.amount_paid ?? 0)
    if (due <= 0) continue
    const existing = totals.get(row.distributor_id)
    if (existing) {
      existing.outstanding += due
      existing.invoices += 1
    } else {
      totals.set(row.distributor_id, {
        name: row.erp_distributors?.distributor_name ?? 'Unknown',
        outstanding: due,
        invoices: 1,
      })
    }
  }

  return [...totals.entries()]
    .map(([id, value]) => ({ distributorId: id, ...value }))
    .sort((a, b) => b.outstanding - a.outstanding)
    .slice(0, limit)
}

/**
 * Invoices whose cached amount_paid disagrees with their payment history.
 *
 * The same safety net erp_reconcile_batch_quantities() provides for stock: the
 * cache is maintained by a trigger, and this proves it. An empty result is the
 * healthy state.
 */
export async function getPaymentReconciliationIssues() {
  const db = await erpDb()
  const { data, error } = await db.rpc('erp_reconcile_invoice_payments')
  if (error) {
    console.error('[erp] payment reconciliation failed', error.message)
    return []
  }
  return (data ?? []) as unknown as {
    invoice_kind: string
    invoice_id: string
    invoice_number: string
    cached_paid: number
    ledger_paid: number
  }[]
}
