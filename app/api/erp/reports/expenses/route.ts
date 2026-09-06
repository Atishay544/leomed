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
  if (!can(session.role, 'expenses.manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = req.nextUrl
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const category = searchParams.get('category')
  const status = searchParams.get('status')

  const db = await erpDb()
  let query = db
    .from('erp_expenses')
    .select('expense_date, category, amount, vendor_name, description, payment_mode, status, notes, erp_users!erp_expenses_employee_id_fkey(name, role, department)')
    .order('expense_date', { ascending: false })
    .limit(ROW_CAP)

  if (from) query = query.gte('expense_date', from)
  if (to) query = query.lte('expense_date', to)
  if (category) query = query.eq('category', category)
  if (status && status !== 'ALL') query = query.eq('status', status)

  const { data } = await query
  const rows = (data ?? []) as unknown as {
    expense_date: string; category: string; amount: number; vendor_name: string | null
    description: string | null; payment_mode: string; status: string; notes: string | null
    erp_users: { name: string; role: string; department: string | null } | null
  }[]

  const csv = toCsv(
    rows.map(r => ({
      date: formatDate(r.expense_date),
      employee: r.erp_users?.name ?? '',
      role: r.erp_users?.role ?? '',
      department: r.erp_users?.department ?? '',
      category: r.category,
      vendor: r.vendor_name ?? '',
      description: r.description ?? '',
      amount: r.amount,
      payment_mode: r.payment_mode,
      status: r.status,
      notes: r.notes ?? '',
    })),
    [
      { key: 'date', label: 'Date' },
      { key: 'employee', label: 'Employee' },
      { key: 'role', label: 'Role' },
      { key: 'department', label: 'Department' },
      { key: 'category', label: 'Category' },
      { key: 'vendor', label: 'Vendor' },
      { key: 'description', label: 'Description' },
      { key: 'amount', label: 'Amount' },
      { key: 'payment_mode', label: 'Payment Mode' },
      { key: 'status', label: 'Status' },
      { key: 'notes', label: 'Notes' },
    ],
  )

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="expenses.csv"',
    },
  })
}
