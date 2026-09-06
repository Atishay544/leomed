import Link from 'next/link'
import { Wallet } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { listPayrollPeriods } from '@/lib/erp/data/payroll'
import { PAYROLL_STATUS_LABELS, PAYROLL_STATUS_STYLES } from '@/lib/erp/format'
import GeneratePayrollForm from '@/components/erp/payroll/GeneratePayrollForm'
import { Badge, Card, CardHeader, EmptyState, PageHeader, TableWrap, Td, Th } from '@/components/erp/ui'

export const metadata = { title: 'Payroll' }

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default async function PayrollPage() {
  await requireCapability('payroll.manage')
  const periods = await listPayrollPeriods()

  return (
    <>
      <PageHeader
        title="Payroll"
        description="Select a month to generate preliminary payroll. Admin review and finalization always happen after, never automatically."
      />

      <div className="mb-6">
        <GeneratePayrollForm />
      </div>

      <Card padded={false}>
        <CardHeader title="Payroll periods" />
        {periods.length === 0 ? (
          <EmptyState icon={Wallet} title="No payroll generated yet" />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[500px]">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Month</Th>
                  <Th>Status</Th>
                  <Th align="right">Open</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {periods.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50/60">
                    <Td className="font-medium text-gray-900">{MONTHS[p.period_month - 1]} {p.period_year}</Td>
                    <Td><Badge className={PAYROLL_STATUS_STYLES[p.status]}>{PAYROLL_STATUS_LABELS[p.status]}</Badge></Td>
                    <Td align="right">
                      <Link href={`/erp/payroll/${p.id}`} className="text-[12.5px] font-medium text-emerald-700 hover:underline">
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
