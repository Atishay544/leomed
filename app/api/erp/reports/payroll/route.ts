import { NextRequest, NextResponse } from 'next/server'
import { getErpSession } from '@/lib/erp/auth'
import { can } from '@/lib/erp/permissions'
import { erpDb } from '@/lib/erp/data/query'
import { toCsv } from '@/lib/csv'
import type { ErpPayrollRecord } from '@/lib/erp/types'

const ROW_CAP = 20_000

export async function GET(req: NextRequest) {
  const session = await getErpSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!can(session.role, 'payroll.manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = req.nextUrl
  const year = Number(searchParams.get('year'))
  const month = Number(searchParams.get('month'))
  if (!year || !month) return NextResponse.json({ error: 'year and month are required' }, { status: 400 })

  const db = await erpDb()
  const { data: period } = await db
    .from('erp_payroll_periods')
    .select('id')
    .eq('period_year', year).eq('period_month', month)
    .maybeSingle()

  if (!period) {
    return new NextResponse(toCsv([], [{ key: 'note', label: 'Note' }]), {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="payroll-${year}-${month}.csv"` },
    })
  }

  const { data } = await db
    .from('erp_payroll_records')
    .select('*')
    .eq('payroll_period_id', (period as { id: string }).id)
    .order('employee_name', { ascending: true })
    .limit(ROW_CAP)

  const rows = (data ?? []) as ErpPayrollRecord[]

  const csv = toCsv(
    rows.map(r => ({
      employee: r.employee_name,
      designation: r.designation ?? '',
      department: r.department ?? '',
      working_days: r.working_days,
      present_days: r.present_days,
      half_days: r.half_days,
      paid_leave_days: r.paid_leave_days,
      unpaid_leave_days: r.unpaid_leave_days,
      absent_days: r.absent_days,
      holiday_days: r.holiday_days,
      week_off_days: r.week_off_days,
      payable_days: r.payable_days,
      fixed_salary: r.fixed_salary,
      incentives: r.incentives,
      other_earnings: r.other_earnings,
      deductions: r.deductions,
      net_salary: r.net_salary,
    })),
    [
      { key: 'employee', label: 'Employee' },
      { key: 'designation', label: 'Designation' },
      { key: 'department', label: 'Department' },
      { key: 'working_days', label: 'Working Days' },
      { key: 'present_days', label: 'Present Days' },
      { key: 'half_days', label: 'Half Days' },
      { key: 'paid_leave_days', label: 'Paid Leave' },
      { key: 'unpaid_leave_days', label: 'Unpaid Leave' },
      { key: 'absent_days', label: 'Absent' },
      { key: 'holiday_days', label: 'Holidays' },
      { key: 'week_off_days', label: 'Week Offs' },
      { key: 'payable_days', label: 'Payable Days' },
      { key: 'fixed_salary', label: 'Fixed Salary' },
      { key: 'incentives', label: 'Incentives' },
      { key: 'other_earnings', label: 'Other Earnings' },
      { key: 'deductions', label: 'Deductions' },
      { key: 'net_salary', label: 'Net Salary' },
    ],
  )

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="payroll-${year}-${month}.csv"`,
    },
  })
}
