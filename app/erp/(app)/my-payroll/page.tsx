import { IndianRupee } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { listMyPayrollRecords } from '@/lib/erp/data/payroll'
import { PAGE_SIZE, parsePage } from '@/lib/erp/data/query'
import { money, PAYROLL_STATUS_LABELS, PAYROLL_STATUS_STYLES } from '@/lib/erp/format'
import Pagination from '@/components/erp/Pagination'
import PayslipActions from '@/components/erp/payroll/PayslipActions'
import { Badge, Card, EmptyState, PageHeader } from '@/components/erp/ui'

export const metadata = { title: 'My Payroll' }

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface Props {
  searchParams: Promise<{ page?: string }>
}

export default async function MyPayrollPage({ searchParams }: Props) {
  const session = await requireCapability('payroll.read.own')
  const params = await searchParams
  const page = parsePage(params.page)

  const { rows, total, pageCount } = await listMyPayrollRecords(session.id, page)

  return (
    <>
      <PageHeader title="My Payroll" description="Your own salary and payslips. Nobody else's payroll is shown here." />

      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={IndianRupee} title="No payroll yet" description="Your payslips will appear here once payroll has been run for you." />
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map(r => {
            const period = r.erp_payroll_periods
            return (
              <Card key={r.id}>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-[14px] font-semibold text-gray-900">
                      {period ? `${MONTHS[period.period_month - 1]} ${period.period_year}` : '—'}
                    </p>
                    <p className="mt-0.5 text-[12px] text-gray-500">
                      Net salary <span className="font-semibold text-gray-900">{money(r.net_salary)}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {period && <Badge className={PAYROLL_STATUS_STYLES[period.status as keyof typeof PAYROLL_STATUS_STYLES]}>
                      {PAYROLL_STATUS_LABELS[period.status as keyof typeof PAYROLL_STATUS_LABELS]}
                    </Badge>}
                    <PayslipActions recordId={r.id} />
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <div className="mt-4">
        <Pagination page={page} pageCount={pageCount} total={total} pageSize={PAGE_SIZE} searchParams={params} basePath="/erp/my-payroll" />
      </div>
    </>
  )
}
