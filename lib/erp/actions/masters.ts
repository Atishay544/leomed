'use server'

import { revalidatePath } from 'next/cache'
import type { z } from 'zod'
import { assertCapability } from '../auth'
import { erpDb } from '../data/query'
import {
  BankAccountSchema, ChemistSchema, DistributorSchema, DoctorSchema, ErpProductSchema,
  ProductBatchSchema, SupplierSchema,
} from '../schemas'
import type { Capability } from '../permissions'
import { friendlyDbError, invalid, runAction, type ActionState } from './shared'

/**
 * Master-data mutations.
 *
 * Every action re-checks its capability. Server actions are reachable by a
 * direct POST, not only through the form that renders them, so the UI having
 * hidden the button proves nothing (spec §51, and the Next.js data-security
 * guide says the same).
 *
 * Writes go through the caller's own RLS session, never the service-role
 * client — so the database independently enforces the same rule.
 */

/** FormData → plain object for Zod. Unchecked checkboxes are simply absent,
 *  which the schemas' `.default(false)` handles. */
function formObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') out[key] = value
  }
  return out
}

interface MasterConfig {
  table: string
  capability: Capability
  path: string
  /** Used in the fallback error message: "Could not save the doctor." */
  label: string
}

async function saveMaster<S extends z.ZodType>(
  cfg: MasterConfig,
  schema: S,
  formData: FormData,
): Promise<ActionState> {
  return runAction(`Could not save the ${cfg.label}. Please try again.`, async () => {
    const session = await assertCapability(cfg.capability)

    const parsed = schema.safeParse(formObject(formData))
    if (!parsed.success) return invalid(parsed.error)

    const id = String(formData.get('id') ?? '').trim()
    const db = await erpDb()
    const values = parsed.data as Record<string, unknown>

    if (id) {
      const { error, count } = await db
        .from(cfg.table)
        .update({ ...values, updated_by: session.id }, { count: 'exact' })
        .eq('id', id)
      if (error) return friendlyDbError(error, `Could not update the ${cfg.label}.`)
      // Past the MR edit window, or someone else's record, RLS filters the
      // row out rather than raising — 0 rows affected, reported by .update()
      // as ordinary success unless checked here.
      if (!count) {
        return {
          ok: false,
          error: `Could not update this ${cfg.label} — it may be outside your edit window, or you may not have access to it.`,
        }
      }
    } else {
      const { error } = await db
        .from(cfg.table)
        .insert({ ...values, created_by: session.id, updated_by: session.id })
      if (error) return friendlyDbError(error, `Could not add the ${cfg.label}.`)
    }

    revalidatePath(cfg.path)
    return { ok: true }
  })
}

async function setMasterActive(
  cfg: Omit<MasterConfig, 'label'> & { label: string },
  id: string,
  active: boolean,
): Promise<ActionState> {
  return runAction(`Could not update the ${cfg.label}.`, async () => {
    const session = await assertCapability(cfg.capability)
    const db = await erpDb()

    // Deactivation, not deletion — visits and invoices must keep their subject
    // (spec §34).
    const { error, count } = await db
      .from(cfg.table)
      .update({ active, updated_by: session.id }, { count: 'exact' })
      .eq('id', id)

    if (error) return friendlyDbError(error, `Could not update the ${cfg.label}.`)
    // RLS filtering out a row you can't touch is not an error — it's zero
    // rows affected, which .update() alone reports as success. Checked
    // explicitly so a blocked attempt is never shown as "saved".
    if (!count) {
      return { ok: false, error: `That ${cfg.label} could not be found, or you cannot change it.` }
    }
    revalidatePath(cfg.path)
    return { ok: true }
  })
}

// ─── Doctors ────────────────────────────────────────────────────────────────

const DOCTOR: MasterConfig = {
  table: 'erp_doctors',
  // MRs add doctors from the field; that is the whole point of the workflow.
  capability: 'masters.create_customer',
  path: '/erp/masters/doctors',
  label: 'doctor',
}

export async function saveDoctor(_prev: ActionState, formData: FormData) {
  return saveMaster(DOCTOR, DoctorSchema, formData)
}

/**
 * Activating/deactivating a doctor is administrative, not a byproduct of
 * "may create customers" — that capability lets an MR add new doctors, not
 * retire a shared record other reps depend on. `masters.create_customer` is
 * held by MR, so this checks ADMIN explicitly rather than reusing DOCTOR's
 * capability, and calls the DB function that does the same check server-side
 * (erp_doctors.active is no longer directly writable by non-admins at all).
 */
export async function setDoctorActive(id: string, active: boolean): Promise<ActionState> {
  return runAction('Could not update the doctor.', async () => {
    const session = await assertCapability('masters.create_customer')
    if (session.role !== 'ADMIN') {
      return { ok: false, error: 'Only an administrator can activate or deactivate a doctor.' }
    }

    const db = await erpDb()
    const { error } = await db.rpc('erp_set_doctor_active', { p_doctor: id, p_active: active })
    if (error) return friendlyDbError(error, 'Could not update the doctor.')

    revalidatePath(DOCTOR.path)
    return { ok: true }
  })
}

// ─── Chemists ───────────────────────────────────────────────────────────────

const CHEMIST: MasterConfig = {
  table: 'erp_chemists',
  capability: 'masters.create_customer',
  path: '/erp/masters/chemists',
  label: 'chemist',
}

export async function saveChemist(_prev: ActionState, formData: FormData) {
  return saveMaster(CHEMIST, ChemistSchema, formData)
}

/** Same reasoning as setDoctorActive: administrative, ADMIN-only, and routed
 *  through the DB function now that active isn't in the direct grant. */
export async function setChemistActive(id: string, active: boolean): Promise<ActionState> {
  return runAction('Could not update the chemist.', async () => {
    const session = await assertCapability('masters.create_customer')
    if (session.role !== 'ADMIN') {
      return { ok: false, error: 'Only an administrator can activate or deactivate a chemist.' }
    }

    const db = await erpDb()
    const { error } = await db.rpc('erp_set_chemist_active', { p_chemist: id, p_active: active })
    if (error) return friendlyDbError(error, 'Could not update the chemist.')

    revalidatePath(CHEMIST.path)
    return { ok: true }
  })
}

// ─── Distributors & suppliers (trade partners — accounting owns these) ──────

const DISTRIBUTOR: MasterConfig = {
  table: 'erp_distributors',
  capability: 'masters.write',
  path: '/erp/masters/distributors',
  label: 'distributor',
}

export async function saveDistributor(_prev: ActionState, formData: FormData) {
  return saveMaster(DISTRIBUTOR, DistributorSchema, formData)
}

export async function setDistributorActive(id: string, active: boolean) {
  return setMasterActive(DISTRIBUTOR, id, active)
}

const SUPPLIER: MasterConfig = {
  table: 'erp_suppliers',
  capability: 'billing.purchase.write',
  path: '/erp/masters/suppliers',
  label: 'supplier',
}

export async function saveSupplier(_prev: ActionState, formData: FormData) {
  return saveMaster(SUPPLIER, SupplierSchema, formData)
}

export async function setSupplierActive(id: string, active: boolean) {
  return setMasterActive(SUPPLIER, id, active)
}

// ─── Bank accounts ──────────────────────────────────────────────────────────
// Admin can keep several on file (different banks/branches); whichever one
// is "selected" via selectBankAccount() below is the one printed on sales
// invoices — a single admin-wide choice, not a per-invoice one.

const BANK_ACCOUNT: MasterConfig = {
  table: 'erp_bank_accounts',
  capability: 'settings.manage',
  path: '/erp/settings',
  label: 'bank account',
}

export async function saveBankAccount(_prev: ActionState, formData: FormData) {
  return saveMaster(BANK_ACCOUNT, BankAccountSchema, formData)
}

export async function setBankAccountActive(id: string, active: boolean) {
  return setMasterActive(BANK_ACCOUNT, id, active)
}

export async function selectBankAccount(id: string): Promise<ActionState> {
  return runAction('Could not update the selected bank account.', async () => {
    await assertCapability(BANK_ACCOUNT.capability)
    const db = await erpDb()
    const { error } = await db.from('erp_settings').update({ selected_bank_account_id: id }).eq('id', 1)
    if (error) return friendlyDbError(error, 'Could not update the selected bank account.')

    revalidatePath(BANK_ACCOUNT.path)
    revalidatePath('/erp', 'layout')
    return { ok: true }
  })
}

// ─── Products & batches ─────────────────────────────────────────────────────

const PRODUCT: MasterConfig = {
  table: 'erp_products',
  // Admin only: an MR picking products must never be able to reprice them.
  // A dedicated capability, not the broader masters.write ACCOUNTANT also
  // holds for distributors/suppliers — erp_products' RLS is admin-only, and
  // sharing the capability let an accountant "successfully" submit an edit
  // that RLS then silently dropped (pre-PR review finding).
  capability: 'products.write',
  path: '/erp/masters/products',
  label: 'product',
}

/**
 * Not a plain saveMaster() delegation: after the product row is written,
 * this also keeps the product's DEFAULT pricing rules (erp_pricing_rules,
 * customer_id columns all null) in sync — so this dialog stays the one
 * place Admin edits default prices, while every edit becomes a new,
 * versioned, audited rule underneath (spec §17) rather than an overwrite.
 * Distributor margin is computed as % of the retailer price (PTR), never of
 * MRP — see PricingFields.tsx and erp_default_ptr().
 */
export async function saveProduct(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('Could not save the product. Please try again.', async () => {
    const session = await assertCapability(PRODUCT.capability)

    const parsed = ErpProductSchema.safeParse(formObject(formData))
    if (!parsed.success) return invalid(parsed.error)

    const id = String(formData.get('id') ?? '').trim()
    const db = await erpDb()
    const values = parsed.data as Record<string, unknown>
    let productId = id

    if (id) {
      const { error, count } = await db
        .from(PRODUCT.table)
        .update({ ...values, updated_by: session.id }, { count: 'exact' })
        .eq('id', id)
      if (error) return friendlyDbError(error, 'Could not update the product.')
      if (!count) {
        return { ok: false, error: 'Could not update this product — you may not have access to it.' }
      }
    } else {
      const { data, error } = await db
        .from(PRODUCT.table)
        .insert({ ...values, created_by: session.id, updated_by: session.id })
        .select('id')
        .single()
      if (error) return friendlyDbError(error, 'Could not add the product.')
      productId = (data as { id: string }).id
    }

    const mrp = Number(values.mrp)
    const retailerPrice = Number(values.retailer_price)
    const distributorPrice = Number(values.distributor_price)

    if (productId && mrp > 0) {
      const retailerPct = Math.max(0, Math.min(100, (1 - retailerPrice / mrp) * 100))
      await db.rpc('erp_set_product_default_price', {
        p_product_id: productId, p_customer_type: 'CHEMIST',
        p_basis: 'MRP', p_method: 'MARGIN', p_percentage: retailerPct,
      })

      if (retailerPrice > 0) {
        const distributorPct = Math.max(0, Math.min(100, (1 - distributorPrice / retailerPrice) * 100))
        await db.rpc('erp_set_product_default_price', {
          p_product_id: productId, p_customer_type: 'DISTRIBUTOR',
          p_basis: 'PTR', p_method: 'MARGIN', p_percentage: distributorPct,
        })
      }
    }

    revalidatePath(PRODUCT.path)
    return { ok: true }
  })
}

export async function setProductActive(id: string, active: boolean) {
  return setMasterActive(PRODUCT, id, active)
}

/**
 * Permanently removes a product row — distinct from setProductActive()'s
 * deactivation, which is the normal way to retire one. erp_delete_product_
 * permanently() refuses (with a specific, friendly message) if any batch,
 * invoice or visit has ever referenced this product; only a product that
 * was added by mistake or never actually used can be deleted this way.
 */
export async function deletePermanentlyProduct(id: string): Promise<ActionState> {
  return runAction('Could not delete this product.', async () => {
    await assertCapability(PRODUCT.capability)

    const db = await erpDb()
    const { error } = await db.rpc('erp_delete_product_permanently', { p_product_id: id })
    if (error) return friendlyDbError(error, 'Could not delete this product.')

    revalidatePath(PRODUCT.path)
    return { ok: true }
  })
}

/**
 * Opens a batch. Note what this does NOT accept: a quantity. Stock only ever
 * arrives through a purchase invoice or a recorded adjustment, so a new batch
 * starts empty by construction (spec §15, §16).
 */
export async function saveBatch(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('Could not save the batch. Please try again.', async () => {
    const session = await assertCapability('billing.purchase.write')

    const parsed = ProductBatchSchema.safeParse(formObject(formData))
    if (!parsed.success) return invalid(parsed.error)

    const db = await erpDb()
    const id = String(formData.get('id') ?? '').trim()

    if (id) {
      // A batch cannot be moved to a different product: its ledger history and
      // the invoice lines pointing at it belong to the product it was opened for.
      const editable = { ...parsed.data } as Record<string, unknown>
      delete editable.product_id

      const { error, count } = await db
        .from('erp_product_batches')
        .update(editable, { count: 'exact' })
        .eq('id', id)
      if (error) return friendlyDbError(error, 'Could not update the batch.')
      if (!count) return { ok: false, error: 'That batch could not be found.' }
    } else {
      const { error } = await db
        .from('erp_product_batches')
        .insert({ ...parsed.data, created_by: session.id })
      if (error) return friendlyDbError(error, 'Could not add the batch.')
    }

    revalidatePath('/erp/masters/batches')
    revalidatePath('/erp/accounting/inventory')
    return { ok: true }
  })
}
