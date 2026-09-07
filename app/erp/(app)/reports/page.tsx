import Link from 'next/link'
import { BarChart3, Download } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { can } from '@/lib/erp/permissions'
import {
  currentMonthRange, getDistributorPerformance, getMrPerformance,
  getProductPerformance, getTerritoryPerformance,
} from '@/lib/erp/data/dashboard'
import { listAttendance } from '@/lib/erp/data/attendance'
import { listAllLeaveRequests } from '@/lib/erp/data/leave'
import { listPayrollRecords } from '@/lib/erp/data/payroll'
import { erpDb } from '@/lib/erp/data/query'
import { listAllExpenses } from '@/lib/erp/data/expenses'
import {
  ATTENDANCE_STATUS_LABELS, ATTENDANCE_STATUS_STYLES, EXPENSE_CATEGORY_LABELS,
  EXPENSE_STATUS_LABELS, EXPENSE_STATUS_STYLES, formatClockTime, formatDate,
  LEAVE_STATUS_LABELS, LEAVE_STATUS_STYLES, money, qty,
} from '@/lib/erp/format'
import type { ErpPayrollPeriod } from '@/lib/erp/types'
import { FilterDate, FilterForm } from '@/components/erp/FilterForm'
import { Badge, Card, CardHeader, EmptyState, PageHeader, TableWrap, Td, Th } from '@/components/erp/ui'

export const metadata = { title: 'Reports' }

const ALL_TABS = [
  { key: 'mr',          label: 'MR performance', capability: 'reports.read.all' },
  { key: 'product',     label: 'Products',       capability: 'reports.read.all' },
  { key: 'distributor', label: 'Distributors',   capability: 'reports.read.all' },
  { key: 'territory',   label: 'Territories',    capability: 'reports.read.all' },
  { key: 'attendance',  label: 'Attendance',     capability: 'attendance.read.all' },
  { key: 'leave',       label: 'Leave',          capability: 'leave.manage' },
  { key: 'payroll',     label: 'Payroll',        capability: 'payroll.manage' },
  { key: 'expenses',    label: 'Expenses',       capability: 'expenses.manage' },
] as const

type TabKey = (typeof ALL_TABS)[number]['key']

interface Props {
  searchParams: Promise<{ tab?: string; from?: string; to?: string; year?: string; month?: string }>
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default async function ReportsPage({ searchParams }: Props) {
  const session = await requireCapability('reports.read.all')
  const params = await searchParams

  const TABS = ALL_TABS.filter(t => can(session.role, t.capability))
  const month = currentMonthRange()
  const from = params.from ?? month.from
  const to = params.to ?? month.to
  const now = new Date()
  const payrollYear = Number(params.year) || now.getFullYear()
  const payrollMonth = Number(params.month) || now.getMonth() + 1
  const tab: TabKey = (TABS.find(t => t.key === params.tab)?.key ?? TABS[0]?.key ?? 'mr')

  // Only the active tab's query runs — no point aggregating eight reports to
  // show one.
  const [mrRows, productRows, distributorRows, territoryRows] = await Promise.all([
    tab === 'mr'          ? getMrPerformance(from, to)          : Promise.resolve([]),
    tab === 'product'     ? getProductPerformance(from, to)     : Promise.resolve([]),
    tab === 'distributor' ? getDistributorPerformance(from, to) : Promise.resolve([]),
    tab === 'territory'   ? getTerritoryPerformance(from, to)   : Promise.resolve([]),
  ])

  const attendanceResult = tab === 'attendance'
    ? await listAttendance({ from, to, page: 1 })
    : null
  const leaveResult = tab === 'leave'
    ? await listAllLeaveRequests({ from, to, page: 1 })
    : null
  const expenseResult = tab === 'expenses'
    ? await listAllExpenses({ from, to, page: 1 })
    : null

  let payrollPeriod: ErpPayrollPeriod | null = null
  let payrollRows: Awaited<ReturnType<typeof listPayrollRecords>>['rows'] = []
  if (tab === 'payroll') {
    const db = await erpDb()
    const { data } = await db.from('erp_payroll_periods').select('*')
      .eq('period_year', payrollYear).eq('period_month', payrollMonth).maybeSingle()
    payrollPeriod = data as ErpPayrollPeriod | null
    if (payrollPeriod) payrollRows = (await listPayrollRecords(payrollPeriod.id)).rows
  }

  const tabHref = (key: string) => {
    const next = new URLSearchParams({ from, to })
    if (key !== TABS[0]?.key) next.set('tab', key)
    return `/erp/reports?${next.toString()}`
  }

  const exportHref = (() => {
    if (tab === 'attendance') return `/api/erp/reports/attendance?from=${from}&to=${to}`
    if (tab === 'leave') return `/api/erp/reports/leave?from=${from}&to=${to}`
    if (tab === 'expenses') return `/api/erp/reports/expenses?from=${from}&to=${to}`
    if (tab === 'payroll') return `/api/erp/reports/payroll?year=${payrollYear}&month=${payrollMonth}`
    return null
  })()

  return (
    <>
      <PageHeader
        title="Reports"
        description={tab === 'payroll' ? `${MONTHS[payrollMonth - 1]} ${payrollYear}` : `${formatDate(from)} — ${formatDate(to)}`}
        action={exportHref && (
          <a
            href={exportHref}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2
                       text-[13px] font-medium text-gray-700 hover:bg-gray-50"
          >
            <Download size={14} /> Export CSV
          </a>
        )}
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map(t => (
          <Link
            key={t.key}
            href={tabHref(t.key)}
            className={`rounded-lg px-3.5 py-2 text-[13px] font-semibold transition ${
              tab === t.key
                ? 'bg-emerald-700 text-white shadow-sm'
                : 'border border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <Card padded={false}>
        {tab === 'payroll' ? (
          <form method="get" className="flex flex-wrap items-end gap-2.5 border-b border-gray-100 px-4 py-3">
            <input type="hidden" name="tab" value="payroll" />
            <div>
              <label htmlFor="r_month" className="mb-1 block text-[11px] font-medium text-gray-500">Month</label>
              <select id="r_month" name="month" defaultValue={payrollMonth}
                      className="rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-[12.5px] focus:border-emerald-600 focus:outline-none">
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="r_year" className="mb-1 block text-[11px] font-medium text-gray-500">Year</label>
              <input id="r_year" name="year" type="number" defaultValue={payrollYear}
                     className="w-24 rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-[12.5px] focus:border-emerald-600 focus:outline-none" />
            </div>
            <button type="submit" className="rounded-lg bg-gray-900 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-gray-800">
              Go
            </button>
          </form>
        ) : (
          <FilterForm action="/erp/reports" hasFilters={!!(params.from || params.to)}>
            <input type="hidden" name="tab" value={tab} />
            <FilterDate name="from" label="From" defaultValue={from} />
            <FilterDate name="to"   label="To"   defaultValue={to} />
          </FilterForm>
        )}

        {tab === 'mr' && (
          <>
            <CardHeader title="Field-force activity by MR" />
            {mrRows.length === 0 ? (
              <EmptyState icon={BarChart3} title="No MR activity in this period" />
            ) : (
              <TableWrap>
                <table className="w-full min-w-[960px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <Th>MR</Th>
                      <Th>Territory</Th>
                      <Th align="right">Doctor visits</Th>
                      <Th align="right">Doctors covered</Th>
                      <Th align="right">New doctors</Th>
                      <Th align="right">Chemist visits</Th>
                      <Th align="right">Chemists covered</Th>
                      <Th align="right">Orders</Th>
                      <Th align="right">Order value</Th>
                      <Th align="right">Open follow-ups</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {mrRows.map(row => (
                      <tr key={row.mr_id} className="hover:bg-gray-50/60">
                        <Td>
                          <span className="font-medium text-gray-900">{row.mr_name}</span>
                          {row.mr_code && (
                            <p className="mt-0.5 font-mono text-[11px] text-gray-400">{row.mr_code}</p>
                          )}
                        </Td>
                        <Td>{row.territory ?? '—'}</Td>
                        <Td align="right" className="tabular-nums font-medium">{qty(row.doctor_visits)}</Td>
                        <Td align="right" className="tabular-nums">{qty(row.doctors_covered)}</Td>
                        <Td align="right" className="tabular-nums text-emerald-700">{qty(row.new_doctors)}</Td>
                        <Td align="right" className="tabular-nums">{qty(row.chemist_visits)}</Td>
                        <Td align="right" className="tabular-nums">{qty(row.chemists_covered)}</Td>
                        <Td align="right" className="tabular-nums">{qty(row.field_orders)}</Td>
                        <Td align="right" className="tabular-nums font-medium text-gray-900">
                          {money(row.order_value)}
                        </Td>
                        <Td align="right" className="tabular-nums">{qty(row.followups_open)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </>
        )}

        {tab === 'product' && (
          <>
            <CardHeader title="Field demand versus actual sales" />
            <p className="border-b border-gray-100 px-5 py-2.5 text-[12px] leading-relaxed text-gray-500">
              Demand is what doctors and chemists asked MRs for. Sales is what Leomed invoiced to
              distributors. They measure different things and are not expected to match.
            </p>
            {productRows.length === 0 ? (
              <EmptyState icon={BarChart3} title="No product activity in this period" />
            ) : (
              <TableWrap>
                <table className="w-full min-w-[820px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <Th>Product</Th>
                      <Th align="right">Demand qty</Th>
                      <Th align="right">Demand value</Th>
                      <Th align="right">Sold qty</Th>
                      <Th align="right">Sales value</Th>
                      <Th align="right">Stock on hand</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {productRows.map(row => (
                      <tr key={row.product_id} className="hover:bg-gray-50/60">
                        <Td>
                          <span className="font-medium text-gray-900">{row.product_name}</span>
                          <p className="mt-0.5 font-mono text-[11px] text-gray-400">{row.product_code}</p>
                        </Td>
                        <Td align="right" className="tabular-nums">{qty(row.demand_quantity)}</Td>
                        <Td align="right" className="tabular-nums">{money(row.demand_value)}</Td>
                        <Td align="right" className="tabular-nums font-medium">{qty(row.sold_quantity)}</Td>
                        <Td align="right" className="tabular-nums font-medium text-gray-900">
                          {money(row.sold_value)}
                        </Td>
                        <Td align="right" className="tabular-nums">
                          <span className={row.stock_on_hand === 0 ? 'text-red-600' : ''}>
                            {qty(row.stock_on_hand)}
                          </span>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </>
        )}

        {tab === 'distributor' && (
          <>
            <CardHeader title="Sales and outstanding by distributor" />
            {distributorRows.length === 0 ? (
              <EmptyState icon={BarChart3} title="No distributor sales in this period" />
            ) : (
              <TableWrap>
                <table className="w-full min-w-[720px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <Th>Distributor</Th>
                      <Th>City</Th>
                      <Th align="right">Invoices</Th>
                      <Th align="right">Sales value</Th>
                      <Th align="right">Outstanding</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {distributorRows.map(row => (
                      <tr key={row.distributor_id} className="hover:bg-gray-50/60">
                        <Td>
                          <span className="font-medium text-gray-900">{row.distributor_name}</span>
                          <p className="mt-0.5 font-mono text-[11px] text-gray-400">{row.distributor_code}</p>
                        </Td>
                        <Td>{row.city ?? '—'}</Td>
                        <Td align="right" className="tabular-nums">{qty(row.invoice_count)}</Td>
                        <Td align="right" className="tabular-nums font-medium text-gray-900">
                          {money(row.sales_value)}
                        </Td>
                        <Td align="right" className="tabular-nums">
                          <span className={row.outstanding > 0 ? 'font-semibold text-red-700' : 'text-emerald-700'}>
                            {money(row.outstanding)}
                          </span>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </>
        )}

        {tab === 'territory' && (
          <>
            <CardHeader title="Activity by territory" />
            {territoryRows.length === 0 ? (
              <EmptyState icon={BarChart3} title="No territory activity in this period" />
            ) : (
              <TableWrap>
                <table className="w-full min-w-[760px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <Th>Territory</Th>
                      <Th align="right">MRs</Th>
                      <Th align="right">Doctor visits</Th>
                      <Th align="right">New doctors</Th>
                      <Th align="right">Chemist visits</Th>
                      <Th align="right">Orders</Th>
                      <Th align="right">Order value</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {territoryRows.map(row => (
                      <tr key={row.territory} className="hover:bg-gray-50/60">
                        <Td className="font-medium text-gray-900">{row.territory}</Td>
                        <Td align="right" className="tabular-nums">{qty(row.mr_count)}</Td>
                        <Td align="right" className="tabular-nums font-medium">{qty(row.doctor_visits)}</Td>
                        <Td align="right" className="tabular-nums text-emerald-700">{qty(row.new_doctors)}</Td>
                        <Td align="right" className="tabular-nums">{qty(row.chemist_visits)}</Td>
                        <Td align="right" className="tabular-nums">{qty(row.field_orders)}</Td>
                        <Td align="right" className="tabular-nums font-medium text-gray-900">
                          {money(row.order_value)}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </>
        )}

        {tab === 'attendance' && (
          <>
            <CardHeader title="Attendance" />
            {!attendanceResult || attendanceResult.rows.length === 0 ? (
              <EmptyState icon={BarChart3} title="No attendance in this period" />
            ) : (
              <TableWrap>
                <table className="w-full min-w-[820px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <Th>Date</Th>
                      <Th>Employee</Th>
                      <Th>Role</Th>
                      <Th>Check-in</Th>
                      <Th>Check-out</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {attendanceResult.rows.map(row => (
                      <tr key={row.id} className="hover:bg-gray-50/60">
                        <Td>{formatDate(row.date)}</Td>
                        <Td className="font-medium text-gray-900">{row.erp_users?.name ?? '—'}</Td>
                        <Td>{row.erp_users?.role ?? '—'}</Td>
                        <Td>{formatClockTime(row.check_in_time)}</Td>
                        <Td>{formatClockTime(row.check_out_time)}</Td>
                        <Td><Badge className={ATTENDANCE_STATUS_STYLES[row.attendance_status]}>{ATTENDANCE_STATUS_LABELS[row.attendance_status]}</Badge></Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
            {attendanceResult && attendanceResult.total > attendanceResult.rows.length && (
              <p className="border-t border-gray-100 px-5 py-2.5 text-[11.5px] text-gray-400">
                Showing the first {attendanceResult.rows.length} of {attendanceResult.total} — export CSV for the full list.
              </p>
            )}
          </>
        )}

        {tab === 'leave' && (
          <>
            <CardHeader title="Leave requests" />
            {!leaveResult || leaveResult.rows.length === 0 ? (
              <EmptyState icon={BarChart3} title="No leave requests in this period" />
            ) : (
              <TableWrap>
                <table className="w-full min-w-[820px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <Th>Employee</Th>
                      <Th>Type</Th>
                      <Th>From</Th>
                      <Th>To</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {leaveResult.rows.map(row => (
                      <tr key={row.id} className="hover:bg-gray-50/60">
                        <Td className="font-medium text-gray-900">{row.erp_users?.name ?? '—'}</Td>
                        <Td>{row.erp_leave_types?.name ?? '—'}</Td>
                        <Td>{formatDate(row.from_date)}</Td>
                        <Td>{formatDate(row.to_date)}</Td>
                        <Td><Badge className={LEAVE_STATUS_STYLES[row.status]}>{LEAVE_STATUS_LABELS[row.status]}</Badge></Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
            {leaveResult && leaveResult.total > leaveResult.rows.length && (
              <p className="border-t border-gray-100 px-5 py-2.5 text-[11.5px] text-gray-400">
                Showing the first {leaveResult.rows.length} of {leaveResult.total} — export CSV for the full list.
              </p>
            )}
          </>
        )}

        {tab === 'payroll' && (
          <>
            <CardHeader title={`Payroll — ${MONTHS[payrollMonth - 1]} ${payrollYear}`} />
            {!payrollPeriod ? (
              <EmptyState icon={BarChart3} title="No payroll generated for this month" />
            ) : payrollRows.length === 0 ? (
              <EmptyState icon={BarChart3} title="No payroll records" />
            ) : (
              <TableWrap>
                <table className="w-full min-w-[820px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <Th>Employee</Th>
                      <Th align="right">Payable days</Th>
                      <Th align="right">Incentives</Th>
                      <Th align="right">Deductions</Th>
                      <Th align="right">Net salary</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {payrollRows.map(row => (
                      <tr key={row.id} className="hover:bg-gray-50/60">
                        <Td className="font-medium text-gray-900">{row.employee_name}</Td>
                        <Td align="right" className="tabular-nums">{row.payable_days} / {row.working_days}</Td>
                        <Td align="right" className="tabular-nums">{money(row.incentives)}</Td>
                        <Td align="right" className="tabular-nums">{money(row.deductions)}</Td>
                        <Td align="right" className="tabular-nums font-semibold text-gray-900">{money(row.net_salary)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </>
        )}

        {tab === 'expenses' && (
          <>
            <CardHeader title="Expenses" />
            {!expenseResult || expenseResult.rows.length === 0 ? (
              <EmptyState icon={BarChart3} title="No expenses in this period" />
            ) : (
              <TableWrap>
                <table className="w-full min-w-[820px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <Th>Date</Th>
                      <Th>Employee</Th>
                      <Th>Category</Th>
                      <Th align="right">Amount</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {expenseResult.rows.map(row => (
                      <tr key={row.id} className="hover:bg-gray-50/60">
                        <Td>{formatDate(row.expense_date)}</Td>
                        <Td className="font-medium text-gray-900">{row.erp_users?.name ?? '—'}</Td>
                        <Td>{EXPENSE_CATEGORY_LABELS[row.category]}</Td>
                        <Td align="right" className="tabular-nums">{money(row.amount)}</Td>
                        <Td><Badge className={EXPENSE_STATUS_STYLES[row.status]}>{EXPENSE_STATUS_LABELS[row.status]}</Badge></Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
            {expenseResult && expenseResult.total > expenseResult.rows.length && (
              <p className="border-t border-gray-100 px-5 py-2.5 text-[11.5px] text-gray-400">
                Showing the first {expenseResult.rows.length} of {expenseResult.total} — export CSV for the full list.
              </p>
            )}
          </>
        )}
      </Card>
    </>
  )
}
