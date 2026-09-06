import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { getPayslipDetail } from '@/lib/erp/data/payroll'
import { money, PAYROLL_STATUS_LABELS, PAYROLL_STATUS_STYLES } from '@/lib/erp/format'
import PayrollItemsPanel from '@/components/erp/payroll/PayrollItemsPanel'
import PayslipActions from '@/components/erp/payroll/PayslipActions'
import { Badge, Card } from '@/components/erp/ui'

export const metadata = { title: 'Payroll record' }

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface Props {
  params: Promise<{ recordId: string }>
}

export default async function PayrollRecordPage({ params }: Props) {
  await requireCapability('payroll.manage')
  const { recordId } = await params

  const { record, items } = await getPayslipDetail(recordId)
  if (!record) notFound()

  const period = record.erp_payroll_periods
  const editable = period ? !['FINALIZED', 'PAID'].includes(period.status) : false

  return (
    <>
      <div className="mb-4">
        <Link
          href={period ? `/erp/payroll/${record.payroll_period_id}` : '/erp/payroll'}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft size={14} /> Back
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-lg font-bold text-gray-900">{record.employee_name}</h1>
                <p className="mt-0.5 text-[12.5px] text-gray-500">
                  {record.designation}{record.department && ` · ${record.department}`}
                  {period && ` · ${MONTHS[period.period_month - 1]} ${period.period_year}`}
                </p>
              </div>
              {period && <Badge className={PAYROLL_STATUS_STYLES[period.status]}>{PAYROLL_STATUS_LABELS[period.status]}</Badge>}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-5">
              <Stat label="Working days" value={record.working_days} />
              <Stat label="Present" value={record.present_days} />
              <Stat label="Half days" value={record.half_days} />
              <Stat label="Paid leave" value={record.paid_leave_days} />
              <Stat label="Unpaid leave" value={record.unpaid_leave_days} />
              <Stat label="Absent" value={record.absent_days} />
              <Stat label="Holidays" value={record.holiday_days} />
              <Stat label="Week offs" value={record.week_off_days} />
              <Stat label="Payable days" value={record.payable_days} highlight />
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 text-[13.5px] font-semibold text-gray-800">Incentives, earnings &amp; deductions</h2>
            {!editable && (
              <p className="mb-3 rounded-lg bg-gray-50 px-3 py-2 text-[12px] text-gray-500">
                This payroll is {period?.status.toLowerCase()} — reopen it from the period page to make changes.
              </p>
            )}
            <PayrollItemsPanel recordId={record.id} items={items} editable={editable} />
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 text-[13px] font-semibold text-gray-800">Salary breakdown</h2>
            <dl className="space-y-2 text-[13px]">
              <Row label="Fixed salary (full)" value={money(record.fixed_salary)} />
              <Row label="Prorated (payable days)" value={money(record.fixed_salary * record.payable_days / (record.working_days || 1))} />
              <Row label="Allowances" value={money(record.allowances)} />
              <Row label="Incentives" value={money(record.incentives)} tone="positive" />
              <Row label="Other earnings" value={money(record.other_earnings)} tone="positive" />
              <Row label="Deductions" value={`− ${money(record.deductions)}`} tone="negative" />
              <div className="flex justify-between border-t border-gray-100 pt-2">
                <dt className="font-semibold text-gray-700">Net salary</dt>
                <dd className="text-[16px] font-bold tabular-nums text-gray-900">{money(record.net_salary)}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <h2 className="mb-3 text-[13px] font-semibold text-gray-800">Payslip</h2>
            <PayslipActions recordId={record.id} />
          </Card>
        </div>
      </div>
    </>
  )
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[10.5px] text-gray-500">{label}</p>
      <p className={`text-[15px] font-semibold tabular-nums ${highlight ? 'text-emerald-700' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'positive' | 'negative' }) {
  const color = tone === 'positive' ? 'text-emerald-700' : tone === 'negative' ? 'text-red-700' : 'text-gray-900'
  return (
    <div className="flex justify-between">
      <dt className="text-gray-500">{label}</dt>
      <dd className={`tabular-nums ${color}`}>{value}</dd>
    </div>
  )
}
