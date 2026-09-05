import Link from 'next/link'
import {
  ArrowRight, ClipboardList, IndianRupee, Receipt, Stethoscope, Store,
  UserPlus, Warehouse, AlertTriangle,
} from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { currentMonthRange, getDashboardSummary, getMrPerformance } from '@/lib/erp/data/dashboard'
import { getStockSummary } from '@/lib/erp/data/inventory'
import { getErpSettings } from '@/lib/erp/data/settings'
import { listMrs, listErpUsers } from '@/lib/erp/data/users'
import { formatDate, isoDate, money, moneyCompact, qty } from '@/lib/erp/format'
import { FilterDate, FilterForm, FilterSelect } from '@/components/erp/FilterForm'
import { Card, CardHeader, EmptyState, PageHeader, StatCard, TableWrap, Td, Th } from '@/components/erp/ui'

export const metadata = { title: 'Dashboard' }

interface Props {
  searchParams: Promise<{ from?: string; to?: string; mr?: string; territory?: string }>
}

/**
 * The owner's answer to "what is happening in my business today?".
 *
 * Ordered by what the spec says matters most (§57): today's field activity
 * first, then MR performance, then money and stock. Defaults to today so the
 * first screen answers the daily question without touching a filter.
 */
export default async function DashboardPage({ searchParams }: Props) {
  await requireCapability('reports.read.all')
  const params = await searchParams

  const today = isoDate()
  const from = params.from ?? today
  const to = params.to ?? today
  const isSingleDay = from === to
  const month = currentMonthRange()

  const [summary, monthSummary, mrRows, settings, mrs, staff] = await Promise.all([
    getDashboardSummary(from, to, params.mr, params.territory),
    getDashboardSummary(month.from, month.to),
    getMrPerformance(from, to),
    getErpSettings(),
    listMrs(),
    listErpUsers({ page: 1 }),
  ])

  const stock = await getStockSummary(settings.expiry_warning_days)

  const territories = [...new Set(
    staff.rows.map(u => u.territory).filter((t): t is string => !!t),
  )].sort()

  const hasFilters = !!(params.from || params.to || params.mr || params.territory)
  const activeMrs = mrRows.filter(r => r.doctor_visits > 0 || r.chemist_visits > 0).length

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={isSingleDay ? formatDate(from) : `${formatDate(from)} — ${formatDate(to)}`}
      />

      <Card padded={false} className="mb-5">
        <FilterForm action="/erp/dashboard" hasFilters={hasFilters}>
          <FilterDate name="from" label="From" defaultValue={from} />
          <FilterDate name="to"   label="To"   defaultValue={to} />
          {mrs.length > 0 && (
            <FilterSelect
              name="mr" label="MR" defaultValue={params.mr}
              options={mrs.map(m => ({
                value: m.id, label: m.mr_code ? `${m.mr_code} — ${m.name}` : m.name,
              }))}
              allLabel="All MRs"
            />
          )}
          {territories.length > 0 && (
            <FilterSelect
              name="territory" label="Territory" defaultValue={params.territory}
              options={territories.map(t => ({ value: t, label: t }))}
              allLabel="All territories"
            />
          )}
        </FilterForm>
      </Card>

      {/* 1 — Field activity */}
      <h2 className="mb-2.5 text-[12px] font-semibold uppercase tracking-wide text-gray-500">
        Field activity
      </h2>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          label="Doctor visits" value={qty(summary.doctor_visits)} icon={Stethoscope}
          hint={`${qty(summary.existing_doctors)} existing`}
          href="/erp/mr/doctor-visits"
        />
        <StatCard
          label="New doctors" value={qty(summary.new_doctors)} icon={UserPlus}
          tone={summary.new_doctors > 0 ? 'positive' : 'default'}
          hint="Added during a visit"
          href="/erp/mr/doctor-visits?status=NEW"
        />
        <StatCard
          label="Chemist visits" value={qty(summary.chemist_visits)} icon={Store}
          href="/erp/mr/chemist-visits"
        />
        <StatCard
          label="Field orders" value={qty(summary.field_orders)} icon={ClipboardList}
          hint={`${qty(summary.doctor_orders)} doctor · ${qty(summary.chemist_orders)} chemist`}
          href="/erp/mr/orders"
        />
        <StatCard
          label="Order value" value={moneyCompact(summary.field_order_value)} icon={IndianRupee}
          hint="Estimated demand"
        />
      </div>

      {/* 2 — MR performance */}
      <div className="mb-6">
        <Card padded={false}>
          <CardHeader
            title={`MR performance — ${activeMrs} of ${mrRows.length} active`}
            action={
              <Link href="/erp/reports" className="flex items-center gap-1 text-[12.5px] font-medium text-emerald-700 hover:underline">
                Full reports <ArrowRight size={13} />
              </Link>
            }
          />
          {mrRows.length === 0 ? (
            <EmptyState
              icon={Stethoscope}
              title="No medical representatives yet"
              description="Add MR accounts under Administration → Staff to start tracking field activity."
            />
          ) : (
            <TableWrap>
              <table className="w-full min-w-[860px]">
                <thead className="bg-gray-50">
                  <tr>
                    <Th>MR</Th>
                    <Th>Territory</Th>
                    <Th align="right">Doctor visits</Th>
                    <Th align="right">Doctors covered</Th>
                    <Th align="right">New doctors</Th>
                    <Th align="right">Chemist visits</Th>
                    <Th align="right">Orders</Th>
                    <Th align="right">Order value</Th>
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
                      <Td align="right" className="tabular-nums">
                        <span className={row.new_doctors > 0 ? 'font-medium text-emerald-700' : ''}>
                          {qty(row.new_doctors)}
                        </span>
                      </Td>
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
        </Card>
      </div>

      {/* 3 — Money and stock */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <IndianRupee size={15} className="text-emerald-700" />
            <h2 className="text-[13.5px] font-semibold text-gray-800">Sales</h2>
          </div>
          <dl className="space-y-2.5 text-[13px]">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-gray-500">{isSingleDay ? 'Today' : 'Selected period'}</dt>
              <dd className="text-[16px] font-bold tabular-nums text-gray-900">
                {money(summary.sales_value)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-gray-500">This month</dt>
              <dd className="font-semibold tabular-nums text-gray-800">{money(monthSummary.sales_value)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-gray-500">Invoices</dt>
              <dd className="tabular-nums text-gray-800">{qty(monthSummary.sales_count)} this month</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-gray-100 pt-2.5">
              <dt className="text-gray-500">Outstanding</dt>
              <dd className={`font-semibold tabular-nums ${
                monthSummary.sales_outstanding > 0 ? 'text-red-700' : 'text-emerald-700'
              }`}>
                {money(monthSummary.sales_outstanding)}
              </dd>
            </div>
          </dl>
          <Link href="/erp/accounting/sales"
                className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-emerald-700 hover:underline">
            Open sales <ArrowRight size={13} />
          </Link>
        </Card>

        <Card>
          <div className="mb-3 flex items-center gap-2">
            <Warehouse size={15} className="text-emerald-700" />
            <h2 className="text-[13.5px] font-semibold text-gray-800">Inventory</h2>
          </div>
          <dl className="space-y-2.5 text-[13px]">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-gray-500">Stock value</dt>
              <dd className="text-[16px] font-bold tabular-nums text-gray-900">
                {moneyCompact(stock.stockValue)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-gray-500">Batches in stock</dt>
              <dd className="tabular-nums text-gray-800">{qty(stock.inStockBatches)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-gray-500">Expiring in {settings.expiry_warning_days} days</dt>
              <dd className={`font-semibold tabular-nums ${
                stock.expiringBatches > 0 ? 'text-amber-700' : 'text-gray-800'
              }`}>
                {qty(stock.expiringBatches)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-gray-100 pt-2.5">
              <dt className="flex items-center gap-1 text-gray-500">
                {stock.expiredBatches > 0 && <AlertTriangle size={12} className="text-red-600" />}
                Expired
              </dt>
              <dd className={`font-semibold tabular-nums ${
                stock.expiredBatches > 0 ? 'text-red-700' : 'text-emerald-700'
              }`}>
                {qty(stock.expiredBatches)}
              </dd>
            </div>
          </dl>
          <Link href="/erp/accounting/inventory"
                className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-emerald-700 hover:underline">
            Open inventory <ArrowRight size={13} />
          </Link>
        </Card>

        <Card>
          <div className="mb-3 flex items-center gap-2">
            <Receipt size={15} className="text-emerald-700" />
            <h2 className="text-[13.5px] font-semibold text-gray-800">Purchases</h2>
          </div>
          <dl className="space-y-2.5 text-[13px]">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-gray-500">{isSingleDay ? 'Today' : 'Selected period'}</dt>
              <dd className="text-[16px] font-bold tabular-nums text-gray-900">
                {money(summary.purchase_value)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-gray-500">This month</dt>
              <dd className="font-semibold tabular-nums text-gray-800">
                {money(monthSummary.purchase_value)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-gray-500">Invoices</dt>
              <dd className="tabular-nums text-gray-800">{qty(monthSummary.purchase_count)} this month</dd>
            </div>
          </dl>
          <Link href="/erp/accounting/purchases"
                className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-emerald-700 hover:underline">
            Open purchases <ArrowRight size={13} />
          </Link>
        </Card>
      </div>

      <p className="mt-5 text-[11.5px] leading-relaxed text-gray-400">
        Field-order value is estimated demand recorded by MRs. Sales value is Leomed&apos;s own
        invoiced revenue. They are different measures and are not expected to match.
      </p>
    </>
  )
}
