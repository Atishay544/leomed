import Link from 'next/link'
import { Plus, Stethoscope } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { listDoctorVisits, parsePage } from '@/lib/erp/data/visits'
import { listMrs } from '@/lib/erp/data/users'
import { can } from '@/lib/erp/permissions'
import { PAGE_SIZE } from '@/lib/erp/data/query'
import { DOCTOR_STATUS_LABELS, formatDate, formatTime, money, VISIT_PURPOSE_LABELS } from '@/lib/erp/format'
import { FilterDate, FilterForm, FilterSelect } from '@/components/erp/FilterForm'
import Pagination from '@/components/erp/Pagination'
import { Badge, ButtonLink, Card, EmptyState, PageHeader, TableWrap, Td, Th } from '@/components/erp/ui'

export const metadata = { title: 'Doctor Visits' }

interface Props {
  searchParams: Promise<{
    page?: string; from?: string; to?: string; mr?: string; status?: string
  }>
}

export default async function DoctorVisitsPage({ searchParams }: Props) {
  const session = await requireCapability('visits.read.own')
  const params = await searchParams
  const page = parsePage(params.page)

  const seesEveryone = can(session.role, 'visits.read.all')

  // RLS already limits an MR to their own visits; passing mr_id explicitly is
  // only meaningful for someone who can see the whole field force.
  const mrFilter = seesEveryone ? params.mr : session.id

  const [{ rows, total, pageCount }, mrs] = await Promise.all([
    listDoctorVisits({
      page, mrId: mrFilter, from: params.from, to: params.to, status: params.status,
    }),
    seesEveryone ? listMrs() : Promise.resolve([]),
  ])

  const hasFilters = !!(params.from || params.to || params.mr || params.status)

  return (
    <>
      <PageHeader
        title="Doctor Visits"
        description={seesEveryone
          ? 'Every doctor visit recorded by the field force.'
          : 'Visits you have recorded.'}
        action={can(session.role, 'visits.create') && (
          <ButtonLink href="/erp/mr/doctor-visits/new">
            <Plus size={15} /> New visit
          </ButtonLink>
        )}
      />

      <Card padded={false}>
        <FilterForm action="/erp/mr/doctor-visits" hasFilters={hasFilters}>
          <FilterDate name="from" label="From" defaultValue={params.from} />
          <FilterDate name="to"   label="To"   defaultValue={params.to} />
          <FilterSelect
            name="status" label="Doctor" defaultValue={params.status}
            options={[
              { value: 'NEW',      label: 'New doctors' },
              { value: 'EXISTING', label: 'Existing doctors' },
            ]}
          />
          {seesEveryone && mrs.length > 0 && (
            <FilterSelect
              name="mr" label="MR" defaultValue={params.mr}
              options={mrs.map(m => ({
                value: m.id,
                label: m.mr_code ? `${m.mr_code} — ${m.name}` : m.name,
              }))}
              allLabel="All MRs"
            />
          )}
        </FilterForm>

        {rows.length === 0 ? (
          <EmptyState
            icon={Stethoscope}
            title={hasFilters ? 'No visits match those filters' : 'No doctor visits yet'}
            description={hasFilters
              ? 'Try widening the date range or clearing the filters.'
              : 'Record your first visit and it will show up here.'}
            action={can(session.role, 'visits.create') && (
              <ButtonLink href="/erp/mr/doctor-visits/new"><Plus size={15} /> Record a visit</ButtonLink>
            )}
          />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[900px]">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Date</Th>
                  <Th>Doctor</Th>
                  {seesEveryone && <Th>MR</Th>}
                  <Th>Purpose</Th>
                  <Th align="center">Products</Th>
                  <Th>Order</Th>
                  <Th align="right"></Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(visit => {
                  const order = visit.erp_field_orders?.[0]
                  return (
                    <tr key={visit.id} className="hover:bg-gray-50/60">
                      <Td>
                        {formatDate(visit.visit_date)}
                        {visit.visit_time && (
                          <p className="mt-0.5 text-[11.5px] text-gray-400">{formatTime(visit.visit_time)}</p>
                        )}
                      </Td>
                      <Td>
                        <span className="font-medium text-gray-900">
                          {visit.erp_doctors?.doctor_name ?? '—'}
                        </span>
                        <Badge className={`ml-2 ${
                          visit.doctor_status === 'NEW'
                            ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                            : 'bg-gray-100 text-gray-600 ring-gray-500/20'
                        }`}>
                          {DOCTOR_STATUS_LABELS[visit.doctor_status]}
                        </Badge>
                        {(visit.erp_doctors?.area || visit.erp_doctors?.city) && (
                          <p className="mt-0.5 text-[11.5px] text-gray-400">
                            {[visit.erp_doctors?.area, visit.erp_doctors?.city].filter(Boolean).join(', ')}
                          </p>
                        )}
                      </Td>
                      {seesEveryone && (
                        <Td>
                          {visit.erp_users?.name ?? '—'}
                          {visit.erp_users?.mr_code && (
                            <p className="mt-0.5 font-mono text-[11px] text-gray-400">{visit.erp_users.mr_code}</p>
                          )}
                        </Td>
                      )}
                      <Td>{VISIT_PURPOSE_LABELS[visit.purpose]}</Td>
                      <Td align="center" className="tabular-nums">
                        {visit.erp_doctor_visit_products?.length ?? 0}
                      </Td>
                      <Td>
                        {order ? (
                          <Link href={`/erp/mr/orders/${order.id}`} className="text-emerald-700 hover:underline">
                            <span className="font-mono text-[11.5px]">{order.order_number}</span>
                            <p className="mt-0.5 text-[11.5px] tabular-nums text-gray-500">
                              {money(order.estimated_value)}
                            </p>
                          </Link>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </Td>
                      <Td align="right">
                        <Link
                          href={`/erp/mr/doctor-visits/${visit.id}`}
                          className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-[12px]
                                     font-medium text-gray-700 transition hover:bg-gray-50"
                        >
                          View
                        </Link>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableWrap>
        )}

        <Pagination
          page={page} pageCount={pageCount} total={total} pageSize={PAGE_SIZE}
          searchParams={params} basePath="/erp/mr/doctor-visits"
        />
      </Card>
    </>
  )
}
