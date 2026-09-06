import { NextRequest, NextResponse } from 'next/server'
import { getErpSession } from '@/lib/erp/auth'
import { can } from '@/lib/erp/permissions'
import { erpDb } from '@/lib/erp/data/query'
import { getPayslipDetail } from '@/lib/erp/data/payroll'
import { getErpSettings } from '@/lib/erp/data/settings'
import { generatePayslipPdf } from '@/lib/erp/payslip-pdf'

/**
 * Streams one payslip as a PDF. An employee may only ever fetch their own
 * (RLS on erp_payroll_records already enforces this at the query level, but
 * the ownership check here also produces a clean 403 instead of a confusing
 * "not found").
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ recordId: string }> },
) {
  const session = await getErpSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { recordId } = await params
  const { record, items } = await getPayslipDetail(recordId)
  if (!record) return NextResponse.json({ error: 'Payslip not found' }, { status: 404 })

  const isOwner = record.employee_id === session.id && can(session.role, 'payroll.read.own')
  const isAdmin = can(session.role, 'payroll.manage')
  if (!isOwner && !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const db = await erpDb()
  const [{ data: employeeRow }, settings] = await Promise.all([
    db.from('erp_users').select('employee_code, mr_code').eq('id', record.employee_id).maybeSingle(),
    getErpSettings(),
  ])

  const pdf = await generatePayslipPdf(
    record,
    record.erp_payroll_periods ?? { period_year: 0, period_month: 1, status: 'DRAFT' },
    items,
    {
      name: record.employee_name,
      employeeCode: (employeeRow as { employee_code: string | null } | null)?.employee_code ?? null,
      mrCode: (employeeRow as { mr_code: string | null } | null)?.mr_code ?? null,
      designation: record.designation,
      department: record.department,
    },
    { name: settings.company_name, address: settings.company_address },
  )

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="payslip-${record.employee_name.replace(/\s+/g, '-')}-${record.erp_payroll_periods?.period_month}-${record.erp_payroll_periods?.period_year}.pdf"`,
    },
  })
}
