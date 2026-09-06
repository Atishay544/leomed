import Link from 'next/link'
import { ArrowLeft, IndianRupee } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { listProducts } from '@/lib/erp/data/masters'
import { getStockTotalsForProducts, getStockValuationSummary } from '@/lib/erp/data/inventory'
import { PAGE_SIZE, parsePage } from '@/lib/erp/data/query'
import { money, qty } from '@/lib/erp/format'
import SearchBar from '@/components/erp/SearchBar'
import Pagination from '@/components/erp/Pagination'
import { Card, EmptyState, PageHeader, StatCard, TableWrap, Td, Th } from '@/components/erp/ui'

export const metadata = { title: 'Stock Valuation' }

interface Props {
  searchParams: Promise<{ q?: string; page?: string }>
}

/**
 * Admin-only (inventory.valuation): what the stock on hand is worth, at
 * landing cost and at MRP, product by product and company-wide. Reveals
 * purchase pricing and margin, unlike the plain quantities on the Product
 * Master and Batches screens that accountants and managers already need
 * for day-to-day billing.
 */
export default async function StockValuationPage({ searchParams }: Props) {
  await requireCapability('inventory.valuation')
  const params = await searchParams
  const page = parsePage(params.page)

  const [{ rows, total, pageCount }, summary] = await Promise.all([
    listProducts({ q: params.q, page }),
    getStockValuationSummary(),
  ])
  const stockTotals = await getStockTotalsForProducts(rows.map(p => p.id))

  return (
    <>
      <div className="mb-4">
        <Link
          href="/erp/masters/products"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft size={14} /> Product Master
        </Link>
      </div>

      <PageHeader
        title="Stock Valuation"
        description="What the stock on hand is worth — landing cost and MRP, product-wise and company-wide. Visible to administrators only."
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Products with stock" value={summary.product_count} />
        <StatCard label="Total landing value" value={money(summary.total_landing_value)} icon={IndianRupee} />
        <StatCard label="Total MRP value" value={money(summary.total_mrp_value)} icon={IndianRupee} tone="positive" />
      </div>

      <Card padded={false}>
        <div className="border-b border-gray-100 px-4 py-3">
          <SearchBar placeholder="Product, code, generic, brand…" />
        </div>

        {rows.length === 0 ? (
          <EmptyState title={params.q ? 'No products match that search' : 'No products yet'} />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[780px]">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Product</Th>
                  <Th align="right">Units in stock</Th>
                  <Th align="right">Landing value</Th>
                  <Th align="right">MRP value</Th>
                  <Th align="right">Detail</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(p => {
                  const stock = stockTotals.get(p.id)
                  return (
                    <tr key={p.id} className="hover:bg-gray-50/60">
                      <Td>
                        <span className="font-medium text-gray-900">{p.product_name}</span>
                        {p.strength && <span className="ml-1 text-gray-500">{p.strength}</span>}
                        <p className="mt-0.5 font-mono text-[11px] text-gray-400">{p.product_code}</p>
                      </Td>
                      <Td align="right" className="tabular-nums">
                        {qty(stock?.total_quantity ?? 0)} {p.unit}
                      </Td>
                      <Td align="right" className="tabular-nums font-medium text-gray-900">
                        {money(stock?.total_value ?? 0)}
                      </Td>
                      <Td align="right" className="tabular-nums">
                        {money(stock?.total_mrp_value ?? 0)}
                      </Td>
                      <Td align="right">
                        <Link
                          href={`/erp/masters/batches?product=${p.id}`}
                          className="text-[12.5px] font-medium text-emerald-700 hover:underline"
                        >
                          Batches
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
          searchParams={params} basePath="/erp/masters/products/valuation"
        />
      </Card>
    </>
  )
}
