import { Plane, Route } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { listTravelAllowance, listTravelDays } from '@/lib/erp/data/travel-allowance'
import { deleteTravelDay } from '@/lib/erp/actions/travel-allowance'
import { listMrs } from '@/lib/erp/data/users'
import { PAGE_SIZE, parsePage } from '@/lib/erp/data/query'
import { formatDate, money } from '@/lib/erp/format'
import { TRAVEL_ALLOWANCE_STATUSES } from '@/lib/erp/types'
import TravelAllowanceTable from '@/components/erp/payroll/TravelAllowanceTable'
import TravelDayDialog from '@/components/erp/payroll/TravelDayDialog'
import DeleteRowButton from '@/components/erp/DeleteRowButton'
import { FilterForm, FilterSelect, FilterDate } from '@/components/erp/FilterForm'
import Pagination from '@/components/erp/Pagination'
import { Card, CardHeader, EmptyState, PageHeader, TableWrap, Td, Th } from '@/components/erp/ui'

export const metadata = { title: 'Travel & Dearness Allowance' }

interface Props {
  searchParams: Promise<{ page?: string; status?: string; mr?: string; from?: string; to?: string }>
}

export default async function TravelAllowancePage({ searchParams }: Props) {
  await requireCapability('payroll.manage')
  const params = await searchParams
  const page = parsePage(params.page)

  const [{ rows, total, pageCount }, mrs, travelDays] = await Promise.all([
    listTravelAllowance({
      page,
      status: (params.status as 'ALL') ?? 'PENDING',
      mrId: params.mr,
      from: params.from,
      to: params.to,
    }),
    listMrs(),
    listTravelDays(),
  ])

  const hasFilters = !!(params.status || params.mr || params.from || params.to)

  return (
    <>
      <PageHeader
        title="Travel & Dearness Allowance"
        description="Auto-detected daily from doctor/chemist visits — an MR's day is charged once per distinct chargeable area visited, at that area's own TA and DA rates (see Masters → Areas). Nothing reaches payroll until approved here."
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

      <div className="mt-8">
        <Card padded={false}>
          <CardHeader
            title="Ad-hoc travel days (any employee)"
            action={<TravelDayDialog />}
          />
          <p className="border-b border-gray-100 px-5 py-2.5 text-[12px] text-gray-500">
            For someone the company is sending somewhere for a few days — Manager, Accountant, anyone, not just an MR.
            No review step: live for payroll as soon as it&apos;s saved. Flights, hotels etc. go under Expenses → Record
            company expense instead.
          </p>
          {travelDays.rows.length === 0 ? (
            <EmptyState icon={Plane} title="No trips assigned" />
          ) : (
            <TableWrap>
              <table className="w-full min-w-[720px]">
                <thead className="bg-gray-50">
                  <tr>
                    <Th>Employee</Th>
                    <Th>From</Th>
                    <Th>To</Th>
                    <Th align="right">₹/day</Th>
                    <Th>Purpose</Th>
                    <Th align="right">Remove</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {travelDays.rows.map(t => (
                    <tr key={t.id}>
                      <Td>
                        <span className="font-medium text-gray-900">{t.employee_name}</span>
                        {t.employee_code && <span className="ml-1.5 font-mono text-[11px] text-gray-400">{t.employee_code}</span>}
                      </Td>
                      <Td>{formatDate(t.from_date)}</Td>
                      <Td>{formatDate(t.to_date)}</Td>
                      <Td align="right" className="tabular-nums">{money(t.daily_amount)}</Td>
                      <Td className="max-w-[220px] truncate text-[12.5px] text-gray-600">{t.purpose ?? '—'}</Td>
                      <Td align="right">
                        <DeleteRowButton
                          id={t.id}
                          action={deleteTravelDay}
                          confirmText={`Remove ${t.employee_name}'s travel days from ${formatDate(t.from_date)} to ${formatDate(t.to_date)}? This does not affect any already-finalized payroll.`}
                        />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      </div>
    </>
  )
}
