import Link from 'next/link'
import { BarChart3 } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import {
  currentMonthRange, getDistributorPerformance, getMrPerformance,
  getProductPerformance, getTerritoryPerformance,
} from '@/lib/erp/data/dashboard'
import { formatDate, money, qty } from '@/lib/erp/format'
import { FilterDate, FilterForm } from '@/components/erp/FilterForm'
import { Card, CardHeader, EmptyState, PageHeader, TableWrap, Td, Th } from '@/components/erp/ui'

export const metadata = { title: 'Reports' }

const TABS = [
  { key: 'mr',          label: 'MR performance' },
  { key: 'product',     label: 'Products' },
  { key: 'distributor', label: 'Distributors' },
  { key: 'territory',   label: 'Territories' },
] as const

type TabKey = (typeof TABS)[number]['key']

interface Props {
  searchParams: Promise<{ tab?: string; from?: string; to?: string }>
}

export default async function ReportsPage({ searchParams }: Props) {
  await requireCapability('reports.read.all')
  const params = await searchParams

  const month = currentMonthRange()
  const from = params.from ?? month.from
  const to = params.to ?? month.to
  const tab: TabKey = (TABS.find(t => t.key === params.tab)?.key ?? 'mr')

  // Only the active tab's query runs — no point aggregating four reports to
  // show one.
  const [mrRows, productRows, distributorRows, territoryRows] = await Promise.all([
    tab === 'mr'          ? getMrPerformance(from, to)          : Promise.resolve([]),
    tab === 'product'     ? getProductPerformance(from, to)     : Promise.resolve([]),
    tab === 'distributor' ? getDistributorPerformance(from, to) : Promise.resolve([]),
    tab === 'territory'   ? getTerritoryPerformance(from, to)   : Promise.resolve([]),
  ])

  const tabHref = (key: string) => {
    const next = new URLSearchParams({ from, to })
    if (key !== 'mr') next.set('tab', key)
    return `/erp/reports?${next.toString()}`
  }

  return (
    <>
      <PageHeader
        title="Reports"
        description={`${formatDate(from)} — ${formatDate(to)}`}
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map(t => (
          <Link
            key={t.key}
            href={tabHref(t.key)}
            className={`rounded-lg px-3.5 py-2 text-[13px] font-semibold transition ${
              tab === t.key
                ? 'bg-emerald-700 text-white shadow-sm'
                : 'border border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <Card padded={false}>
        <FilterForm action="/erp/reports" hasFilters={!!(params.from || params.to)}>
          <input type="hidden" name="tab" value={tab} />
          <FilterDate name="from" label="From" defaultValue={from} />
          <FilterDate name="to"   label="To"   defaultValue={to} />
        </FilterForm>

        {tab === 'mr' && (
          <>
            <CardHeader title="Field-force activity by MR" />
            {mrRows.length === 0 ? (
              <EmptyState icon={BarChart3} title="No MR activity in this period" />
            ) : (
              <TableWrap>
                <table className="w-full min-w-[960px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <Th>MR</Th>
                      <Th>Territory</Th>
                      <Th align="right">Doctor visits</Th>
                      <Th align="right">Doctors covered</Th>
                      <Th align="right">New doctors</Th>
                      <Th align="right">Chemist visits</Th>
                      <Th align="right">Chemists covered</Th>
                      <Th align="right">Orders</Th>
                      <Th align="right">Order value</Th>
                      <Th align="right">Open follow-ups</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {mrRows.map(row => (
                      <tr key={row.mr_id} className="hover:bg-gray-50/60">
                        <Td>
                          <span className="font-medium text-gray-900">{row.mr_name}</span>
                          {row.mr_code && (
                            <p className="mt-0.5 font-mono text-[11px] text-gray-400">{row.mr_code}</p>
                          )}
                        </Td>
                        <Td>{row.territory ?? '—'}</Td>
                        <Td align="right" className="tabular-nums font-medium">{qty(row.doctor_visits)}</Td>
                        <Td align="right" className="tabular-nums">{qty(row.doctors_covered)}</Td>
                        <Td align="right" className="tabular-nums text-emerald-700">{qty(row.new_doctors)}</Td>
                        <Td align="right" className="tabular-nums">{qty(row.chemist_visits)}</Td>
                        <Td align="right" className="tabular-nums">{qty(row.chemists_covered)}</Td>
                        <Td align="right" className="tabular-nums">{qty(row.field_orders)}</Td>
                        <Td align="right" className="tabular-nums font-medium text-gray-900">
                          {money(row.order_value)}
                        </Td>
                        <Td align="right" className="tabular-nums">{qty(row.followups_open)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </>
        )}

        {tab === 'product' && (
          <>
            <CardHeader title="Field demand versus actual sales" />
            <p className="border-b border-gray-100 px-5 py-2.5 text-[12px] leading-relaxed text-gray-500">
              Demand is what doctors and chemists asked MRs for. Sales is what Leomed invoiced to
              distributors. They measure different things and are not expected to match.
            </p>
            {productRows.length === 0 ? (
              <EmptyState icon={BarChart3} title="No product activity in this period" />
            ) : (
              <TableWrap>
                <table className="w-full min-w-[820px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <Th>Product</Th>
                      <Th align="right">Demand qty</Th>
                      <Th align="right">Demand value</Th>
                      <Th align="right">Sold qty</Th>
                      <Th align="right">Sales value</Th>
                      <Th align="right">Stock on hand</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {productRows.map(row => (
                      <tr key={row.product_id} className="hover:bg-gray-50/60">
                        <Td>
                          <span className="font-medium text-gray-900">{row.product_name}</span>
                          <p className="mt-0.5 font-mono text-[11px] text-gray-400">{row.product_code}</p>
                        </Td>
                        <Td align="right" className="tabular-nums">{qty(row.demand_quantity)}</Td>
                        <Td align="right" className="tabular-nums">{money(row.demand_value)}</Td>
                        <Td align="right" className="tabular-nums font-medium">{qty(row.sold_quantity)}</Td>
                        <Td align="right" className="tabular-nums font-medium text-gray-900">
                          {money(row.sold_value)}
                        </Td>
                        <Td align="right" className="tabular-nums">
                          <span className={row.stock_on_hand === 0 ? 'text-red-600' : ''}>
                            {qty(row.stock_on_hand)}
                          </span>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </>
        )}

        {tab === 'distributor' && (
          <>
            <CardHeader title="Sales and outstanding by distributor" />
            {distributorRows.length === 0 ? (
              <EmptyState icon={BarChart3} title="No distributor sales in this period" />
            ) : (
              <TableWrap>
                <table className="w-full min-w-[720px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <Th>Distributor</Th>
                      <Th>City</Th>
                      <Th align="right">Invoices</Th>
                      <Th align="right">Sales value</Th>
                      <Th align="right">Outstanding</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {distributorRows.map(row => (
                      <tr key={row.distributor_id} className="hover:bg-gray-50/60">
                        <Td>
                          <span className="font-medium text-gray-900">{row.distributor_name}</span>
                          <p className="mt-0.5 font-mono text-[11px] text-gray-400">{row.distributor_code}</p>
                        </Td>
                        <Td>{row.city ?? '—'}</Td>
                        <Td align="right" className="tabular-nums">{qty(row.invoice_count)}</Td>
                        <Td align="right" className="tabular-nums font-medium text-gray-900">
                          {money(row.sales_value)}
                        </Td>
                        <Td align="right" className="tabular-nums">
                          <span className={row.outstanding > 0 ? 'font-semibold text-red-700' : 'text-emerald-700'}>
                            {money(row.outstanding)}
                          </span>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </>
        )}

        {tab === 'territory' && (
          <>
            <CardHeader title="Activity by territory" />
            {territoryRows.length === 0 ? (
              <EmptyState icon={BarChart3} title="No territory activity in this period" />
            ) : (
              <TableWrap>
                <table className="w-full min-w-[760px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <Th>Territory</Th>
                      <Th align="right">MRs</Th>
                      <Th align="right">Doctor visits</Th>
                      <Th align="right">New doctors</Th>
                      <Th align="right">Chemist visits</Th>
                      <Th align="right">Orders</Th>
                      <Th align="right">Order value</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {territoryRows.map(row => (
                      <tr key={row.territory} className="hover:bg-gray-50/60">
                        <Td className="font-medium text-gray-900">{row.territory}</Td>
                        <Td align="right" className="tabular-nums">{qty(row.mr_count)}</Td>
                        <Td align="right" className="tabular-nums font-medium">{qty(row.doctor_visits)}</Td>
                        <Td align="right" className="tabular-nums text-emerald-700">{qty(row.new_doctors)}</Td>
                        <Td align="right" className="tabular-nums">{qty(row.chemist_visits)}</Td>
                        <Td align="right" className="tabular-nums">{qty(row.field_orders)}</Td>
                        <Td align="right" className="tabular-nums font-medium text-gray-900">
                          {money(row.order_value)}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </>
        )}
      </Card>
    </>
  )
}
