import Link from 'next/link'
import { Package } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { listProducts, listStorefrontProductOptions, PAGE_SIZE } from '@/lib/erp/data/masters'
import { getStockTotalsForProducts } from '@/lib/erp/data/inventory'
import { parsePage } from '@/lib/erp/data/query'
import { saveProduct, setProductActive } from '@/lib/erp/actions/masters'
import { can } from '@/lib/erp/permissions'
import { money, qty } from '@/lib/erp/format'
import { productFieldsWithStorefrontLink } from '@/components/erp/master-fields'
import MasterFormDialog from '@/components/erp/MasterFormDialog'
import ToggleActiveButton from '@/components/erp/ToggleActiveButton'
import SearchBar from '@/components/erp/SearchBar'
import Pagination from '@/components/erp/Pagination'
import { Badge, Card, EmptyState, PageHeader, TableWrap, Td, Th } from '@/components/erp/ui'

export const metadata = { title: 'Product Master' }

interface Props {
  searchParams: Promise<{ q?: string; page?: string; category?: string; inactive?: string }>
}

export default async function ProductsPage({ searchParams }: Props) {
  const session = await requireCapability('masters.read')
  const params = await searchParams
  const page = parsePage(params.page)

  const [{ rows, total, pageCount }, storefrontOptions] = await Promise.all([
    listProducts({ q: params.q, page, category: params.category, includeInactive: params.inactive === '1' }),
    listStorefrontProductOptions(),
  ])
  const productFields = productFieldsWithStorefrontLink(storefrontOptions)
  // One grouped query for exactly this page's products — never a per-row
  // batch fetch (spec §41).
  const stockTotals = await getStockTotalsForProducts(rows.map(p => p.id))

  // MRs select products but never define or reprice them (spec §13). A
  // dedicated capability — not the broader masters.write ACCOUNTANT also
  // holds for distributors/suppliers — since erp_products' RLS is
  // admin-only and the two must never drift apart again (pre-PR review).
  const canWrite = can(session.role, 'products.write')

  return (
    <>
      <PageHeader
        title="Product Master"
        description="The pharma SKU catalogue used across visits, orders, purchases and sales."
        action={canWrite && (
          <MasterFormDialog
            action={saveProduct}
            fields={productFields}
            title="Add product"
            triggerLabel="Add product"
            submitLabel="Save product"
          />
        )}
      />

      <Card padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
          <SearchBar placeholder="Product, code, generic, brand…" />
          <p className="text-[12px] text-gray-500">{total} {total === 1 ? 'product' : 'products'}</p>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={Package}
            title={params.q ? 'No products match that search' : 'No products yet'}
            description={
              canWrite
                ? 'Add your first product to start recording visits, orders and invoices against it.'
                : 'Ask an administrator to add products to the master.'
            }
          />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[960px]">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Code</Th>
                  <Th>Product</Th>
                  <Th>Form / Pack</Th>
                  <Th>Category</Th>
                  <Th align="right">MRP</Th>
                  <Th align="right">Distributor</Th>
                  <Th align="right">Retailer</Th>
                  <Th align="right">GST</Th>
                  <Th align="right">Stock</Th>
                  {canWrite && <Th align="right">Actions</Th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50/60">
                    <Td className="font-mono text-[11.5px] text-gray-500">{p.product_code}</Td>
                    <Td>
                      <span className="font-medium text-gray-900">{p.product_name}</span>
                      {p.strength && <span className="ml-1 text-gray-500">{p.strength}</span>}
                      {!p.active && <Badge className="ml-2 bg-gray-100 text-gray-500 ring-gray-400/20">Inactive</Badge>}
                      {p.generic_name && (
                        <p className="mt-0.5 text-[11.5px] text-gray-400">{p.generic_name}</p>
                      )}
                    </Td>
                    <Td>
                      {p.dosage_form ?? '—'}
                      {p.pack_size && <p className="mt-0.5 text-[11.5px] text-gray-400">{p.pack_size} / {p.unit}</p>}
                    </Td>
                    <Td>{p.category ?? '—'}</Td>
                    <Td align="right" className="tabular-nums">{money(p.mrp)}</Td>
                    <Td align="right" className="tabular-nums font-medium text-gray-900">{money(p.distributor_price)}</Td>
                    <Td align="right" className="tabular-nums">{money(p.retailer_price)}</Td>
                    <Td align="right" className="tabular-nums">{p.gst_rate}%</Td>
                    <Td align="right" className="tabular-nums">
                      {(() => {
                        const stock = stockTotals.get(p.id)
                        return (
                          <Link
                            href={`/erp/masters/batches?product=${p.id}`}
                            className="font-medium text-emerald-700 hover:underline"
                            title="View batch-wise breakdown"
                          >
                            {qty(stock?.total_quantity ?? 0)} {p.unit}
                          </Link>
                        )
                      })()}
                      {(stockTotals.get(p.id)?.batch_count ?? 0) > 0 && (
                        <p className="mt-0.5 text-[10.5px] text-gray-400">
                          {stockTotals.get(p.id)?.batch_count} batch{(stockTotals.get(p.id)?.batch_count ?? 0) === 1 ? '' : 'es'}
                        </p>
                      )}
                    </Td>
                    {canWrite && (
                      <Td align="right">
                        <div className="flex items-center justify-end gap-2">
                          <MasterFormDialog
                            action={saveProduct}
                            fields={productFields}
                            title={`Edit ${p.product_name}`}
                            submitLabel="Save changes"
                            initial={p as unknown as Record<string, unknown>}
                            trigger={
                              <button type="button" className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-[12px] font-medium text-gray-700 transition hover:bg-gray-50">
                                Edit
                              </button>
                            }
                          />
                          <ToggleActiveButton
                            id={p.id} active={p.active}
                            action={setProductActive} noun="product"
                          />
                        </div>
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}

        <Pagination
          page={page} pageCount={pageCount} total={total} pageSize={PAGE_SIZE}
          searchParams={params} basePath="/erp/masters/products"
        />
      </Card>
    </>
  )
}
