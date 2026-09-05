import Link from 'next/link'
import { Plus, Store } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { listChemistVisits, parsePage } from '@/lib/erp/data/visits'
import { listMrs } from '@/lib/erp/data/users'
import { can } from '@/lib/erp/permissions'
import { PAGE_SIZE } from '@/lib/erp/data/query'
import { formatDate, formatTime, money, VISIT_PURPOSE_LABELS } from '@/lib/erp/format'
import { FilterDate, FilterForm, FilterSelect } from '@/components/erp/FilterForm'
import Pagination from '@/components/erp/Pagination'
import { ButtonLink, Card, EmptyState, PageHeader, TableWrap, Td, Th } from '@/components/erp/ui'

export const metadata = { title: 'Chemist Visits' }

interface Props {
  searchParams: Promise<{ page?: string; from?: string; to?: string; mr?: string }>
}

export default async function ChemistVisitsPage({ searchParams }: Props) {
  const session = await requireCapability('visits.read.own')
  const params = await searchParams
  const page = parsePage(params.page)

  const seesEveryone = can(session.role, 'visits.read.all')
  const mrFilter = seesEveryone ? params.mr : session.id

  const [{ rows, total, pageCount }, mrs] = await Promise.all([
    listChemistVisits({ page, mrId: mrFilter, from: params.from, to: params.to }),
    seesEveryone ? listMrs() : Promise.resolve([]),
  ])

  const hasFilters = !!(params.from || params.to || params.mr)

  return (
    <>
      <PageHeader
        title="Chemist Visits"
        description={seesEveryone
          ? 'Every chemist and medical-store visit recorded by the field force.'
          : 'Visits you have recorded.'}
        action={can(session.role, 'visits.create') && (
          <ButtonLink href="/erp/mr/chemist-visits/new">
            <Plus size={15} /> New visit
          </ButtonLink>
        )}
      />

      <Card padded={false}>
        <FilterForm action="/erp/mr/chemist-visits" hasFilters={hasFilters}>
          <FilterDate name="from" label="From" defaultValue={params.from} />
          <FilterDate name="to"   label="To"   defaultValue={params.to} />
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
            icon={Store}
            title={hasFilters ? 'No visits match those filters' : 'No chemist visits yet'}
            description={hasFilters
              ? 'Try widening the date range or clearing the filters.'
              : 'Record your first chemist visit and it will show up here.'}
            action={can(session.role, 'visits.create') && (
              <ButtonLink href="/erp/mr/chemist-visits/new"><Plus size={15} /> Record a visit</ButtonLink>
            )}
          />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[860px]">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Date</Th>
                  <Th>Chemist</Th>
                  {seesEveryone && <Th>MR</Th>}
                  <Th>Purpose</Th>
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
                          {visit.erp_chemists?.chemist_name ?? '—'}
                        </span>
                        {(visit.erp_chemists?.area || visit.erp_chemists?.city) && (
                          <p className="mt-0.5 text-[11.5px] text-gray-400">
                            {[visit.erp_chemists?.area, visit.erp_chemists?.city].filter(Boolean).join(', ')}
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
                          href={`/erp/mr/chemist-visits/${visit.id}`}
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
          searchParams={params} basePath="/erp/mr/chemist-visits"
        />
      </Card>
    </>
  )
}
