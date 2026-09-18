'use server'

import { revalidatePath } from 'next/cache'
import { assertCapability } from '../auth'
import { erpDb } from '../data/query'
import { getElSlClLeaveTypeIds, getLeaveBalance, listLeaveTypes } from '../data/leave'
import {
  AdminCreateLeaveSchema, LeaveApplicationSchema, LeaveBalanceSchema, LeaveReviewSchema, LeaveTypeSchema,
} from '../schemas'
import { friendlyDbError, invalid, runAction, type ActionState } from './shared'

function formObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') out[key] = value
  }
  return out
}

/**
 * Leave mutations.
 *
 * Applying and self-cancelling are plain RLS-guarded writes (an employee can
 * only ever touch their own row — see the policies in
 * 20260906000002_hr_attendance_leave.sql). Approving, rejecting and
 * admin-created leave go through SECURITY DEFINER RPCs because they also
 * have to stamp the affected attendance days as LEAVE in the same
 * transaction (spec §23).
 */

export async function applyLeave(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('Could not submit your leave request.', async () => {
    const session = await assertCapability('leave.apply')

    const parsed = LeaveApplicationSchema.safeParse(formObject(formData))
    if (!parsed.success) return invalid(parsed.error)

    // A tracks_balance leave type (EL/SL/CL) is blocked outright once the
    // requested days exceed what's left — the applicant is told to use
    // Unpaid Leave / LOP for the shortfall instead, rather than being let
    // through and quietly running the balance negative.
    const types = await listLeaveTypes(false)
    const leaveType = types.find(t => t.id === parsed.data.leave_type_id)
    if (leaveType?.tracks_balance) {
      const requestedDays = Math.round(
        (new Date(parsed.data.to_date).getTime() - new Date(parsed.data.from_date).getTime()) / 86_400_000,
      ) + 1
      const year = new Date(parsed.data.from_date).getFullYear()
      const { remaining } = await getLeaveBalance(session.id, leaveType.id, year)
      if (requestedDays > remaining) {
        return {
          ok: false,
          error: remaining <= 0
            ? `You have no ${leaveType.name} balance left for ${year}. Apply for Unpaid Leave / Loss of Pay instead.`
            : `You only have ${remaining} day(s) of ${leaveType.name} left for ${year} (this request needs ${requestedDays}). ` +
              `Reduce the dates, or apply for Unpaid Leave / Loss of Pay for the rest.`,
        }
      }
    }

    const db = await erpDb()
    const { error } = await db.from('erp_leave_requests').insert({
      employee_id:   session.id,
      leave_type_id: parsed.data.leave_type_id,
      from_date:     parsed.data.from_date,
      to_date:       parsed.data.to_date,
      reason:        parsed.data.reason ?? null,
    })
    if (error) return friendlyDbError(error, 'Could not submit your leave request.')

    revalidatePath('/erp/leave')
    return { ok: true }
  })
}

export async function cancelMyLeaveRequest(leaveId: string): Promise<ActionState> {
  return runAction('Could not cancel the leave request.', async () => {
    const session = await assertCapability('leave.read.own')

    const db = await erpDb()
    const { error, count } = await db
      .from('erp_leave_requests')
      .update({ status: 'CANCELLED' }, { count: 'exact' })
      .eq('id', leaveId)
      .eq('employee_id', session.id)
      .eq('status', 'PENDING')

    if (error) return friendlyDbError(error, 'Could not cancel the leave request.')
    if (!count) {
      return { ok: false, error: 'That request is no longer pending, so it cannot be cancelled here.' }
    }

    revalidatePath('/erp/leave')
    return { ok: true }
  })
}

export async function reviewLeaveRequest(input: unknown): Promise<ActionState> {
  return runAction('Could not update the leave request.', async () => {
    await assertCapability('leave.manage')

    const parsed = LeaveReviewSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)

    const db = await erpDb()
    const { error } = await db.rpc('erp_review_leave_request', {
      p_leave_id:      parsed.data.leave_id,
      p_status:        parsed.data.status,
      p_admin_remarks: parsed.data.admin_remarks ?? null,
    })
    if (error) return friendlyDbError(error, 'Could not update the leave request.')

    revalidatePath('/erp/leave/admin')
    revalidatePath('/erp/attendance/admin')
    return { ok: true }
  })
}

export async function adminCreateLeave(input: unknown): Promise<ActionState> {
  return runAction('Could not create the leave request.', async () => {
    await assertCapability('leave.manage')

    const parsed = AdminCreateLeaveSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)

    const db = await erpDb()
    const { error } = await db.rpc('erp_admin_create_leave', {
      p_employee_id:   parsed.data.employee_id,
      p_leave_type_id: parsed.data.leave_type_id,
      p_from_date:     parsed.data.from_date,
      p_to_date:       parsed.data.to_date,
      p_reason:        parsed.data.reason ?? null,
      p_status:        parsed.data.status,
    })
    if (error) return friendlyDbError(error, 'Could not create the leave request.')

    revalidatePath('/erp/leave/admin')
    revalidatePath('/erp/attendance/admin')
    return { ok: true }
  })
}

export async function saveLeaveType(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('Could not save the leave type.', async () => {
    await assertCapability('leave.manage')

    const parsed = LeaveTypeSchema.safeParse(formObject(formData))
    if (!parsed.success) return invalid(parsed.error)

    const id = String(formData.get('id') ?? '').trim()
    const db = await erpDb()

    const { error } = id
      ? await db.from('erp_leave_types').update(parsed.data).eq('id', id)
      : await db.from('erp_leave_types').insert(parsed.data)
    if (error) return friendlyDbError(error, 'Could not save the leave type.')

    revalidatePath('/erp/leave/admin')
    return { ok: true }
  })
}

/** HR/Admin sets one employee's EL/SL/CL quota for one year in a single
 *  dialog — each number is a hard SET of `allocated`, same convention as
 *  saveEmployeeSalary(). `used` is never touched here; it only ever moves
 *  via erp_review_leave_request()/erp_admin_create_leave(). */
export async function saveLeaveBalances(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('Could not save the leave balance.', async () => {
    const session = await assertCapability('leave.manage')

    const parsed = LeaveBalanceSchema.safeParse(formObject(formData))
    if (!parsed.success) return invalid(parsed.error)

    const { elId, slId, clId } = await getElSlClLeaveTypeIds()
    const rows = [
      elId && { leave_type_id: elId, allocated: parsed.data.el_days },
      slId && { leave_type_id: slId, allocated: parsed.data.sl_days },
      clId && { leave_type_id: clId, allocated: parsed.data.cl_days },
    ].filter((r): r is { leave_type_id: string; allocated: number } => !!r)

    if (rows.length === 0) {
      return { ok: false, error: 'No Earned/Sick/Casual Leave type found to allocate against.' }
    }

    const db = await erpDb()
    const { error } = await db.from('erp_leave_balances').upsert(
      rows.map(r => ({
        employee_id:   parsed.data.employee_id,
        leave_type_id: r.leave_type_id,
        year:          parsed.data.year,
        allocated:     r.allocated,
        updated_by:    session.id,
      })),
      { onConflict: 'employee_id,leave_type_id,year' },
    )
    if (error) return friendlyDbError(error, 'Could not save the leave balance.')

    revalidatePath('/erp/leave/balances')
    revalidatePath('/erp/leave')
    return { ok: true }
  })
}
