'use server'

import { revalidatePath } from 'next/cache'
import { assertCapability } from '../auth'
import { erpDb } from '../data/query'
import { PricingRuleSchema, SchemeSchema, SchemeStatusSchema } from '../schemas'
import { friendlyDbError, invalid, runAction, type ActionState } from './shared'

/**
 * Pricing-rule and scheme mutations — all admin-only (pricing.manage).
 *
 * Creating/updating an erp_pricing_rules row is a plain RLS-guarded table
 * write: the erp_pricing_rules_overlap trigger (spec §25 — "never silently
 * choose one") fires on every insert/update regardless of how it got there,
 * so there is nothing extra to enforce here. Schemes go through
 * erp_save_scheme() because a scheme's customer-target list must replace
 * atomically alongside the scheme row itself.
 */

export async function savePricingRule(input: unknown): Promise<ActionState> {
  return runAction('Could not save the pricing rule.', async () => {
    const session = await assertCapability('pricing.manage')

    const parsed = PricingRuleSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)

    const db = await erpDb()
    const { error } = await db.from('erp_pricing_rules').insert({
      ...parsed.data,
      status: 'ACTIVE',
      version: 1,
      created_by: session.id,
      updated_by: session.id,
    })
    if (error) return friendlyDbError(error, 'Could not save the pricing rule.')

    revalidatePath('/erp/pricing/negotiated')
    return { ok: true }
  })
}

export async function setPricingRuleStatus(ruleId: string, status: 'ACTIVE' | 'INACTIVE' | 'CANCELLED'): Promise<ActionState> {
  return runAction('Could not update the pricing rule.', async () => {
    const session = await assertCapability('pricing.manage')

    const db = await erpDb()
    const { error } = await db
      .from('erp_pricing_rules')
      .update({ status, updated_by: session.id })
      .eq('id', ruleId)
    if (error) return friendlyDbError(error, 'Could not update the pricing rule.')

    revalidatePath('/erp/pricing/negotiated')
    return { ok: true }
  })
}

export async function saveScheme(input: unknown): Promise<ActionState> {
  return runAction('Could not save the scheme.', async () => {
    await assertCapability('pricing.manage')

    const parsed = SchemeSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)

    const { customers, ...scheme } = parsed.data
    const db = await erpDb()
    const { data, error } = await db.rpc('erp_save_scheme', {
      p_scheme: scheme,
      p_customers: customers,
    })
    if (error) return friendlyDbError(error, 'Could not save the scheme.')

    revalidatePath('/erp/pricing/schemes')
    return { ok: true, data: data as Record<string, unknown> }
  })
}

export async function setSchemeStatus(input: unknown): Promise<ActionState> {
  return runAction('Could not update the scheme.', async () => {
    const session = await assertCapability('pricing.manage')

    const parsed = SchemeStatusSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)

    const db = await erpDb()
    const { error } = await db
      .from('erp_schemes')
      .update({ status: parsed.data.status, updated_by: session.id })
      .eq('id', parsed.data.scheme_id)
    if (error) return friendlyDbError(error, 'Could not update the scheme.')

    revalidatePath('/erp/pricing/schemes')
    return { ok: true }
  })
}

/**
 * The one entry point every sales-invoice-facing screen calls for a price —
 * erp_explain_price() shapes its answer by the caller's own role (admin vs
 * everyone else), so this action never has to know or enforce that itself.
 */
export async function resolvePrice(input: {
  productId: string
  customerType: 'DISTRIBUTOR' | 'CHEMIST' | 'DOCTOR'
  distributorId?: string
  chemistId?: string
  doctorId?: string
  invoiceDate: string
  paidQty?: number
  // The batch actually selected for this line, when one has been (FEFO
  // preselects one the moment stock loads) — its own mrp, if set, overrides
  // the product master's for an MRP-basis rule/scheme, matching what
  // erp_save_sales_invoice() will actually bill.
  batchId?: string
}): Promise<ActionState> {
  return runAction('Could not calculate the price for this product.', async () => {
    await assertCapability('billing.sales.write')

    const db = await erpDb()
    const { data, error } = await db.rpc('erp_explain_price', {
      p_product_id: input.productId,
      p_customer_type: input.customerType,
      p_distributor_id: input.distributorId ?? null,
      p_chemist_id: input.chemistId ?? null,
      p_doctor_id: input.doctorId ?? null,
      p_invoice_date: input.invoiceDate,
      p_paid_qty: input.paidQty ?? 0,
      p_batch_id: input.batchId || null,
    })
    if (error) return friendlyDbError(error, 'Could not calculate the price for this product.')

    return { ok: true, data: data as Record<string, unknown> }
  })
}
