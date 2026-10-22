'use server'

import { revalidatePath } from 'next/cache'
import { assertCapability } from '../auth'
import { erpDb } from '../data/query'
import { TravelAllowanceReviewSchema, TravelDaySchema } from '../schemas'
import { friendlyDbError, invalid, runAction, type ActionState } from './shared'

function formObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') out[key] = value
  }
  return out
}

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
      .select('computed_ta_amount, computed_da_amount')
      .eq('id', parsed.data.id)
      .maybeSingle()
    if (fetchError) return friendlyDbError(fetchError, 'Could not load the travel allowance.')
    if (!existing) return { ok: false, error: 'Travel allowance record not found.' }

    // Approving without typing a different figure just accepts what was
    // computed; rejecting always zeroes both out regardless of what was
    // typed — one decision for the day, covering TA and DA together.
    const approvedTaAmount = parsed.data.status === 'REJECTED'
      ? 0
      : parsed.data.approved_ta_amount ?? existing.computed_ta_amount
    const approvedDaAmount = parsed.data.status === 'REJECTED'
      ? 0
      : parsed.data.approved_da_amount ?? existing.computed_da_amount

    const { error } = await db
      .from('erp_mr_travel_allowance')
      .update({
        status: parsed.data.status,
        approved_ta_amount: approvedTaAmount,
        approved_da_amount: approvedDaAmount,
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
 *  filters landed on) at its OWN computed TA and DA amounts, in one action —
 *  the practical "review the whole month at once" path once the daily
 *  entries have piled up and none of them need adjusting individually.
 *
 *  Each row's approved amounts have to match ITS OWN computed amounts, not
 *  one shared value, so this can't be a single UPDATE ... SET approved_ta_
 *  amount = <literal> — it fetches the current computed amounts per row
 *  first, then issues one update per row. A handful of rows at a time (a
 *  month's worth of pending days), not a scale where that round-trip count
 *  matters. */
export async function bulkApproveTravelAllowance(ids: string[]): Promise<ActionState> {
  return runAction('Could not approve the travel allowances.', async () => {
    const session = await assertCapability('payroll.manage')
    if (ids.length === 0) return { ok: false, error: 'Nothing selected to approve.' }

    const db = await erpDb()
    const { data: rows, error: fetchError } = await db
      .from('erp_mr_travel_allowance')
      .select('id, computed_ta_amount, computed_da_amount')
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
          approved_ta_amount: row.computed_ta_amount,
          approved_da_amount: row.computed_da_amount,
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

/**
 * Ad-hoc trip days — admin/HR assigns an employee a daily travel allowance
 * for a specific date range directly (e.g. "sending them to Delhi for 3
 * days"). A decision, not an inference, so unlike the per-area MR rows
 * above there's no review step — it's live for payroll the moment it's
 * saved (erp_recalculate_payroll_record only counts days within the range
 * the employee was actually present).
 */
export async function saveTravelDay(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('Could not save the travel days.', async () => {
    const session = await assertCapability('payroll.manage')

    const parsed = TravelDaySchema.safeParse(formObject(formData))
    if (!parsed.success) return invalid(parsed.error)

    const db = await erpDb()
    const { error } = await db.from('erp_employee_travel_days').insert({
      ...parsed.data,
      created_by: session.id,
    })
    if (error) return friendlyDbError(error, 'Could not save the travel days.')

    revalidatePath('/erp/payroll/travel-allowance')
    return { ok: true }
  })
}

export async function deleteTravelDay(id: string): Promise<ActionState> {
  return runAction('Could not remove the travel days.', async () => {
    await assertCapability('payroll.manage')

    const db = await erpDb()
    const { error } = await db.from('erp_employee_travel_days').delete().eq('id', id)
    if (error) return friendlyDbError(error, 'Could not remove the travel days.')

    revalidatePath('/erp/payroll/travel-allowance')
    return { ok: true }
  })
}
