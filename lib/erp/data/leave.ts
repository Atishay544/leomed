import 'server-only'
import { cache } from 'react'
import { erpDb, rangeFor, toPage, type PageResult } from './query'
import type { ErpLeaveRequest, ErpLeaveType, LeaveStatus } from '../types'

export const listLeaveTypes = cache(async (activeOnly = true): Promise<ErpLeaveType[]> => {
  const db = await erpDb()
  let query = db.from('erp_leave_types').select('*').order('sort_order', { ascending: true })
  if (activeOnly) query = query.eq('active', true)
  const { data } = await query
  return (data ?? []) as ErpLeaveType[]
})

/** The company's EL/SL/CL leave-type ids, looked up by name once — every
 *  balance screen and the offer-letter seeding need exactly these three. A
 *  missing one (someone renamed/deleted the seed row) reads as undefined
 *  rather than throwing, so a caller can still work with whichever exist. */
export async function getElSlClLeaveTypeIds(): Promise<{ elId?: string; slId?: string; clId?: string }> {
  const types = await listLeaveTypes(false)
  return {
    elId: types.find(t => t.name === 'Earned Leave')?.id,
    slId: types.find(t => t.name === 'Sick Leave')?.id,
    clId: types.find(t => t.name === 'Casual Leave')?.id,
  }
}

/** A single leave type's remaining balance for one employee/year — the
 *  gate applyLeave() checks before letting a tracks_balance request through.
 *  No row yet means no allocation has been set, i.e. zero remaining, not
 *  "no restriction". */
export async function getLeaveBalance(
  employeeId: string, leaveTypeId: string, year: number,
): Promise<{ allocated: number; used: number; remaining: number }> {
  const db = await erpDb()
  const { data, error } = await db
    .from('erp_leave_balances')
    .select('allocated, used')
    .eq('employee_id', employeeId)
    .eq('leave_type_id', leaveTypeId)
    .eq('year', year)
    .maybeSingle()
  if (error) console.error('[erp] getLeaveBalance failed', error.message)
  const allocated = data?.allocated ?? 0
  const used = data?.used ?? 0
  return { allocated, used, remaining: Math.max(0, allocated - used) }
}

/** Days of one leave type an employee has already requested (PENDING or
 *  APPROVED — not just APPROVED, unlike the annual balance's `used`) that
 *  fall within one calendar month, counting each request's overlap with
 *  that month rather than assuming it's fully inside it. Backs the
 *  monthly_cap_days check in applyLeave(): PENDING counts too, so someone
 *  can't get past a cap by stacking several not-yet-reviewed requests in
 *  the same month. */
export async function getLeaveDaysUsedInMonth(
  employeeId: string, leaveTypeId: string, year: number, month: number,
): Promise<number> {
  const db = await erpDb()
  const monthStart = new Date(Date.UTC(year, month - 1, 1))
  const monthEnd = new Date(Date.UTC(year, month, 0)) // last day of the month
  const monthStartStr = monthStart.toISOString().slice(0, 10)
  const monthEndStr = monthEnd.toISOString().slice(0, 10)

  const { data, error } = await db
    .from('erp_leave_requests')
    .select('from_date, to_date')
    .eq('employee_id', employeeId)
    .eq('leave_type_id', leaveTypeId)
    .in('status', ['PENDING', 'APPROVED'])
    .lte('from_date', monthEndStr)
    .gte('to_date', monthStartStr)
  if (error) { console.error('[erp] getLeaveDaysUsedInMonth failed', error.message); return 0 }

  let total = 0
  for (const r of data ?? []) {
    const from = new Date(r.from_date) > monthStart ? new Date(r.from_date) : monthStart
    const to = new Date(r.to_date) < monthEnd ? new Date(r.to_date) : monthEnd
    const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1
    if (days > 0) total += days
  }
  return total
}

export interface LeaveBalanceSummary {
  leave_type_id: string
  name: string
  allocated: number
  used: number
  remaining: number
  monthly_cap_days: number | null
}

/** One employee's balance across every tracks_balance leave type (EL/SL/CL
 *  today, plus any other type HR later flags the same way) — the "Leave
 *  Balance" cards on the Leave Portal, and the inline balance shown next to
 *  each option on the apply form. */
export async function getEmployeeLeaveSummary(employeeId: string, year: number): Promise<LeaveBalanceSummary[]> {
  const db = await erpDb()
  const [types, { data: balances, error }] = await Promise.all([
    listLeaveTypes(true),
    db.from('erp_leave_balances').select('leave_type_id, allocated, used')
      .eq('employee_id', employeeId).eq('year', year),
  ])
  if (error) console.error('[erp] getEmployeeLeaveSummary failed', error.message)

  const byType = new Map((balances ?? []).map(b => [b.leave_type_id, b]))
  return types.filter(t => t.tracks_balance).map(t => {
    const b = byType.get(t.id)
    const allocated = b?.allocated ?? 0
    const used = b?.used ?? 0
    return {
      leave_type_id: t.id, name: t.name, allocated, used,
      remaining: Math.max(0, allocated - used), monthly_cap_days: t.monthly_cap_days,
    }
  })
}

export interface LeaveBalanceSummaryRow {
  employee_id: string
  employee_name: string
  employee_role: string
  mr_code: string | null
  year: number
  el_allocated: number; el_used: number
  sl_allocated: number; sl_used: number
  cl_allocated: number; cl_used: number
}

/** Admin/HR's Leave Balances screen — one row per employee who already has
 *  at least one balance row this year, EL/SL/CL pivoted into columns (the
 *  underlying table is one row per employee+type+year). Unpaginated: fetch
 *  every row for the year and group in JS, the same "small enough, fine
 *  unpaginated" call made for territory/area lookups — a company's whole
 *  staff list at 3 rows each is nowhere near the scale that would matter. */
export async function listLeaveBalancesSummary(year: number): Promise<LeaveBalanceSummaryRow[]> {
  const db = await erpDb()
  const { elId, slId, clId } = await getElSlClLeaveTypeIds()

  const { data, error } = await db
    .from('erp_leave_balances')
    // erp_leave_balances has two FKs to erp_users (employee_id, updated_by)
    // — an unqualified erp_users(...) embed would be ambiguous (see the
    // Territory/Area fix for the exact same problem).
    .select('*, erp_users!erp_leave_balances_employee_id_fkey(name, role, mr_code)')
    .eq('year', year)
  if (error) { console.error('[erp] listLeaveBalancesSummary failed', error.message); return [] }

  const byEmployee = new Map<string, LeaveBalanceSummaryRow>()
  for (const row of (data ?? []) as any[]) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const emp = row.erp_users
    if (!emp) continue
    const existing = byEmployee.get(row.employee_id) ?? {
      employee_id: row.employee_id, employee_name: emp.name, employee_role: emp.role, mr_code: emp.mr_code,
      year, el_allocated: 0, el_used: 0, sl_allocated: 0, sl_used: 0, cl_allocated: 0, cl_used: 0,
    }
    if (row.leave_type_id === elId) { existing.el_allocated = Number(row.allocated); existing.el_used = Number(row.used) }
    else if (row.leave_type_id === slId) { existing.sl_allocated = Number(row.allocated); existing.sl_used = Number(row.used) }
    else if (row.leave_type_id === clId) { existing.cl_allocated = Number(row.allocated); existing.cl_used = Number(row.used) }
    byEmployee.set(row.employee_id, existing)
  }
  return [...byEmployee.values()].sort((a, b) => a.employee_name.localeCompare(b.employee_name))
}

export interface LeaveRequestRow extends ErpLeaveRequest {
  erp_leave_types: { name: string; is_paid: boolean } | null
}

export async function listMyLeaveRequests(employeeId: string, page = 1): Promise<PageResult<LeaveRequestRow>> {
  const db = await erpDb()
  const [from, to] = rangeFor(page)
  const { data, count } = await db
    .from('erp_leave_requests')
    .select('*, erp_leave_types(name, is_paid)', { count: 'exact' })
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false })
    .range(from, to)
  return toPage<LeaveRequestRow>(data as unknown as LeaveRequestRow[] | null, count, page)
}

export interface LeaveRequestListRow extends LeaveRequestRow {
  erp_users: { name: string; role: string; department: string | null; mr_code: string | null } | null
}

export interface LeaveListParams {
  page?: number
  status?: LeaveStatus | 'ALL'
  employeeId?: string
  leaveTypeId?: string
  from?: string
  to?: string
}

export async function listAllLeaveRequests(params: LeaveListParams = {}): Promise<PageResult<LeaveRequestListRow>> {
  const db = await erpDb()
  const page = params.page ?? 1
  const [from, to] = rangeFor(page)

  let query = db
    .from('erp_leave_requests')
    .select('*, erp_leave_types(name, is_paid), erp_users!erp_leave_requests_employee_id_fkey(name, role, department, mr_code)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (params.status && params.status !== 'ALL') query = query.eq('status', params.status)
  if (params.employeeId) query = query.eq('employee_id', params.employeeId)
  if (params.leaveTypeId) query = query.eq('leave_type_id', params.leaveTypeId)
  if (params.from) query = query.gte('to_date', params.from)
  if (params.to) query = query.lte('from_date', params.to)

  const { data, count } = await query
  return toPage<LeaveRequestListRow>(data as unknown as LeaveRequestListRow[] | null, count, page)
}

export async function countPendingLeaveRequests(): Promise<number> {
  const db = await erpDb()
  const { count } = await db
    .from('erp_leave_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'PENDING')
  return count ?? 0
}
