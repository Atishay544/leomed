'use server'

import { revalidatePath } from 'next/cache'
import { assertCapability } from '../auth'
import { erpDb } from '../data/query'
import { TravelAllowanceReviewSchema } from '../schemas'
import { friendlyDbError, invalid, runAction, type ActionState } from './shared'

/**
 * Travel allowance review — admin/HR only (payroll.manage, the same
 * capability that gates every other payroll-adjacent screen). The daily
 * amount itself is computed server-side by erp_compute_daily_travel_
 * allowance(); nothing here creates a row, only reviews one already sitting
 * PENDING.
 */

export async function reviewTravelAllowance(input: unknown): Promise<ActionState> {
  return runAction('Could not update the travel allowance.', async () => {
    const session = await assertCapability('payroll.manage')

    const parsed = TravelAllowanceReviewSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)

    const db = await erpDb()
    const { data: existing, error: fetchError } = await db
      .from('erp_mr_travel_allowance')
      .select('computed_amount')
      .eq('id', parsed.data.id)
      .maybeSingle()
    if (fetchError) return friendlyDbError(fetchError, 'Could not load the travel allowance.')
    if (!existing) return { ok: false, error: 'Travel allowance record not found.' }

    // Approving without typing a different figure just accepts what was
    // computed; rejecting always zeroes it out regardless of what was typed.
    const approvedAmount = parsed.data.status === 'REJECTED'
      ? 0
      : parsed.data.approved_amount ?? existing.computed_amount

    const { error } = await db
      .from('erp_mr_travel_allowance')
      .update({
        status: parsed.data.status,
        approved_amount: approvedAmount,
        notes: parsed.data.notes ?? null,
        reviewed_by: session.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', parsed.data.id)
    if (error) return friendlyDbError(error, 'Could not update the travel allowance.')

    revalidatePath('/erp/payroll/travel-allowance')
    return { ok: true }
  })
}

/** Approves every still-PENDING row currently shown (whatever the caller's
 *  filters landed on) at its OWN computed amount, in one action — the
 *  practical "review the whole month at once" path once the daily entries
 *  have piled up and none of them need adjusting individually.
 *
 *  Each row's approved_amount has to match ITS OWN computed_amount, not one
 *  shared value, so this can't be a single UPDATE ... SET approved_amount =
 *  <literal> — it fetches the current computed_amount per row first, then
 *  issues one update per row. A handful of rows at a time (a month's worth
 *  of pending days), not a scale where that round-trip count matters. */
export async function bulkApproveTravelAllowance(ids: string[]): Promise<ActionState> {
  return runAction('Could not approve the travel allowances.', async () => {
    const session = await assertCapability('payroll.manage')
    if (ids.length === 0) return { ok: false, error: 'Nothing selected to approve.' }

    const db = await erpDb()
    const { data: rows, error: fetchError } = await db
      .from('erp_mr_travel_allowance')
      .select('id, computed_amount')
      .in('id', ids)
      .eq('status', 'PENDING')
    if (fetchError) return friendlyDbError(fetchError, 'Could not load the travel allowances.')
    if (!rows || rows.length === 0) return { ok: false, error: 'Nothing pending to approve in that selection.' }

    const nowIso = new Date().toISOString()
    let approved = 0
    for (const row of rows) {
      const { error } = await db
        .from('erp_mr_travel_allowance')
        .update({
          status: 'APPROVED',
          approved_amount: row.computed_amount,
          reviewed_by: session.id,
          reviewed_at: nowIso,
        })
        .eq('id', row.id)
      if (!error) approved += 1
    }

    revalidatePath('/erp/payroll/travel-allowance')
    return { ok: true, data: { approved } }
  })
}
