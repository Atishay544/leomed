'use server'

import { revalidatePath } from 'next/cache'
import { assertCapability } from '../auth'
import { erpDb } from '../data/query'
import {
  AttendanceCheckSchema, AttendanceCorrectionSchema, AttendanceRulesSchema,
  HolidaySchema, MrAttendanceTargetSchema,
} from '../schemas'
import { friendlyDbError, invalid, runAction, type ActionState } from './shared'

/**
 * Attendance mutations.
 *
 * Check-in/out never write erp_attendance directly from here — they call the
 * SECURITY DEFINER RPCs in 20260906000002_hr_attendance_leave.sql so the
 * server's clock, not the client's, is what gets stored (spec §4). Everything
 * else re-checks its capability, same discipline as every other ERP action.
 */

function formObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') out[key] = value
  }
  return out
}

// ─── Self-service check-in / check-out ─────────────────────────────────────

export async function checkIn(input: unknown): Promise<ActionState> {
  return runAction('Could not check in. Check your connection and try again.', async () => {
    const session = await assertCapability('attendance.checkin')
    // Belt-and-braces: the RPC itself refuses this too, but a friendly message
    // here avoids a round trip for the one role that should never see the button.
    if (session.role === 'ADMIN') {
      return { ok: false, error: 'Administrators do not require attendance tracking.' }
    }

    const parsed = AttendanceCheckSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)

    const db = await erpDb()
    const { data, error } = await db.rpc('erp_attendance_check_in', {
      p_latitude:  parsed.data.latitude ?? null,
      p_longitude: parsed.data.longitude ?? null,
      p_accuracy:  parsed.data.accuracy ?? null,
    })
    if (error) return friendlyDbError(error, 'Could not check in.')

    revalidatePath('/erp/attendance')
    revalidatePath('/erp/mr')
    return { ok: true, data: data as Record<string, unknown> }
  })
}

export async function checkOut(input: unknown): Promise<ActionState> {
  return runAction('Could not check out. Check your connection and try again.', async () => {
    const session = await assertCapability('attendance.checkin')
    if (session.role === 'ADMIN') {
      return { ok: false, error: 'Administrators do not require attendance tracking.' }
    }

    const parsed = AttendanceCheckSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)

    const db = await erpDb()
    const { data, error } = await db.rpc('erp_attendance_check_out', {
      p_latitude:  parsed.data.latitude ?? null,
      p_longitude: parsed.data.longitude ?? null,
      p_accuracy:  parsed.data.accuracy ?? null,
    })
    if (error) return friendlyDbError(error, 'Could not check out.')

    revalidatePath('/erp/attendance')
    revalidatePath('/erp/mr')
    return { ok: true, data: data as Record<string, unknown> }
  })
}

// ─── Admin corrections ──────────────────────────────────────────────────────

export async function correctAttendance(input: unknown): Promise<ActionState> {
  return runAction('Could not correct the attendance record.', async () => {
    await assertCapability('attendance.manage')

    const parsed = AttendanceCorrectionSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)

    const db = await erpDb()
    const { data, error } = await db.rpc('erp_admin_correct_attendance', {
      p_attendance_id:  parsed.data.attendance_id,
      p_status:         parsed.data.status ?? null,
      p_check_in_time:  parsed.data.check_in_time ?? null,
      p_check_out_time: parsed.data.check_out_time ?? null,
      p_reason:         parsed.data.reason,
    })
    if (error) return friendlyDbError(error, 'Could not correct the attendance record.')

    const row = data as Record<string, unknown> | null
    revalidatePath('/erp/attendance/admin')
    if (row?.employee_id) revalidatePath(`/erp/attendance/admin/${row.employee_id}`)
    return { ok: true, data: row ?? {} }
  })
}

export async function recalculateAttendance(attendanceId: string): Promise<ActionState> {
  return runAction('Could not recalculate the attendance record.', async () => {
    await assertCapability('attendance.manage')

    const db = await erpDb()
    const { data, error } = await db.rpc('erp_admin_recalculate_attendance', {
      p_attendance_id: attendanceId,
    })
    if (error) return friendlyDbError(error, 'Could not recalculate the attendance record.')

    const row = data as Record<string, unknown> | null
    revalidatePath('/erp/attendance/admin')
    if (row?.employee_id) revalidatePath(`/erp/attendance/admin/${row.employee_id}`)
    return { ok: true, data: row ?? {} }
  })
}

// ─── Rules, MR targets, holidays (all admin-only) ──────────────────────────

export async function saveAttendanceRules(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('Could not save the attendance rules.', async () => {
    await assertCapability('attendance.manage')

    const parsed = AttendanceRulesSchema.safeParse(formObject(formData))
    if (!parsed.success) return invalid(parsed.error)

    const db = await erpDb()
    const { error } = await db.from('erp_attendance_rules').update(parsed.data).eq('id', 1)
    if (error) return friendlyDbError(error, 'Could not save the attendance rules.')

    revalidatePath('/erp/attendance/rules')
    return { ok: true }
  })
}

export async function saveMrAttendanceTarget(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('Could not save the visit targets.', async () => {
    const session = await assertCapability('attendance.manage')

    const parsed = MrAttendanceTargetSchema.safeParse(formObject(formData))
    if (!parsed.success) return invalid(parsed.error)

    const db = await erpDb()
    const { error } = await db
      .from('erp_mr_attendance_targets')
      .upsert({ ...parsed.data, created_by: session.id }, { onConflict: 'mr_id' })
    if (error) return friendlyDbError(error, 'Could not save the visit targets.')

    revalidatePath('/erp/attendance/rules')
    return { ok: true }
  })
}

export async function deleteMrAttendanceTarget(mrId: string): Promise<ActionState> {
  return runAction('Could not remove the override.', async () => {
    await assertCapability('attendance.manage')

    const db = await erpDb()
    const { error } = await db.from('erp_mr_attendance_targets').delete().eq('mr_id', mrId)
    if (error) return friendlyDbError(error, 'Could not remove the override.')

    revalidatePath('/erp/attendance/rules')
    return { ok: true }
  })
}

export async function saveHoliday(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('Could not add the holiday.', async () => {
    const session = await assertCapability('attendance.manage')

    const parsed = HolidaySchema.safeParse(formObject(formData))
    if (!parsed.success) return invalid(parsed.error)

    const db = await erpDb()
    const { error } = await db.from('erp_holidays').insert({ ...parsed.data, created_by: session.id })
    if (error) return friendlyDbError(error, 'Could not add the holiday.')

    revalidatePath('/erp/attendance/rules')
    return { ok: true }
  })
}

export async function deleteHoliday(id: string): Promise<ActionState> {
  return runAction('Could not remove the holiday.', async () => {
    await assertCapability('attendance.manage')

    const db = await erpDb()
    const { error } = await db.from('erp_holidays').delete().eq('id', id)
    if (error) return friendlyDbError(error, 'Could not remove the holiday.')

    revalidatePath('/erp/attendance/rules')
    return { ok: true }
  })
}
