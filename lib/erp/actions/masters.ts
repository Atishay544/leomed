'use server'

import { revalidatePath } from 'next/cache'
import type { z } from 'zod'
import { assertCapability } from '../auth'
import { erpDb } from '../data/query'
import {
  ChemistSchema, DistributorSchema, DoctorSchema, ErpProductSchema,
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
      const { error } = await db
        .from(cfg.table)
        .update({ ...values, updated_by: session.id })
        .eq('id', id)
      if (error) return friendlyDbError(error, `Could not update the ${cfg.label}.`)
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
    const { error } = await db
      .from(cfg.table)
      .update({ active, updated_by: session.id })
      .eq('id', id)

    if (error) return friendlyDbError(error, `Could not update the ${cfg.label}.`)
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

export async function setDoctorActive(id: string, active: boolean) {
  return setMasterActive(DOCTOR, id, active)
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

export async function setChemistActive(id: string, active: boolean) {
  return setMasterActive(CHEMIST, id, active)
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

// ─── Products & batches ─────────────────────────────────────────────────────

const PRODUCT: MasterConfig = {
  table: 'erp_products',
  // Admin only: an MR picking products must never be able to reprice them.
  capability: 'masters.write',
  path: '/erp/masters/products',
  label: 'product',
}

export async function saveProduct(_prev: ActionState, formData: FormData) {
  return saveMaster(PRODUCT, ErpProductSchema, formData)
}

export async function setProductActive(id: string, active: boolean) {
  return setMasterActive(PRODUCT, id, active)
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

      const { error } = await db.from('erp_product_batches').update(editable).eq('id', id)
      if (error) return friendlyDbError(error, 'Could not update the batch.')
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
