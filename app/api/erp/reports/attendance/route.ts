import { NextRequest, NextResponse } from 'next/server'
import { getErpSession } from '@/lib/erp/auth'
import { can } from '@/lib/erp/permissions'
import { erpDb } from '@/lib/erp/data/query'
import { formatDate } from '@/lib/erp/format'
import { toCsv } from '@/lib/csv'

const ROW_CAP = 20_000

export async function GET(req: NextRequest) {
  const session = await getErpSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!can(session.role, 'attendance.read.all')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = req.nextUrl
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  if (!from || !to) return NextResponse.json({ error: 'from and to dates are required' }, { status: 400 })

  const db = await erpDb()
  let query = db
    .from('erp_attendance')
    .select('date, check_in_time, check_out_time, total_working_minutes, doctor_visit_count, chemist_visit_count, required_doctor_visits, required_chemist_visits, attendance_status, remarks, erp_users!inner(name, role, department, territory, mr_code)')
    .gte('date', from).lte('date', to)
    .order('date', { ascending: true })
    .limit(ROW_CAP)

  const role = searchParams.get('role')
  const department = searchParams.get('department')
  const territory = searchParams.get('territory')
  if (role) query = query.eq('erp_users.role', role)
  if (department) query = query.eq('erp_users.department', department)
  if (territory) query = query.eq('erp_users.territory', territory)

  const { data } = await query
  const rows = (data ?? []) as unknown as {
    date: string; check_in_time: string | null; check_out_time: string | null
    total_working_minutes: number | null; doctor_visit_count: number; chemist_visit_count: number
    required_doctor_visits: number | null; required_chemist_visits: number | null
    attendance_status: string; remarks: string | null
    erp_users: { name: string; role: string; department: string | null; territory: string | null; mr_code: string | null } | null
  }[]

  const csv = toCsv(
    rows.map(r => ({
      date: formatDate(r.date),
      employee: r.erp_users?.name ?? '',
      role: r.erp_users?.role ?? '',
      department: r.erp_users?.department ?? '',
      territory: r.erp_users?.territory ?? '',
      mr_code: r.erp_users?.mr_code ?? '',
      check_in: r.check_in_time ?? '',
      check_out: r.check_out_time ?? '',
      working_minutes: r.total_working_minutes ?? '',
      doctor_visits: r.doctor_visit_count,
      required_doctor_visits: r.required_doctor_visits ?? '',
      chemist_visits: r.chemist_visit_count,
      required_chemist_visits: r.required_chemist_visits ?? '',
      status: r.attendance_status,
      remarks: r.remarks ?? '',
    })),
    [
      { key: 'date', label: 'Date' },
      { key: 'employee', label: 'Employee' },
      { key: 'role', label: 'Role' },
      { key: 'department', label: 'Department' },
      { key: 'territory', label: 'Territory' },
      { key: 'mr_code', label: 'MR Code' },
      { key: 'check_in', label: 'Check-in' },
      { key: 'check_out', label: 'Check-out' },
      { key: 'working_minutes', label: 'Working Minutes' },
      { key: 'doctor_visits', label: 'Doctor Visits' },
      { key: 'required_doctor_visits', label: 'Required Doctor Visits' },
      { key: 'chemist_visits', label: 'Chemist Visits' },
      { key: 'required_chemist_visits', label: 'Required Chemist Visits' },
      { key: 'status', label: 'Status' },
      { key: 'remarks', label: 'Remarks' },
    ],
  )

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="attendance-${from}-to-${to}.csv"`,
    },
  })
}
