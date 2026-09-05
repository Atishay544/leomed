import Link from 'next/link'
import {
  AlertTriangle, Boxes, CalendarX2, IndianRupee, PackageX, Warehouse,
} from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import {
  getLowStockProducts, getReconciliationIssues, getStockSummary, listInventoryTransactions,
} from '@/lib/erp/data/inventory'
import { getErpSettings } from '@/lib/erp/data/settings'
import { PAGE_SIZE, parsePage } from '@/lib/erp/data/query'
import { can } from '@/lib/erp/permissions'
import { formatDate, INVENTORY_TXN_LABELS, money, moneyCompact, qty } from '@/lib/erp/format'
import { INVENTORY_TXN_TYPES } from '@/lib/erp/types'
import AdjustStockDialog from '@/components/erp/billing/AdjustStockDialog'
import { FilterDate, FilterForm, FilterSelect } from '@/components/erp/FilterForm'
import Pagination from '@/components/erp/Pagination'
import {
  Card, CardHeader, EmptyState, ErrorState, PageHeader, StatCard, TableWrap, Td, Th,
} from '@/components/erp/ui'

export const metadata = { title: 'Inventory' }

interface Props {
  searchParams: Promise<{ page?: string; type?: string; from?: string; to?: string }>
}

export default async function InventoryPage({ searchParams }: Props) {
  const session = await requireCapability('inventory.read')
  const params = await searchParams
  const page = parsePage(params.page)
  const settings = await getErpSettings()

  const [summary, lowStock, ledger, mismatches] = await Promise.all([
    getStockSummary(settings.expiry_warning_days),
    getLowStockProducts(10),
    listInventoryTransactions({ page, type: params.type, from: params.from, to: params.to }),
    getReconciliationIssues(),
  ])

  const canAdjust = can(session.role, 'inventory.adjust')
  const hasFilters = !!(params.type || params.from || params.to)

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Batch-level stock. Every movement below is a ledger entry — nothing is edited in place."
        action={canAdjust && <AdjustStockDialog />}
      />

      {mismatches.length > 0 && (
        <div className="mb-4">
          <ErrorState
            title={`${mismatches.length} batch${mismatches.length > 1 ? 'es' : ''} disagree with the ledger`}
            description={`Stock figures are normally kept in step with the transaction ledger automatically.
                          These do not match and should be investigated: ${
                            mismatches.slice(0, 3)
                              .map(m => `${m.product_name} (batch ${m.batch_number}): shows ${m.cached_quantity}, ledger says ${m.ledger_quantity}`)
                              .join('; ')
                          }${mismatches.length > 3 ? '…' : ''}`}
          />
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          label="Stock value" value={moneyCompact(summary.stockValue)}
          hint="At purchase rate" icon={IndianRupee}
        />
        <StatCard
          label="Batches in stock" value={qty(summary.inStockBatches)}
          hint={`${qty(summary.totalBatches)} total`} icon={Boxes}
          href="/erp/masters/batches?filter=in-stock"
        />
        <StatCard
          label="Expiring soon" value={qty(summary.expiringBatches)}
          hint={`Within ${settings.expiry_warning_days} days`} icon={CalendarX2}
          tone={summary.expiringBatches > 0 ? 'warning' : 'default'}
          href="/erp/masters/batches?filter=expiring"
        />
        <StatCard
          label="Expired" value={qty(summary.expiredBatches)}
          hint={summary.expiredValue > 0 ? `${money(summary.expiredValue)} at risk` : 'None'}
          icon={AlertTriangle}
          tone={summary.expiredBatches > 0 ? 'critical' : 'default'}
          href="/erp/masters/batches?filter=expired"
        />
        <StatCard
          label="Low stock" value={qty(lowStock.length)}
          hint="Products at or below alert level" icon={PackageX}
          tone={lowStock.length > 0 ? 'warning' : 'default'}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card padded={false}>
            <CardHeader title="Stock movements" />
            <FilterForm action="/erp/accounting/inventory" hasFilters={hasFilters}>
              <FilterDate name="from" label="From" defaultValue={params.from} />
              <FilterDate name="to"   label="To"   defaultValue={params.to} />
              <FilterSelect
                name="type" label="Type" defaultValue={params.type}
                options={INVENTORY_TXN_TYPES.map(t => ({ value: t, label: INVENTORY_TXN_LABELS[t] }))}
              />
            </FilterForm>

            {ledger.rows.length === 0 ? (
              <EmptyState
                icon={Warehouse}
                title={hasFilters ? 'No movements match' : 'No stock movements yet'}
                description="Purchases add stock, sales remove it, and adjustments are recorded here with a reason."
              />
            ) : (
              <TableWrap>
                <table className="w-full min-w-[760px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <Th>Date</Th>
                      <Th>Product</Th>
                      <Th>Batch</Th>
                      <Th>Movement</Th>
                      <Th align="right">Change</Th>
                      <Th>By</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {ledger.rows.map(row => (
                      <tr key={row.id} className="hover:bg-gray-50/60">
                        <Td>{formatDate(row.transaction_date)}</Td>
                        <Td>
                          <span className="font-medium text-gray-900">
                            {row.erp_products?.product_name ?? '—'}
                          </span>
                          <p className="mt-0.5 font-mono text-[11px] text-gray-400">
                            {row.erp_products?.product_code}
                          </p>
                        </Td>
                        <Td className="font-mono text-[12px]">
                          {row.erp_product_batches?.batch_number ?? '—'}
                        </Td>
                        <Td>
                          {INVENTORY_TXN_LABELS[row.transaction_type]}
                          {row.remarks && (
                            <p className="mt-0.5 max-w-[220px] truncate text-[11px] text-gray-400">
                              {row.remarks}
                            </p>
                          )}
                        </Td>
                        <Td align="right">
                          <span className={`font-semibold tabular-nums ${
                            row.quantity > 0 ? 'text-emerald-700' : 'text-red-700'
                          }`}>
                            {row.quantity > 0 ? '+' : '−'}{qty(Math.abs(row.quantity))}
                          </span>
                        </Td>
                        <Td className="text-[12px] text-gray-500">{row.erp_users?.name ?? '—'}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}

            <Pagination
              page={page} pageCount={ledger.pageCount} total={ledger.total} pageSize={PAGE_SIZE}
              searchParams={params} basePath="/erp/accounting/inventory"
            />
          </Card>
        </div>

        <div className="space-y-4">
          <Card padded={false}>
            <CardHeader title="Low stock" />
            {lowStock.length === 0 ? (
              <p className="px-5 py-6 text-center text-[12.5px] text-gray-500">
                Nothing is below its alert level.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {lowStock.map(row => (
                  <li key={row.productId} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-gray-900">{row.productName}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-gray-400">{row.productCode}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`text-[13px] font-semibold tabular-nums ${
                        row.onHand === 0 ? 'text-red-700' : 'text-amber-700'
                      }`}>
                        {qty(row.onHand)} {row.unit}
                      </p>
                      <p className="text-[11px] text-gray-400">alert at {qty(row.minStockLevel)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-gray-100 px-5 py-2.5">
              <Link href="/erp/masters/products" className="text-[12.5px] font-medium text-emerald-700 hover:underline">
                Manage alert levels
              </Link>
            </div>
          </Card>

          <Card>
            <h2 className="mb-2 text-[13px] font-semibold text-gray-800">How stock is tracked</h2>
            <p className="text-[12px] leading-relaxed text-gray-600">
              Every batch&apos;s quantity is the sum of its ledger entries. Purchases add,
              sales subtract, and adjustments require a reason. No screen writes a stock number
              directly, so any figure here can be traced to the movement that produced it.
            </p>
          </Card>
        </div>
      </div>
    </>
  )
}
