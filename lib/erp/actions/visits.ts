'use server'

import { revalidatePath } from 'next/cache'
import { assertCapability } from '../auth'
import { erpDb } from '../data/query'
import {
  ChemistVisitSchema, DoctorVisitSchema, FieldOrderStatusSchema, FollowupUpdateSchema,
} from '../schemas'
import { friendlyDbError, invalid, runAction, type ActionState } from './shared'

/**
 * Field-force mutations.
 *
 * Visits are written by a single PostgreSQL function rather than a sequence of
 * inserts from here. A visit that creates a doctor, records five products, a
 * field order with its lines and a follow-up must either land whole or not at
 * all — a network drop halfway through must not leave a doctor with no visit,
 * or an order with no items (spec §23).
 *
 * A note on what these do NOT do: recording a field order never creates a
 * sales invoice and never moves stock. Those are separate business events
 * (spec §29, §62).
 */

export async function createDoctorVisit(input: unknown): Promise<ActionState> {
  return runAction(
    'Could not save the visit. Check your connection and try again — nothing has been saved yet.',
    async () => {
      const session = await assertCapability('visits.create')

      const parsed = DoctorVisitSchema.safeParse(input)
      if (!parsed.success) return invalid(parsed.error)

      const db = await erpDb()
      const { data, error } = await db.rpc('erp_create_doctor_visit', {
        p_payload: parsed.data,
      })

      if (error) return friendlyDbError(error, 'Could not save the visit.')

      const result = (data ?? {}) as Record<string, unknown>

      revalidatePath('/erp/mr')
      revalidatePath('/erp/mr/doctor-visits')
      revalidatePath('/erp/mr/orders')
      revalidatePath('/erp/mr/followups')
      revalidatePath('/erp/masters/doctors')

      return {
        ok: true,
        data: {
          ...result,
          // The RPC reports whether it recognised a retry, so the UI can say
          // "already saved" instead of implying a second visit was recorded.
          mrId: session.id,
        },
      }
    },
  )
}

export async function createChemistVisit(input: unknown): Promise<ActionState> {
  return runAction(
    'Could not save the visit. Check your connection and try again — nothing has been saved yet.',
    async () => {
      const session = await assertCapability('visits.create')

      const parsed = ChemistVisitSchema.safeParse(input)
      if (!parsed.success) return invalid(parsed.error)

      const db = await erpDb()
      const { data, error } = await db.rpc('erp_create_chemist_visit', {
        p_payload: parsed.data,
      })

      if (error) return friendlyDbError(error, 'Could not save the visit.')

      revalidatePath('/erp/mr')
      revalidatePath('/erp/mr/chemist-visits')
      revalidatePath('/erp/mr/orders')
      revalidatePath('/erp/mr/followups')
      revalidatePath('/erp/masters/chemists')

      return { ok: true, data: { ...((data ?? {}) as Record<string, unknown>), mrId: session.id } }
    },
  )
}

/**
 * Moves a field order along its demand-tracking statuses. FULFILLED records
 * that the distributor network served the order — it raises no invoice and
 * deducts no stock.
 */
export async function setFieldOrderStatus(input: unknown): Promise<ActionState> {
  return runAction('Could not update the order status.', async () => {
    await assertCapability('orders.manage_status')

    const parsed = FieldOrderStatusSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)

    const db = await erpDb()
    const { error } = await db.rpc('erp_set_field_order_status', {
      p_order_id: parsed.data.order_id,
      p_status:   parsed.data.status,
      p_remarks:  parsed.data.remarks ?? null,
    })

    if (error) return friendlyDbError(error, 'Could not update the order status.')

    revalidatePath('/erp/mr/orders')
    revalidatePath('/erp/orders')
    return { ok: true }
  })
}

export async function updateFollowupStatus(input: unknown): Promise<ActionState> {
  return runAction('Could not update the follow-up.', async () => {
    await assertCapability('followups.manage')

    const parsed = FollowupUpdateSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)

    const db = await erpDb()
    const { error, count } = await db
      .from('erp_followups')
      .update({
        status: parsed.data.status,
        // The CHECK constraint requires a timestamp whenever status is
        // COMPLETED, so it is set here rather than left to the caller.
        completed_at: parsed.data.status === 'COMPLETED' ? new Date().toISOString() : null,
      }, { count: 'exact' })
      .eq('id', parsed.data.followup_id)

    if (error) return friendlyDbError(error, 'Could not update the follow-up.')
    // Someone else's follow-up is filtered out by RLS, not rejected with an
    // error — 0 rows affected, which must not read as "updated".
    if (!count) {
      return { ok: false, error: 'That follow-up could not be found, or you cannot change it.' }
    }

    revalidatePath('/erp/mr/followups')
    revalidatePath('/erp/mr')
    return { ok: true }
  })
}
