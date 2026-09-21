import { Route } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { listTravelAllowance } from '@/lib/erp/data/travel-allowance'
import { listMrs } from '@/lib/erp/data/users'
import { PAGE_SIZE, parsePage } from '@/lib/erp/data/query'
import { TRAVEL_ALLOWANCE_STATUSES } from '@/lib/erp/types'
import TravelAllowanceTable from '@/components/erp/payroll/TravelAllowanceTable'
import { FilterForm, FilterSelect, FilterDate } from '@/components/erp/FilterForm'
import Pagination from '@/components/erp/Pagination'
import { Card, EmptyState, PageHeader, TableWrap } from '@/components/erp/ui'

export const metadata = { title: 'Travel Allowance' }

interface Props {
  searchParams: Promise<{ page?: string; status?: string; mr?: string; from?: string; to?: string }>
}

export default async function TravelAllowancePage({ searchParams }: Props) {
  await requireCapability('payroll.manage')
  const params = await searchParams
  const page = parsePage(params.page)

  const [{ rows, total, pageCount }, mrs] = await Promise.all([
    listTravelAllowance({
      page,
      status: (params.status as 'ALL') ?? 'PENDING',
      mrId: params.mr,
      from: params.from,
      to: params.to,
    }),
    listMrs(),
  ])

  const hasFilters = !!(params.status || params.mr || params.from || params.to)

  return (
    <>
      <PageHeader
        title="Travel Allowance"
        description="Auto-detected daily from doctor/chemist visits — an MR's day is charged once per distinct chargeable area visited (see Masters → Areas). Nothing reaches payroll until approved here."
      />

      <Card padded={false}>
        <FilterForm action="/erp/payroll/travel-allowance" hasFilters={hasFilters}>
          <FilterSelect
            name="status" label="Status" defaultValue={params.status ?? 'PENDING'}
            options={TRAVEL_ALLOWANCE_STATUSES.map(s => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() }))}
            allLabel="All statuses"
          />
          <FilterSelect
            name="mr" label="MR" defaultValue={params.mr}
            options={mrs.map(m => ({ value: m.id, label: `${m.mr_code ?? ''} ${m.name}`.trim() }))}
            allLabel="All MRs"
          />
          <FilterDate name="from" label="From" defaultValue={params.from} />
          <FilterDate name="to" label="To" defaultValue={params.to} />
        </FilterForm>

        {rows.length === 0 ? (
          <EmptyState
            icon={Route}
            title="Nothing here"
            description="Either nothing has been auto-detected yet for this filter, or everything's already been reviewed."
          />
        ) : (
          <TableWrap>
            <TravelAllowanceTable rows={rows} />
          </TableWrap>
        )}

        <Pagination
          page={page} pageCount={pageCount} total={total} pageSize={PAGE_SIZE}
          searchParams={params} basePath="/erp/payroll/travel-allowance"
        />
      </Card>
    </>
  )
}
