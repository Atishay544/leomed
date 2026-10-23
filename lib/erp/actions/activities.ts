'use server'

import { revalidatePath } from 'next/cache'
import { assertCapability } from '../auth'
import { erpDb } from '../data/query'
import { ActivityRequestSchema, ActivityReviewSchema } from '../schemas'
import { friendlyDbError, invalid, runAction, type ActionState } from './shared'

function formObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') out[key] = value
  }
  return out
}

function revalidateActivities() {
  revalidatePath('/erp/activities')
  revalidatePath('/erp/activities/approvals')
  revalidatePath('/erp/activities/records')
}

/**
 * Raise a request. The chosen doctor/chemist is first re-read under the
 * caller's OWN session, so RLS decides whether they may reference that
 * record at all (an MR only sees doctors/chemists in their own areas) —
 * the RPC itself, being SECURITY DEFINER, only checks it exists and is
 * active. Routing, status and the approval trail are all set by the RPC.
 */
export async function raiseActivityRequest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('Could not submit the activity request.', async () => {
    await assertCapability('activities.request')

    const parsed = ActivityRequestSchema.safeParse(formObject(formData))
    if (!parsed.success) return invalid(parsed.error)
    const input = parsed.data

    const db = await erpDb()
    const { data: target } = await db
      .from(input.target_type === 'DOCTOR' ? 'erp_doctors' : 'erp_chemists')
      .select('id')
      .eq('id', input.target_id)
      .maybeSingle()
    if (!target) {
      return {
        ok: false,
        error: `That ${input.target_type === 'DOCTOR' ? 'doctor' : 'chemist'} is not available to you.`,
        fieldErrors: { target_id: ['Choose a valid record'] },
      }
    }

    const { data, error } = await db.rpc('erp_raise_activity_request', {
      p_target_type:   input.target_type,
      p_target_id:     input.target_id,
      p_activity_type: input.activity_type,
      p_budget:        input.budget,
      p_description:   input.description ?? null,
      p_planned_date:  input.planned_date ?? null,
    })
    if (error) return friendlyDbError(error, 'Could not submit the activity request.')

    revalidateActivities()
    return { ok: true, data: { status: (data as { status?: string } | null)?.status ?? 'PENDING' } }
  })
}

/** Approve or reject one level. Whether the caller is allowed (the current
 *  approver, or any admin) is decided inside erp_review_activity_request(). */
export async function reviewActivityRequest(input: unknown): Promise<ActionState> {
  return runAction('Could not update the activity request.', async () => {
    await assertCapability('activities.approve')

    const parsed = ActivityReviewSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)

    const db = await erpDb()
    const { error } = await db.rpc('erp_review_activity_request', {
      p_request_id: parsed.data.request_id,
      p_decision:   parsed.data.decision,
      p_remarks:    parsed.data.remarks ?? null,
    })
    if (error) return friendlyDbError(error, 'Could not update the activity request.')

    revalidateActivities()
    return { ok: true }
  })
}

export async function cancelActivityRequest(requestId: string): Promise<ActionState> {
  return runAction('Could not cancel the activity request.', async () => {
    await assertCapability('activities.request')

    const db = await erpDb()
    const { error } = await db.rpc('erp_cancel_activity_request', { p_request_id: requestId })
    if (error) return friendlyDbError(error, 'Could not cancel the activity request.')

    revalidateActivities()
    return { ok: true }
  })
}
