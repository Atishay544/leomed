import Link from 'next/link'
import { Gift } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { listPayrollPeriods, listPayrollRecordsForRole } from '@/lib/erp/data/payroll'
import { PAYROLL_STATUS_LABELS, PAYROLL_STATUS_STYLES } from '@/lib/erp/format'
import { ERP_ROLES } from '@/lib/erp/types'
import { ROLE_LABELS } from '@/lib/erp/permissions'
import { FilterForm, FilterSelect } from '@/components/erp/FilterForm'
import BulkIncentiveBonusTable from '@/components/erp/payroll/BulkIncentiveBonusTable'
import { Badge, Card, EmptyState, PageHeader } from '@/components/erp/ui'

export const metadata = { title: 'Incentives & Bonus' }

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface Props {
  searchParams: Promise<{ period?: string; role?: string }>
}

/**
 * One place to add a per-employee incentive or bonus for a payroll month,
 * a role at a time — instead of opening every employee's individual payroll
 * record (spec: admin asked for a single bulk screen rather than the
 * existing per-record PayrollItemsPanel drill-down).
 *
 * Reuses the existing addPayrollItem action/erp_add_payroll_item RPC as-is —
 * incentives and bonus are both just erp_payroll_item_type values, and the
 * RPC already refuses writes once a period is FINALIZED/PAID.
 */
export default async function PayrollIncentivesPage({ searchParams }: Props) {
  await requireCapability('payroll.manage')
  const params = await searchParams

  const periods = await listPayrollPeriods()
  if (periods.length === 0) {
    return (
      <>
        <PageHeader
          title="Incentives & Bonus"
          description="Add a per-employee incentive or bonus for a payroll month, one role at a time."
        />
        <Card>
          <EmptyState
            icon={Gift}
            title="No payroll period yet"
            description="Generate a payroll month first, then come back here to add incentives and bonuses."
            action={<Link href="/erp/payroll" className="text-[12.5px] font-medium text-emerald-700 hover:underline">Go to Payroll</Link>}
          />
        </Card>
      </>
    )
  }

  // periods is sorted newest first (listPayrollPeriods), so [0] is "latest".
  const period = periods.find(p => p.id === params.period) ?? periods[0]
  const role = params.role || ''
  const roleOptions = ERP_ROLES.filter(r => r !== 'ADMIN')

  const records = role ? await listPayrollRecordsForRole(period.id, role) : []
  const editable = !['FINALIZED', 'PAID'].includes(period.status)
  const hasFilters = !!(params.period || params.role)

  return (
    <>
      <PageHeader
        title="Incentives & Bonus"
        description="Pick a role to list every employee in it for the chosen month, then add an incentive or bonus for each — amounts can differ per employee."
      />

      <Card padded={false}>
        <FilterForm action="/erp/payroll/incentives" hasFilters={hasFilters}>
          <FilterSelect
            name="period" label="Month" defaultValue={period.id}
            options={periods.map(p => ({ value: p.id, label: `${MONTHS[p.period_month - 1]} ${p.period_year}` }))}
            allLabel="Latest month"
          />
          <FilterSelect
            name="role" label="Role" defaultValue={role}
            options={roleOptions.map(r => ({ value: r, label: ROLE_LABELS[r] }))}
            allLabel="Select a role…"
          />
        </FilterForm>

        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-3">
          <Badge className={PAYROLL_STATUS_STYLES[period.status]}>{PAYROLL_STATUS_LABELS[period.status]}</Badge>
          <span className="text-[12.5px] text-gray-500">{MONTHS[period.period_month - 1]} {period.period_year}</span>
          {!editable && (
            <span className="text-[12.5px] font-medium text-amber-700">
              This month is finalized — reopen it from Payroll before adding items.
            </span>
          )}
        </div>

        {!role ? (
          <EmptyState icon={Gift} title="Select a role" description="Choose a role above to list its employees for this month." />
        ) : records.length === 0 ? (
          <EmptyState icon={Gift} title="No payroll records for this role" description="Generate payroll for this month first, from the Payroll page." />
        ) : (
          <BulkIncentiveBonusTable records={records} editable={editable} />
        )}
      </Card>
    </>
  )
}
