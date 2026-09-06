import Link from 'next/link'
import {
  AlertTriangle, CalendarDays, CalendarOff, CheckCircle2, Clock, IndianRupee,
  Users, Wallet,
} from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { can } from '@/lib/erp/permissions'
import { getAttendanceSummary } from '@/lib/erp/data/attendance'
import { countPendingLeaveRequests } from '@/lib/erp/data/leave'
import { getExpenseSummary } from '@/lib/erp/data/expenses'
import { listPayrollPeriods, getPayrollPeriodTotals } from '@/lib/erp/data/payroll'
import { isoDate, money } from '@/lib/erp/format'
import { PAYROLL_STATUSES } from '@/lib/erp/types'
import { Card, CardHeader, PageHeader, StatCard } from '@/components/erp/ui'

export const metadata = { title: 'HR Overview' }

function currentMonthRange() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return { from: isoDate(from), to: isoDate(to), year: now.getFullYear(), month: now.getMonth() + 1 }
}

/**
 * The one screen an admin opens to answer "is anything wrong today, and how
 * is this month shaping up" without visiting five separate pages (spec §37).
 * Every number here links through to the page that can act on it.
 */
export default async function HrOverviewPage() {
  const session = await requireCapability('attendance.read.all')
  const today = isoDate()
  const month = currentMonthRange()

  const canPayroll = can(session.role, 'payroll.manage')
  const canExpenses = can(session.role, 'expenses.manage')
  const canLeave = can(session.role, 'leave.manage')

  const [summary, pendingLeave, expenseSummary, periods] = await Promise.all([
    getAttendanceSummary(today),
    canLeave ? countPendingLeaveRequests() : Promise.resolve(0),
    canExpenses ? getExpenseSummary(month.from, month.to) : Promise.resolve(null),
    canPayroll ? listPayrollPeriods() : Promise.resolve([]),
  ])

  const currentPeriod = periods.find(p => p.period_year === month.year && p.period_month === month.month) ?? null
  const payrollTotals = currentPeriod ? await getPayrollPeriodTotals(currentPeriod.id) : null

  const statusCounts = Object.fromEntries(PAYROLL_STATUSES.map(s => [s, periods.filter(p => p.status === s).length]))

  return (
    <>
      <PageHeader title="HR Overview" description="Today's attendance, this month's payroll and expenses, and what's waiting for review." />

      <h2 className="mb-2.5 text-[12px] font-semibold uppercase tracking-wide text-gray-500">Today&apos;s attendance</h2>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <StatCard label="Employees" value={summary.total_employees} icon={Users} href={`/erp/attendance/admin?date=${today}`} />
        <StatCard label="Present" value={summary.present} icon={CheckCircle2} tone="positive" href={`/erp/attendance/admin?date=${today}&status=PRESENT`} />
        <StatCard label="Absent" value={summary.absent} icon={CalendarOff} tone="critical" href={`/erp/attendance/admin?date=${today}&status=ABSENT`} />
        <StatCard label="Half day" value={summary.half_day} icon={Clock} tone="warning" href={`/erp/attendance/admin?date=${today}&status=HALF_DAY`} />
        <StatCard label="Leave" value={summary.leave} icon={CalendarDays} href={`/erp/attendance/admin?date=${today}&status=LEAVE`} />
        <StatCard label="Pending review" value={summary.pending_review} icon={AlertTriangle} tone="warning" href={`/erp/attendance/admin?date=${today}&status=PENDING_REVIEW`} />
        <StatCard label="Exceptions" value={summary.exceptions} icon={AlertTriangle} tone="warning" href={`/erp/attendance/admin?date=${today}&status=PRESENT_WITH_EXCEPTION`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {canLeave && (
          <Card>
            <CardHeader
              title="Leave"
              action={<Link href="/erp/leave/admin" className="text-[12px] font-medium text-emerald-700 hover:underline">Open</Link>}
            />
            <p className="mt-3 text-2xl font-bold tabular-nums text-gray-900">{pendingLeave}</p>
            <p className="mt-1 text-[12px] text-gray-500">Pending requests awaiting a decision</p>
          </Card>
        )}

        {canPayroll && (
          <Card>
            <CardHeader
              title="Payroll — this month"
              action={<Link href="/erp/payroll" className="text-[12px] font-medium text-emerald-700 hover:underline">Open</Link>}
            />
            {currentPeriod && payrollTotals ? (
              <>
                <p className="mt-3 text-2xl font-bold tabular-nums text-gray-900">{money(payrollTotals.total_net_salary)}</p>
                <p className="mt-1 text-[12px] text-gray-500">
                  {payrollTotals.employee_count} employees · {money(payrollTotals.total_incentives)} incentives · status {currentPeriod.status}
                </p>
              </>
            ) : (
              <p className="mt-3 text-[13px] text-gray-500">Not generated yet this month.</p>
            )}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {PAYROLL_STATUSES.map(s => (
                <span key={s} className="rounded-full bg-gray-100 px-2 py-0.5 text-[10.5px] font-medium text-gray-600">
                  {s}: {statusCounts[s]}
                </span>
              ))}
            </div>
          </Card>
        )}

        {canExpenses && expenseSummary && (
          <Card>
            <CardHeader
              title="Expenses — this month"
              action={<Link href="/erp/expenses/admin" className="text-[12px] font-medium text-emerald-700 hover:underline">Open</Link>}
            />
            <p className="mt-3 text-2xl font-bold tabular-nums text-gray-900">{money(expenseSummary.total)}</p>
            <p className="mt-1 text-[12px] text-gray-500">
              {money(Number(expenseSummary.by_status.SUBMITTED ?? 0))} awaiting approval ·{' '}
              {money(Number(expenseSummary.by_status.APPROVED ?? 0))} approved, not yet paid
            </p>
          </Card>
        )}

        <Card>
          <CardHeader
            title="Attendance exceptions"
            action={<Link href={`/erp/attendance/admin?date=${today}&status=PENDING_REVIEW`} className="text-[12px] font-medium text-emerald-700 hover:underline">Open</Link>}
          />
          <p className="mt-3 text-2xl font-bold tabular-nums text-gray-900">{summary.pending_review + summary.exceptions}</p>
          <p className="mt-1 text-[12px] text-gray-500">
            Missing check-out, poor GPS or an MR below their visit target — every one needs an admin look, none was auto-flagged as fraud.
          </p>
        </Card>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/erp/attendance/rules" className="rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-[12.5px] font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-1.5">
          <Wallet size={14} /> Attendance rules
        </Link>
        {canPayroll && (
          <Link href="/erp/payroll/salaries" className="rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-[12.5px] font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-1.5">
            <IndianRupee size={14} /> Salaries
          </Link>
        )}
        <Link href="/erp/reports" className="rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-[12.5px] font-medium text-gray-700 hover:bg-gray-50">
          Reports &amp; export
        </Link>
      </div>
    </>
  )
}
