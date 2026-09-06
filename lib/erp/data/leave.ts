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
