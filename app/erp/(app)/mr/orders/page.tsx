import Link from 'next/link'
import { ClipboardList } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { listFieldOrders, parsePage } from '@/lib/erp/data/visits'
import { listMrs } from '@/lib/erp/data/users'
import { can } from '@/lib/erp/permissions'
import { PAGE_SIZE } from '@/lib/erp/data/query'
import {
  FIELD_ORDER_STATUS_LABELS, FIELD_ORDER_STATUS_STYLES, formatDate, money, qty,
} from '@/lib/erp/format'
import { FIELD_ORDER_STATUSES } from '@/lib/erp/types'
import { FilterDate, FilterForm, FilterSelect } from '@/components/erp/FilterForm'
import Pagination from '@/components/erp/Pagination'
import { Badge, Card, EmptyState, PageHeader, TableWrap, Td, Th } from '@/components/erp/ui'

export const metadata = { title: 'Field Orders' }

interface Props {
  searchParams: Promise<{
    page?: string; from?: string; to?: string; mr?: string
    status?: string; type?: string
  }>
}

export default async function FieldOrdersPage({ searchParams }: Props) {
  const session = await requireCapability('orders.read.own')
  const params = await searchParams
  const page = parsePage(params.page)

  const seesEveryone = can(session.role, 'orders.read.all')
  const mrFilter = seesEveryone ? params.mr : session.id

  const [{ rows, total, pageCount }, mrs] = await Promise.all([
    listFieldOrders({
      page, mrId: mrFilter, from: params.from, to: params.to,
      status: params.status,
      customerType: params.type === 'DOCTOR' || params.type === 'CHEMIST' ? params.type : undefined,
    }),
    seesEveryone ? listMrs() : Promise.resolve([]),
  ])

  const hasFilters = !!(params.from || params.to || params.mr || params.status || params.type)
  const totalValue = rows.reduce((sum, o) => sum + Number(o.estimated_value ?? 0), 0)

  return (
    <>
      <PageHeader
        title="Field Orders"
        description="Orders given to MRs by doctors and chemists, with an estimated value. A measure of demand and field performance."
      />

      {/* Stated plainly and permanently, because conflating the two is the
          single most consequential mistake this system can make (spec §29). */}
      <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
        <p className="text-[12.5px] leading-relaxed text-blue-900">
          <strong>Field orders are not company invoices.</strong> They record what doctors and
          chemists asked for, so you can measure demand and MR performance. Fulfilment usually
          happens through the distributor network. Leomed&apos;s own sales are recorded separately
          under Accounting → Sales.
        </p>
      </div>

      <Card padded={false}>
        <FilterForm action="/erp/mr/orders" hasFilters={hasFilters}>
          <FilterDate name="from" label="From" defaultValue={params.from} />
          <FilterDate name="to"   label="To"   defaultValue={params.to} />
          <FilterSelect
            name="type" label="From" defaultValue={params.type}
            options={[
              { value: 'DOCTOR',  label: 'Doctors' },
              { value: 'CHEMIST', label: 'Chemists' },
            ]}
          />
          <FilterSelect
            name="status" label="Status" defaultValue={params.status}
            options={FIELD_ORDER_STATUSES.map(s => ({ value: s, label: FIELD_ORDER_STATUS_LABELS[s] }))}
          />
          {seesEveryone && mrs.length > 0 && (
            <FilterSelect
              name="mr" label="MR" defaultValue={params.mr}
              options={mrs.map(m => ({
                value: m.id, label: m.mr_code ? `${m.mr_code} — ${m.name}` : m.name,
              }))}
              allLabel="All MRs"
            />
          )}
        </FilterForm>

        {rows.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={hasFilters ? 'No orders match those filters' : 'No field orders yet'}
            description={hasFilters
              ? 'Try widening the date range or clearing the filters.'
              : 'Orders recorded during a doctor or chemist visit appear here.'}
          />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[940px]">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Order</Th>
                  <Th>Date</Th>
                  <Th>From</Th>
                  {seesEveryone && <Th>MR</Th>}
                  <Th>Book no.</Th>
                  <Th align="center">Items</Th>
                  <Th align="right">Est. value</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(order => {
                  const customer = order.customer_type === 'DOCTOR'
                    ? order.erp_doctors?.doctor_name
                    : order.erp_chemists?.chemist_name
                  return (
                    <tr key={order.id} className="hover:bg-gray-50/60">
                      <Td>
                        <Link
                          href={`/erp/mr/orders/${order.id}`}
                          className="font-mono text-[12px] font-medium text-emerald-700 hover:underline"
                        >
                          {order.order_number}
                        </Link>
                      </Td>
                      <Td>{formatDate(order.order_date)}</Td>
                      <Td>
                        <span className="font-medium text-gray-900">{customer ?? '—'}</span>
                        <p className="mt-0.5 text-[11px] uppercase tracking-wide text-gray-400">
                          {order.customer_type === 'DOCTOR' ? 'Doctor' : 'Chemist'}
                        </p>
                      </Td>
                      {seesEveryone && (
                        <Td>
                          {order.erp_users?.mr_code ?? order.erp_users?.name ?? '—'}
                        </Td>
                      )}
                      <Td className="font-mono text-[11.5px] text-gray-600">
                        {order.order_book_number ?? '—'}
                      </Td>
                      <Td align="center" className="tabular-nums">
                        {order.erp_field_order_items?.length ?? 0}
                      </Td>
                      <Td align="right" className="tabular-nums font-medium text-gray-900">
                        {money(order.estimated_value)}
                      </Td>
                      <Td>
                        <Badge className={FIELD_ORDER_STATUS_STYLES[order.status]}>
                          {FIELD_ORDER_STATUS_LABELS[order.status]}
                        </Badge>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <Td className="font-semibold text-gray-700" >This page</Td>
                  <Td /><Td />
                  {seesEveryone && <Td />}
                  <Td />
                  <Td align="center" className="tabular-nums font-medium">
                    {qty(rows.reduce((s, o) => s + (o.erp_field_order_items?.length ?? 0), 0))}
                  </Td>
                  <Td align="right" className="tabular-nums font-bold text-gray-900">{money(totalValue)}</Td>
                  <Td />
                </tr>
              </tfoot>
            </table>
          </TableWrap>
        )}

        <Pagination
          page={page} pageCount={pageCount} total={total} pageSize={PAGE_SIZE}
          searchParams={params} basePath="/erp/mr/orders"
        />
      </Card>
    </>
  )
}
