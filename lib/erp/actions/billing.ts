'use server'

import { revalidatePath } from 'next/cache'
import { assertCapability } from '../auth'
import { erpDb } from '../data/query'
import {
  DeletePaymentSchema, InventoryAdjustmentSchema, PurchaseInvoiceSchema,
  PurchasePaymentSchema, SalesInvoiceSchema, SalesReceiptSchema,
} from '../schemas'
import { friendlyDbError, invalid, runAction, type ActionState } from './shared'

/**
 * Billing and inventory mutations.
 *
 * Note what these schemas do NOT contain: subtotal, tax, or grand_total. Every
 * money figure is recomputed in PostgreSQL from the line items, so a tampered
 * or simply stale total submitted by the browser is discarded rather than
 * stored (spec §52).
 *
 * Both invoice functions map to a single database transaction that writes the
 * invoice, its items, the batches, the inventory ledger and any opening
 * payment together. A sale that would take a batch negative, or sell expired
 * stock without an administrator's recorded authorisation, aborts the whole
 * invoice rather than leaving stock and paperwork disagreeing.
 */

export async function savePurchaseInvoice(input: unknown): Promise<ActionState> {
  return runAction('Could not save the purchase invoice. Please try again.', async () => {
    await assertCapability('billing.purchase.write')

    const parsed = PurchaseInvoiceSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)

    const db = await erpDb()
    const { data, error } = await db.rpc('erp_save_purchase_invoice', { p_payload: parsed.data })

    if (error) return friendlyDbError(error, 'Could not save the purchase invoice.')

    revalidatePath('/erp/accounting/purchases')
    revalidatePath('/erp/accounting/inventory')
    revalidatePath('/erp/masters/batches')
    revalidatePath('/erp/dashboard')

    return { ok: true, data: (data ?? {}) as Record<string, unknown> }
  })
}

export async function saveSalesInvoice(input: unknown): Promise<ActionState> {
  return runAction('Could not save the sales invoice. Please try again.', async () => {
    await assertCapability('billing.sales.write')

    const parsed = SalesInvoiceSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)

    const db = await erpDb()
    const { data, error } = await db.rpc('erp_save_sales_invoice', { p_payload: parsed.data })

    // Stock shortfalls and expiry blocks are raised by the RPC with messages
    // written for a human ("Only 12 units of … in stock"), and pass through.
    if (error) return friendlyDbError(error, 'Could not save the sales invoice.')

    revalidatePath('/erp/accounting/sales')
    revalidatePath('/erp/accounting/inventory')
    revalidatePath('/erp/masters/batches')
    revalidatePath('/erp/dashboard')

    return { ok: true, data: (data ?? {}) as Record<string, unknown> }
  })
}

/**
 * Records one payment to a supplier (Q6).
 *
 * An invoice can have many. The balance and the payment status are derived by
 * database triggers from the rows in erp_purchase_payments — there is no
 * writable "amount paid" to disagree with them. A payment that would take the
 * total past the invoice value is refused by the database.
 */
export async function recordPurchasePayment(input: unknown): Promise<ActionState> {
  return runAction('Could not record the payment.', async () => {
    const session = await assertCapability('billing.purchase.write')

    const parsed = PurchasePaymentSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)

    const db = await erpDb()
    const { error } = await db.from('erp_purchase_payments').insert({
      ...parsed.data,
      created_by: session.id,
    })

    // The overpayment guard raises a message written for a human
    // ("… would exceed invoice … balance …"), which passes straight through.
    if (error) return friendlyDbError(error, 'Could not record the payment.')

    revalidatePath('/erp/accounting/purchases')
    revalidatePath(`/erp/accounting/purchases/${parsed.data.purchase_invoice_id}`)
    revalidatePath('/erp/dashboard')
    return { ok: true }
  })
}

/** Records one receipt from a distributor. Mirror of the above (Q6). */
export async function recordSalesReceipt(input: unknown): Promise<ActionState> {
  return runAction('Could not record the receipt.', async () => {
    const session = await assertCapability('billing.sales.write')

    const parsed = SalesReceiptSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)

    const db = await erpDb()
    const { error } = await db.from('erp_sales_receipts').insert({
      ...parsed.data,
      created_by: session.id,
    })

    if (error) return friendlyDbError(error, 'Could not record the receipt.')

    revalidatePath('/erp/accounting/sales')
    revalidatePath(`/erp/accounting/sales/${parsed.data.sales_invoice_id}`)
    revalidatePath('/erp/dashboard')
    return { ok: true }
  })
}

/**
 * Removes a payment record. Administrators only — this rewrites financial
 * history, and RLS enforces the same restriction independently. The audit
 * trigger keeps the deleted row's contents.
 */
export async function deletePayment(
  kind: 'purchase' | 'sales',
  input: unknown,
): Promise<ActionState> {
  return runAction('Could not remove the entry.', async () => {
    const session = await assertCapability(
      kind === 'purchase' ? 'billing.purchase.write' : 'billing.sales.write',
    )

    // The RLS policy already restricts DELETE to administrators, but a policy
    // that matches no rows deletes nothing and reports success — which would
    // look to an accountant like the entry had been removed. Checked here so
    // they get told instead.
    if (session.role !== 'ADMIN') {
      return { ok: false, error: 'Only an administrator can remove a recorded payment.' }
    }

    const parsed = DeletePaymentSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)

    const table = kind === 'purchase' ? 'erp_purchase_payments' : 'erp_sales_receipts'
    const db = await erpDb()

    const { error, count } = await db
      .from(table)
      .delete({ count: 'exact' })
      .eq('id', parsed.data.payment_id)

    if (error) return friendlyDbError(error, 'Could not remove the entry.')
    if (!count) {
      return { ok: false, error: 'That entry no longer exists, or you cannot remove it.' }
    }

    revalidatePath(`/erp/accounting/${kind === 'purchase' ? 'purchases' : 'sales'}`)
    revalidatePath('/erp/dashboard')
    return { ok: true }
  })
}

/**
 * Manual stock movement. Quantity is entered as a positive number; the
 * direction comes from the transaction type, so an "adjustment in" can never
 * silently remove stock. A reason is mandatory at every layer — form, schema,
 * and a CHECK constraint on the table (spec §16).
 */
export async function adjustInventory(input: unknown): Promise<ActionState> {
  return runAction('Could not record the stock adjustment.', async () => {
    await assertCapability('inventory.adjust')

    const parsed = InventoryAdjustmentSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)

    const db = await erpDb()
    const { error } = await db.rpc('erp_adjust_inventory', {
      p_batch_id: parsed.data.batch_id,
      p_type:     parsed.data.transaction_type,
      p_quantity: parsed.data.quantity,
      p_remarks:  parsed.data.remarks,
      p_date:     parsed.data.transaction_date,
    })

    if (error) return friendlyDbError(error, 'Could not record the stock adjustment.')

    revalidatePath('/erp/accounting/inventory')
    revalidatePath('/erp/masters/batches')
    return { ok: true }
  })
}
