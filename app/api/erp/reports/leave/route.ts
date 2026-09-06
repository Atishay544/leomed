import { NextRequest, NextResponse } from 'next/server'
import { getErpSession } from '@/lib/erp/auth'
import { can } from '@/lib/erp/permissions'
import { erpDb } from '@/lib/erp/data/query'
import { formatDate, formatDateTime } from '@/lib/erp/format'
import { toCsv } from '@/lib/csv'

const ROW_CAP = 20_000

export async function GET(req: NextRequest) {
  const session = await getErpSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!can(session.role, 'leave.manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = req.nextUrl
  const status = searchParams.get('status')
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  const db = await erpDb()
  let query = db
    .from('erp_leave_requests')
    .select('from_date, to_date, reason, status, admin_remarks, created_at, reviewed_at, erp_leave_types(name, is_paid), erp_users!erp_leave_requests_employee_id_fkey(name, role, department)')
    .order('created_at', { ascending: false })
    .limit(ROW_CAP)

  if (status && status !== 'ALL') query = query.eq('status', status)
  if (from) query = query.gte('to_date', from)
  if (to) query = query.lte('from_date', to)

  const { data } = await query
  const rows = (data ?? []) as unknown as {
    from_date: string; to_date: string; reason: string | null; status: string
    admin_remarks: string | null; created_at: string; reviewed_at: string | null
    erp_leave_types: { name: string; is_paid: boolean } | null
    erp_users: { name: string; role: string; department: string | null } | null
  }[]

  const csv = toCsv(
    rows.map(r => ({
      employee: r.erp_users?.name ?? '',
      role: r.erp_users?.role ?? '',
      department: r.erp_users?.department ?? '',
      leave_type: r.erp_leave_types?.name ?? '',
      paid: r.erp_leave_types?.is_paid ? 'Yes' : 'No',
      from_date: formatDate(r.from_date),
      to_date: formatDate(r.to_date),
      reason: r.reason ?? '',
      status: r.status,
      admin_remarks: r.admin_remarks ?? '',
      applied_on: formatDateTime(r.created_at),
      reviewed_on: r.reviewed_at ? formatDateTime(r.reviewed_at) : '',
    })),
    [
      { key: 'employee', label: 'Employee' },
      { key: 'role', label: 'Role' },
      { key: 'department', label: 'Department' },
      { key: 'leave_type', label: 'Leave Type' },
      { key: 'paid', label: 'Paid' },
      { key: 'from_date', label: 'From' },
      { key: 'to_date', label: 'To' },
      { key: 'reason', label: 'Reason' },
      { key: 'status', label: 'Status' },
      { key: 'admin_remarks', label: 'Admin Remarks' },
      { key: 'applied_on', label: 'Applied On' },
      { key: 'reviewed_on', label: 'Reviewed On' },
    ],
  )

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="leave-requests.csv"',
    },
  })
}
