import 'server-only'
import { erpDb, ilikeAny, rangeFor, safeSearch, toPage, type PageResult } from './query'
import type { ErpExpense, ExpenseStatus } from '../types'

export async function listMyExpenses(employeeId: string, page = 1): Promise<PageResult<ErpExpense>> {
  const db = await erpDb()
  const [from, to] = rangeFor(page)
  const { data, count } = await db
    .from('erp_expenses')
    .select('*', { count: 'exact' })
    .eq('employee_id', employeeId)
    .order('expense_date', { ascending: false })
    .range(from, to)
  return toPage<ErpExpense>(data as ErpExpense[] | null, count, page)
}

export interface ExpenseListRow extends ErpExpense {
  erp_users: { name: string; role: string; department: string | null } | null
}

export interface ExpenseListParams {
  page?: number
  status?: ExpenseStatus | 'ALL'
  category?: string
  employeeId?: string
  from?: string
  to?: string
  q?: string
}

export async function listAllExpenses(params: ExpenseListParams = {}): Promise<PageResult<ExpenseListRow>> {
  const db = await erpDb()
  const page = params.page ?? 1
  const [from, to] = rangeFor(page)

  let query = db
    .from('erp_expenses')
    .select('*, erp_users!erp_expenses_employee_id_fkey(name, role, department)', { count: 'exact' })
    .order('expense_date', { ascending: false })
    .range(from, to)

  if (params.status && params.status !== 'ALL') query = query.eq('status', params.status)
  if (params.category) query = query.eq('category', params.category)
  if (params.employeeId) query = query.eq('employee_id', params.employeeId)
  if (params.from) query = query.gte('expense_date', params.from)
  if (params.to) query = query.lte('expense_date', params.to)

  const term = safeSearch(params.q)
  if (term) query = query.or(ilikeAny(['description', 'vendor_name'], term))

  const { data, count } = await query
  return toPage<ExpenseListRow>(data as unknown as ExpenseListRow[] | null, count, page)
}

export interface ExpenseSummary {
  total: number
  by_category: Record<string, number>
  by_status: Record<string, number>
}

export async function getExpenseSummary(from: string, to: string): Promise<ExpenseSummary> {
  const db = await erpDb()
  const { data } = await db.rpc('erp_expense_summary', { p_from: from, p_to: to })
  return (data ?? { total: 0, by_category: {}, by_status: {} }) as ExpenseSummary
}
