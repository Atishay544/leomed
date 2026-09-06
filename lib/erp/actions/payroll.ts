'use server'

import { revalidatePath } from 'next/cache'
import { getErpSession, assertCapability } from '../auth'
import { can } from '../permissions'
import { erpDb } from '../data/query'
import { getPayslipDetail } from '../data/payroll'
import { getErpSettings } from '../data/settings'
import { getErpUserById } from '../data/users'
import { generatePayslipPdf } from '../payslip-pdf'
import { sendPayslipEmail } from '@/lib/email'
import {
  EmployeeSalarySchema, PayrollGenerateSchema, PayrollItemSchema, PayrollReopenSchema,
} from '../schemas'
import { ErpAuthError } from '../errors'
import { friendlyDbError, invalid, runAction, type ActionState } from './shared'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * Payroll and salary mutations.
 *
 * Salary is a plain RLS-guarded table write (admin-only both ways). Every
 * payroll calculation, item, finalization and reopen goes through the
 * SECURITY DEFINER RPCs in 20260906000003_hr_payroll_expenses.sql — there is
 * exactly one place (erp_recalculate_payroll_record) that computes a net
 * salary, never duplicated here.
 */

function formObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') out[key] = value
  }
  return out
}

export async function saveEmployeeSalary(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('Could not save the salary.', async () => {
    const session = await assertCapability('payroll.manage')

    const parsed = EmployeeSalarySchema.safeParse(formObject(formData))
    if (!parsed.success) return invalid(parsed.error)

    const db = await erpDb()
    const { error } = await db
      .from('erp_employee_salary')
      .upsert({ ...parsed.data, updated_by: session.id }, { onConflict: 'employee_id' })
    if (error) return friendlyDbError(error, 'Could not save the salary.')

    revalidatePath('/erp/payroll/salaries')
    return { ok: true }
  })
}

export async function generatePayroll(input: unknown): Promise<ActionState> {
  return runAction('Could not generate payroll for this period.', async () => {
    await assertCapability('payroll.manage')

    const parsed = PayrollGenerateSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)

    const db = await erpDb()
    const { data, error } = await db.rpc('erp_generate_payroll_period', {
      p_year: parsed.data.period_year,
      p_month: parsed.data.period_month,
    })
    if (error) return friendlyDbError(error, 'Could not generate payroll for this period.')

    revalidatePath('/erp/payroll')
    return { ok: true, data: data as Record<string, unknown> }
  })
}

export async function addPayrollItem(input: unknown): Promise<ActionState> {
  return runAction('Could not add the payroll item.', async () => {
    await assertCapability('payroll.manage')

    const parsed = PayrollItemSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)

    const db = await erpDb()
    const { data, error } = await db.rpc('erp_add_payroll_item', {
      p_record_id: parsed.data.record_id,
      p_item_type: parsed.data.item_type,
      p_label: parsed.data.label,
      p_amount: parsed.data.amount,
    })
    if (error) return friendlyDbError(error, 'Could not add the payroll item.')

    revalidatePath('/erp/payroll')
    return { ok: true, data: data as Record<string, unknown> }
  })
}

export async function deletePayrollItem(itemId: string): Promise<ActionState> {
  return runAction('Could not remove the payroll item.', async () => {
    await assertCapability('payroll.manage')

    const db = await erpDb()
    const { data, error } = await db.rpc('erp_delete_payroll_item', { p_item_id: itemId })
    if (error) return friendlyDbError(error, 'Could not remove the payroll item.')

    revalidatePath('/erp/payroll')
    return { ok: true, data: data as Record<string, unknown> }
  })
}

export async function finalizePayroll(periodId: string): Promise<ActionState> {
  return runAction('Could not finalize this payroll.', async () => {
    await assertCapability('payroll.manage')

    const db = await erpDb()
    const { error } = await db.rpc('erp_finalize_payroll', { p_period_id: periodId })
    if (error) return friendlyDbError(error, 'Could not finalize this payroll.')

    revalidatePath('/erp/payroll')
    return { ok: true }
  })
}

export async function reopenPayroll(input: unknown): Promise<ActionState> {
  return runAction('Could not reopen this payroll.', async () => {
    await assertCapability('payroll.manage')

    const parsed = PayrollReopenSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)

    const db = await erpDb()
    const { error } = await db.rpc('erp_reopen_payroll', {
      p_period_id: parsed.data.period_id,
      p_reason: parsed.data.reason,
    })
    if (error) return friendlyDbError(error, 'Could not reopen this payroll.')

    revalidatePath('/erp/payroll')
    return { ok: true }
  })
}

export async function markPayrollPaid(periodId: string): Promise<ActionState> {
  return runAction('Could not mark this payroll as paid.', async () => {
    await assertCapability('payroll.manage')

    const db = await erpDb()
    const { error } = await db.rpc('erp_mark_payroll_paid', { p_period_id: periodId })
    if (error) return friendlyDbError(error, 'Could not mark this payroll as paid.')

    revalidatePath('/erp/payroll')
    return { ok: true }
  })
}

/** Emails one payslip PDF to the employee's registered address (spec §34).
 *  An employee may send their own; an admin may send anyone's. */
export async function emailPayslip(recordId: string): Promise<ActionState> {
  return runAction('Could not send the payslip email.', async () => {
    const session = await getErpSession()
    if (!session) throw new ErpAuthError('Your session has expired. Please sign in again.')

    const { record, items } = await getPayslipDetail(recordId)
    if (!record) return { ok: false, error: 'Payslip not found.' }

    const isOwner = record.employee_id === session.id && can(session.role, 'payroll.read.own')
    const isAdmin = can(session.role, 'payroll.manage')
    if (!isOwner && !isAdmin) return { ok: false, error: 'You do not have permission to do that.' }

    const employee = await getErpUserById(record.employee_id)
    if (!employee?.email) return { ok: false, error: 'This employee has no email address on file.' }

    const settings = await getErpSettings()
    const period = record.erp_payroll_periods ?? { period_year: 0, period_month: 1, status: 'DRAFT' }

    const pdf = await generatePayslipPdf(
      record, period, items,
      {
        name: record.employee_name,
        employeeCode: employee.employee_code,
        mrCode: employee.mr_code,
        designation: record.designation,
        department: record.department,
      },
      { name: settings.company_name, address: settings.company_address },
    )

    try {
      await sendPayslipEmail({
        to: employee.email,
        employeeName: record.employee_name,
        month: `${MONTH_NAMES[period.period_month - 1]} ${period.period_year}`,
        pdf,
      })
    } catch (e) {
      console.error('[erp] payslip email failed', e)
      return { ok: false, error: 'Could not send the email. Please try again.' }
    }

    return { ok: true }
  })
}
