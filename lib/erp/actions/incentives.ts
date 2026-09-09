'use server'

import { revalidatePath } from 'next/cache'
import { assertCapability } from '../auth'
import { erpDb } from '../data/query'
import { IncentiveTierSchema, MrFlatIncentiveSchema } from '../schemas'
import { friendlyDbError, invalid, runAction, type ActionState } from './shared'

/**
 * Incentive-rule mutations — admin-only (payroll.manage, held by no other
 * role). These only ever define what erp_incentive_suggestion() computes
 * for the Incentives & Bonus screen to show; nothing here writes an actual
 * payroll item — addPayrollItem() (unchanged) is still the one write path
 * for that, so a suggestion is always a click away from being edited or
 * ignored before it becomes money.
 */

function formObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') out[key] = value
  }
  return out
}

export async function saveIncentiveTier(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('Could not save the incentive bracket.', async () => {
    const session = await assertCapability('payroll.manage')

    const parsed = IncentiveTierSchema.safeParse(formObject(formData))
    if (!parsed.success) return invalid(parsed.error)

    const db = await erpDb()
    // The exclusion constraint (erp_incentive_tiers_mr_id_range_excl-style)
    // refuses two overlapping brackets in the same scope — surfaced here as
    // a plain save error, not a silent corruption of the ladder.
    const { error } = await db.from('erp_incentive_tiers').insert({
      ...parsed.data, created_by: session.id, updated_by: session.id,
    })
    if (error) return friendlyDbError(error, 'Could not save the incentive bracket — check it doesn\'t overlap an existing one.')

    revalidatePath('/erp/payroll/incentive-rules')
    return { ok: true }
  })
}

export async function deleteIncentiveTier(id: string): Promise<ActionState> {
  return runAction('Could not remove the bracket.', async () => {
    await assertCapability('payroll.manage')

    const db = await erpDb()
    const { error } = await db.from('erp_incentive_tiers').delete().eq('id', id)
    if (error) return friendlyDbError(error, 'Could not remove the bracket.')

    revalidatePath('/erp/payroll/incentive-rules')
    return { ok: true }
  })
}

export async function saveMrFlatIncentive(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('Could not save the flat rate.', async () => {
    const session = await assertCapability('payroll.manage')

    const parsed = MrFlatIncentiveSchema.safeParse(formObject(formData))
    if (!parsed.success) return invalid(parsed.error)

    const db = await erpDb()
    const { error } = await db.from('erp_mr_incentive_settings').upsert(
      { mr_id: parsed.data.mr_id, flat_percentage: parsed.data.flat_percentage, updated_by: session.id },
      { onConflict: 'mr_id' },
    )
    if (error) return friendlyDbError(error, 'Could not save the flat rate.')

    revalidatePath('/erp/payroll/incentive-rules')
    return { ok: true }
  })
}

export async function clearMrFlatIncentive(mrId: string): Promise<ActionState> {
  return runAction('Could not clear the flat rate.', async () => {
    await assertCapability('payroll.manage')

    const db = await erpDb()
    const { error } = await db.from('erp_mr_incentive_settings').delete().eq('mr_id', mrId)
    if (error) return friendlyDbError(error, 'Could not clear the flat rate.')

    revalidatePath('/erp/payroll/incentive-rules')
    return { ok: true }
  })
}
