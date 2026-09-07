import 'server-only'
import { erpDb, rangeFor, toPage, type PageResult } from './query'
import type {
  ErpEmployeeSalary, ErpPayrollItem, ErpPayrollPeriod, ErpPayrollRecord, PayrollStatus,
} from '../types'

export async function getEmployeeSalary(employeeId: string): Promise<ErpEmployeeSalary | null> {
  const db = await erpDb()
  const { data } = await db.from('erp_employee_salary').select('*').eq('employee_id', employeeId).maybeSingle()
  return (data as ErpEmployeeSalary | null) ?? null
}

export interface SalaryRow extends ErpEmployeeSalary {
  erp_users: { name: string; role: string; mr_code: string | null } | null
}

/** All configured salaries, for the admin salary-management screen. Paginated
 *  like every other employee-scale list (spec §41). */
export async function listEmployeeSalaries(page = 1): Promise<PageResult<SalaryRow>> {
  const db = await erpDb()
  const [from, to] = rangeFor(page)
  const { data, count } = await db
    .from('erp_employee_salary')
    .select('*, erp_users!erp_employee_salary_employee_id_fkey(name, role, mr_code)', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(from, to)
  return toPage<SalaryRow>(data as unknown as SalaryRow[] | null, count, page)
}

export async function listPayrollPeriods(): Promise<ErpPayrollPeriod[]> {
  const db = await erpDb()
  const { data } = await db
    .from('erp_payroll_periods')
    .select('*')
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false })
  return (data ?? []) as ErpPayrollPeriod[]
}

export interface PayrollPeriodTotals {
  employee_count: number
  total_net_salary: number
  total_incentives: number
  total_deductions: number
}

export async function getPayrollPeriodTotals(periodId: string): Promise<PayrollPeriodTotals> {
  const db = await erpDb()
  const { data } = await db.rpc('erp_payroll_period_totals', { p_period_id: periodId })
  return (data ?? { employee_count: 0, total_net_salary: 0, total_incentives: 0, total_deductions: 0 }) as PayrollPeriodTotals
}

export async function getPayrollPeriod(year: number, month: number): Promise<ErpPayrollPeriod | null> {
  const db = await erpDb()
  const { data } = await db
    .from('erp_payroll_periods')
    .select('*')
    .eq('period_year', year).eq('period_month', month)
    .maybeSingle()
  return (data as ErpPayrollPeriod | null) ?? null
}

export interface PayrollRecordListParams {
  page?: number
  q?: string
  department?: string
  // erp_generate_payroll_period() snapshots the employee's role into
  // `designation` (r.role::text) at generation time — reused here rather
  // than joining erp_users, so "role" filtering matches what the worksheet
  // itself already shows for that period, not the employee's role today.
  role?: string
}

/** Records for one period — the admin payroll worksheet. */
export async function listPayrollRecords(
  periodId: string,
  params: PayrollRecordListParams = {},
): Promise<PageResult<ErpPayrollRecord>> {
  const db = await erpDb()
  const page = params.page ?? 1
  const [from, to] = rangeFor(page, 50)

  let query = db
    .from('erp_payroll_records')
    .select('*', { count: 'exact' })
    .eq('payroll_period_id', periodId)
    .order('employee_name', { ascending: true })
    .range(from, to)

  if (params.department) query = query.eq('department', params.department)
  if (params.role) query = query.eq('designation', params.role)
  if (params.q) query = query.ilike('employee_name', `%${params.q}%`)

  const { data, count } = await query
  return toPage<ErpPayrollRecord>(data as ErpPayrollRecord[] | null, count, page, 50)
}

/** All records for one role in one period, unpaginated — the bulk
 *  incentive/bonus screen needs every employee of the chosen role on screen
 *  at once (typically a few dozen at most), not a paged worksheet. */
export async function listPayrollRecordsForRole(
  periodId: string,
  role: string,
): Promise<ErpPayrollRecord[]> {
  const db = await erpDb()
  const { data } = await db
    .from('erp_payroll_records')
    .select('*')
    .eq('payroll_period_id', periodId)
    .eq('designation', role)
    .order('employee_name', { ascending: true })
  return (data ?? []) as ErpPayrollRecord[]
}

export async function getPayrollRecord(recordId: string): Promise<ErpPayrollRecord | null> {
  const db = await erpDb()
  const { data } = await db.from('erp_payroll_records').select('*').eq('id', recordId).maybeSingle()
  return (data as ErpPayrollRecord | null) ?? null
}

export async function listPayrollItems(recordId: string): Promise<ErpPayrollItem[]> {
  const db = await erpDb()
  const { data } = await db
    .from('erp_payroll_items')
    .select('*')
    .eq('payroll_record_id', recordId)
    .order('created_at', { ascending: true })
  return (data ?? []) as ErpPayrollItem[]
}

export interface PayrollRecordWithPeriod extends ErpPayrollRecord {
  erp_payroll_periods: { period_year: number; period_month: number; status: PayrollStatus } | null
}

/** An employee's own payroll history — RLS already scopes this to their own
 *  rows, so no explicit employee_id filter is strictly required, but it is
 *  passed anyway so the query plan and intent both stay obvious. */
export async function listMyPayrollRecords(employeeId: string, page = 1): Promise<PageResult<PayrollRecordWithPeriod>> {
  const db = await erpDb()
  const [from, to] = rangeFor(page)
  const { data, count } = await db
    .from('erp_payroll_records')
    .select('*, erp_payroll_periods(period_year, period_month, status)', { count: 'exact' })
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false })
    .range(from, to)
  return toPage(data as unknown as PayrollRecordWithPeriod[] | null, count, page)
}

/** One payslip's full detail: the record, its line items and the period it
 *  belongs to — everything a payslip PDF needs, in one round trip. */
export async function getPayslipDetail(recordId: string) {
  const db = await erpDb()
  const [{ data: record }, { data: items }] = await Promise.all([
    db.from('erp_payroll_records')
      .select('*, erp_payroll_periods(period_year, period_month, status)')
      .eq('id', recordId).maybeSingle(),
    db.from('erp_payroll_items').select('*').eq('payroll_record_id', recordId).order('created_at'),
  ])
  return {
    record: record as unknown as PayrollRecordWithPeriod | null,
    items: (items ?? []) as ErpPayrollItem[],
  }
}
