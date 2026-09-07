import 'server-only'
import { cache } from 'react'
import { erpDb, ilikeAny, rangeFor, safeSearch, toPage, type PageResult } from './query'
import { isoDate } from '../format'
import type {
  AttendanceStatus, ErpAttendance, ErpAttendanceRules, ErpHoliday, ErpMrAttendanceTarget,
} from '../types'

/** Same fallback-to-column-defaults pattern as getErpSettings(). */
const RULES_DEFAULTS: ErpAttendanceRules = {
  id: 1,
  work_start_time: '09:30:00',
  grace_period_minutes: 15,
  min_full_day_minutes: 480,
  min_half_day_minutes: 240,
  late_threshold_minutes: 30,
  early_checkout_threshold_minutes: 30,
  gps_required: true,
  min_gps_accuracy_meters: 100,
  default_mr_doctor_visits: 8,
  default_mr_chemist_visits: 4,
  default_week_off_days: [0],
  updated_at: '',
}

export const getAttendanceRules = cache(async (): Promise<ErpAttendanceRules> => {
  const db = await erpDb()
  const { data } = await db.from('erp_attendance_rules').select('*').eq('id', 1).maybeSingle()
  return { ...RULES_DEFAULTS, ...((data as Partial<ErpAttendanceRules> | null) ?? {}) }
})

export interface MrTargetRow extends ErpMrAttendanceTarget {
  erp_users: { name: string; mr_code: string | null } | null
}

export async function listMrAttendanceTargets(): Promise<MrTargetRow[]> {
  const db = await erpDb()
  const { data } = await db
    .from('erp_mr_attendance_targets')
    .select('*, erp_users!erp_mr_attendance_targets_mr_id_fkey(name, mr_code)')
    .order('created_at', { ascending: false })
  return (data ?? []) as unknown as MrTargetRow[]
}

export async function listHolidays(fromYear?: number): Promise<ErpHoliday[]> {
  const db = await erpDb()
  let query = db.from('erp_holidays').select('*').order('holiday_date', { ascending: true })
  if (fromYear) query = query.gte('holiday_date', `${fromYear}-01-01`)
  const { data } = await query
  return (data ?? []) as ErpHoliday[]
}

/** Today's attendance row for the signed-in employee, or null before they
 *  have checked in — the self-service screen's whole state hinges on this. */
export async function getMyAttendanceToday(employeeId: string): Promise<ErpAttendance | null> {
  const db = await erpDb()
  const { data } = await db
    .from('erp_attendance')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('date', isoDate())
    .maybeSingle()
  return (data as ErpAttendance | null) ?? null
}

export async function listMyAttendanceHistory(
  employeeId: string,
  page = 1,
): Promise<PageResult<ErpAttendance>> {
  const db = await erpDb()
  const [from, to] = rangeFor(page)
  const { data, count } = await db
    .from('erp_attendance')
    .select('*', { count: 'exact' })
    .eq('employee_id', employeeId)
    .order('date', { ascending: false })
    .range(from, to)
  return toPage<ErpAttendance>(data as ErpAttendance[] | null, count, page)
}

export interface AttendanceListRow extends ErpAttendance {
  erp_users: { name: string; role: string; department: string | null; territory: string | null; mr_code: string | null } | null
}

export interface AttendanceListParams {
  page?: number
  date?: string        // single day — the common case (today's dashboard)
  from?: string
  to?: string
  employeeId?: string
  role?: string
  territory?: string
  department?: string
  status?: AttendanceStatus | 'ALL'
  q?: string
}

/** The admin/manager attendance list. Always paginated and always filtered by
 *  at least a date or a range at the call site — spec §41 forbids loading a
 *  whole company's history into one screen. */
export async function listAttendance(params: AttendanceListParams = {}): Promise<PageResult<AttendanceListRow>> {
  const db = await erpDb()
  const page = params.page ?? 1
  const [from, to] = rangeFor(page)

  let query = db
    .from('erp_attendance')
    .select('*, erp_users!inner(name, role, department, territory, mr_code)', { count: 'exact' })
    .order('date', { ascending: false })
    .range(from, to)

  if (params.date) query = query.eq('date', params.date)
  else {
    if (params.from) query = query.gte('date', params.from)
    if (params.to) query = query.lte('date', params.to)
  }
  if (params.employeeId) query = query.eq('employee_id', params.employeeId)
  if (params.status && params.status !== 'ALL') query = query.eq('attendance_status', params.status)
  if (params.role) query = query.eq('erp_users.role', params.role)
  if (params.territory) query = query.eq('erp_users.territory', params.territory)
  if (params.department) query = query.eq('erp_users.department', params.department)

  const term = safeSearch(params.q)
  if (term) query = query.or(ilikeAny(['name', 'mr_code'], term), { referencedTable: 'erp_users' })

  const { data, count } = await query
  return toPage<AttendanceListRow>(data as unknown as AttendanceListRow[] | null, count, page)
}

export interface AttendanceSummary {
  date: string
  total_employees: number
  present: number
  absent: number
  half_day: number
  leave: number
  holiday: number
  week_off: number
  pending_review: number
  exceptions: number
  not_marked: number
}

export async function getAttendanceSummary(
  date: string,
  role?: string,
  territory?: string,
  department?: string,
): Promise<AttendanceSummary> {
  const db = await erpDb()
  // `|| null`, not `?? null`: the filter form's "All roles"/"All
  // territories"/"All departments" option submits as an empty string, not
  // as an absent param — every GET form submission includes every named
  // field, even the ones left on their default. An empty string reaching
  // p_role would fail outright (it's typed as the erp_role enum in
  // erp_attendance_summary(), and '' isn't a valid member), throwing an
  // uncaught error the moment any OTHER filter was applied.
  const { data } = await db.rpc('erp_attendance_summary', {
    p_date: date,
    p_role: role || null,
    p_territory: territory || null,
    p_department: department || null,
  })
  return data as AttendanceSummary
}

export interface FieldActivityEvent {
  time: string | null
  label: string
  kind: 'check_in' | 'check_out' | 'doctor_visit' | 'chemist_visit'
}

/** One employee's attendance for one day, plus — for an MR — the field
 *  activity timeline built from the EXISTING visit tables (no second visit
 *  system, spec §10). Non-MR rows never fetch or show visit data. */
export async function getAttendanceDetail(employeeId: string, date: string) {
  const db = await erpDb()

  const [{ data: attendance }, { data: employee }] = await Promise.all([
    db.from('erp_attendance').select('*').eq('employee_id', employeeId).eq('date', date).maybeSingle(),
    db.from('erp_users')
      .select('id, name, role, department, territory, mr_code, employee_code, reports_to, reports_to_user:erp_users!erp_users_reports_to_fkey(name)')
      .eq('id', employeeId)
      .maybeSingle(),
  ])

  const events: FieldActivityEvent[] = []
  const att = attendance as ErpAttendance | null
  if (att?.check_in_time) {
    events.push({ time: att.check_in_time, label: 'Check-in', kind: 'check_in' })
  }
  if (att?.check_out_time) {
    events.push({ time: att.check_out_time, label: 'Check-out', kind: 'check_out' })
  }

  const emp = employee as { role: string } | null
  let orderTotal = 0

  if (emp?.role === 'MR') {
    const [{ data: doctorVisits }, { data: chemistVisits }, { data: orders }] = await Promise.all([
      db.from('erp_doctor_visits')
        .select('visit_time, erp_doctors(doctor_name)')
        .eq('mr_id', employeeId).eq('visit_date', date),
      db.from('erp_chemist_visits')
        .select('visit_time, erp_chemists(chemist_name)')
        .eq('mr_id', employeeId).eq('visit_date', date),
      db.from('erp_field_orders')
        .select('estimated_value')
        .eq('mr_id', employeeId).eq('order_date', date),
    ])

    for (const v of (doctorVisits ?? []) as unknown as { visit_time: string | null; erp_doctors: { doctor_name: string } | null }[]) {
      events.push({ time: v.visit_time, label: v.erp_doctors?.doctor_name ?? 'Doctor visit', kind: 'doctor_visit' })
    }
    for (const v of (chemistVisits ?? []) as unknown as { visit_time: string | null; erp_chemists: { chemist_name: string } | null }[]) {
      events.push({ time: v.visit_time, label: v.erp_chemists?.chemist_name ?? 'Chemist visit', kind: 'chemist_visit' })
    }
    orderTotal = ((orders ?? []) as { estimated_value: number }[]).reduce((sum, o) => sum + Number(o.estimated_value ?? 0), 0)
  }

  events.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))

  return {
    attendance: att,
    employee: employee as (
      { id: string; name: string; role: string; department: string | null; territory: string | null
        mr_code: string | null; employee_code: string | null; reports_to: string | null
        reports_to_user: { name: string } | null } | null
    ),
    events,
    orderTotal,
  }
}
