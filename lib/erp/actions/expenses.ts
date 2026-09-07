'use server'

import { revalidatePath } from 'next/cache'
import { assertCapability } from '../auth'
import { erpDb } from '../data/query'
import { ExpenseReviewSchema, ExpenseSchema } from '../schemas'
import { friendlyDbError, invalid, runAction, type ActionState } from './shared'

function formObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') out[key] = value
  }
  return out
}

export async function submitExpense(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('Could not submit the expense.', async () => {
    const session = await assertCapability('expenses.submit')

    const parsed = ExpenseSchema.safeParse(formObject(formData))
    if (!parsed.success) return invalid(parsed.error)

    const db = await erpDb()
    const { error } = await db.from('erp_expenses').insert({
      ...parsed.data,
      receipt_url: parsed.data.receipt_url || null,
      employee_id: session.id,
    })
    if (error) return friendlyDbError(error, 'Could not submit the expense.')

    revalidatePath('/erp/expenses')
    return { ok: true }
  })
}

export async function updateMyExpense(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('Could not update the expense.', async () => {
    const session = await assertCapability('expenses.submit')

    const parsed = ExpenseSchema.safeParse(formObject(formData))
    if (!parsed.success) return invalid(parsed.error)

    const db = await erpDb()
    const { error, count } = await db
      .from('erp_expenses')
      .update({ ...parsed.data, receipt_url: parsed.data.receipt_url || null }, { count: 'exact' })
      .eq('id', id)
      .eq('employee_id', session.id)
    if (error) return friendlyDbError(error, 'Could not update the expense.')
    if (!count) {
      return { ok: false, error: 'That expense can no longer be edited — it may already be under review.' }
    }

    revalidatePath('/erp/expenses')
    return { ok: true }
  })
}

export async function reviewExpense(input: unknown): Promise<ActionState> {
  return runAction('Could not update the expense.', async () => {
    await assertCapability('expenses.manage')

    const parsed = ExpenseReviewSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)

    const db = await erpDb()
    const { error } = await db.rpc('erp_review_expense', {
      p_expense_id: parsed.data.expense_id,
      p_status: parsed.data.status,
      p_notes: parsed.data.notes ?? null,
    })
    if (error) return friendlyDbError(error, 'Could not update the expense.')

    revalidatePath('/erp/expenses/admin')
    return { ok: true }
  })
}
