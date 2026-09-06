import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Wallet } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { erpDb } from '@/lib/erp/data/query'
import { listPayrollRecords } from '@/lib/erp/data/payroll'
import { PAYROLL_STATUS_LABELS, PAYROLL_STATUS_STYLES, money } from '@/lib/erp/format'
import PayrollPeriodActions from '@/components/erp/payroll/PayrollPeriodActions'
import { Badge, Card, EmptyState, PageHeader, TableWrap, Td, Th } from '@/components/erp/ui'
import type { ErpPayrollPeriod } from '@/lib/erp/types'

export const metadata = { title: 'Payroll period' }

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface Props {
  params: Promise<{ periodId: string }>
}

export default async function PayrollPeriodPage({ params }: Props) {
  await requireCapability('payroll.manage')
  const { periodId } = await params

  const db = await erpDb()
  const { data: period } = await db.from('erp_payroll_periods').select('*').eq('id', periodId).maybeSingle()
  if (!period) notFound()
  const p = period as ErpPayrollPeriod

  const { rows } = await listPayrollRecords(periodId)
  const total = rows.reduce((sum, r) => sum + Number(r.net_salary), 0)

  return (
    <>
      <div className="mb-4">
        <Link href="/erp/payroll" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-gray-500 hover:text-gray-800">
          <ArrowLeft size={14} /> Payroll
        </Link>
      </div>

      <PageHeader
        title={`${MONTHS[p.period_month - 1]} ${p.period_year}`}
        description={
          <span className="flex items-center gap-2">
            <Badge className={PAYROLL_STATUS_STYLES[p.status]}>{PAYROLL_STATUS_LABELS[p.status]}</Badge>
            {rows.length} {rows.length === 1 ? 'employee' : 'employees'} · total {money(total)}
          </span>
        }
        action={<PayrollPeriodActions periodId={p.id} status={p.status} />}
      />

      <Card padded={false}>
        {rows.length === 0 ? (
          <EmptyState icon={Wallet} title="No payroll records" />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[900px]">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Employee</Th>
                  <Th align="right">Payable days</Th>
                  <Th align="right">Fixed salary</Th>
                  <Th align="right">Incentives</Th>
                  <Th align="right">Other earnings</Th>
                  <Th align="right">Deductions</Th>
                  <Th align="right">Net salary</Th>
                  <Th align="right">Detail</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50/60">
                    <Td>
                      <span className="font-medium text-gray-900">{r.employee_name}</span>
                      {r.department && <p className="text-[11px] text-gray-400">{r.department}</p>}
                    </Td>
                    <Td align="right" className="tabular-nums">{r.payable_days} / {r.working_days}</Td>
                    <Td align="right" className="tabular-nums">{money(r.fixed_salary)}</Td>
                    <Td align="right" className="tabular-nums">{r.incentives > 0 ? money(r.incentives) : '—'}</Td>
                    <Td align="right" className="tabular-nums">{r.other_earnings > 0 ? money(r.other_earnings) : '—'}</Td>
                    <Td align="right" className="tabular-nums">{money(r.deductions)}</Td>
                    <Td align="right" className="tabular-nums font-semibold text-gray-900">{money(r.net_salary)}</Td>
                    <Td align="right">
                      <Link href={`/erp/payroll/record/${r.id}`} className="text-[12.5px] font-medium text-emerald-700 hover:underline">
                        View
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </>
  )
}
