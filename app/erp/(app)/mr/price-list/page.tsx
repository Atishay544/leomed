import { Tags } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { listMrPriceReference } from '@/lib/erp/data/masters'
import { PAGE_SIZE, parsePage } from '@/lib/erp/data/query'
import { priceInclGst } from '@/lib/erp/pricing-preview'
import { money } from '@/lib/erp/format'
import SearchBar from '@/components/erp/SearchBar'
import Pagination from '@/components/erp/Pagination'
import { Card, EmptyState, PageHeader, TableWrap, Td, Th } from '@/components/erp/ui'

export const metadata = { title: 'Price List' }

interface Props {
  searchParams: Promise<{ q?: string; page?: string }>
}

/**
 * View-only price/composition reference for MRs to quote on the spot —
 * deliberately separate from Product Master (no edit affordances, no
 * purchase_rate/distributor_price). Reads the product master directly, not
 * the batch actually in stock: the agreed process is that admin updates the
 * product master the moment a new batch arrives at a different MRP/landing
 * price (the purchase-invoice screen now nudges for exactly that), so this
 * always reflects the current quotable rate.
 */
export default async function MrPriceListPage({ searchParams }: Props) {
  await requireCapability('masters.read')
  const params = await searchParams
  const page = parsePage(params.page)

  const { rows, total, pageCount } = await listMrPriceReference(params.q, page)

  return (
    <>
      <PageHeader
        title="Price List"
        description="Composition, MRP and retailer price for every product — what to quote a doctor or chemist on the spot."
      />

      <Card padded={false}>
        <div className="border-b border-gray-100 px-4 py-3">
          <SearchBar placeholder="Product, generic name, composition, uses…" />
        </div>

        {rows.length === 0 ? (
          <EmptyState icon={Tags} title="No products match" description="Try a different search." />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[960px]">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Product</Th>
                  <Th>Composition</Th>
                  <Th>Uses</Th>
                  <Th align="right">MRP</Th>
                  <Th align="right">Price to retailer</Th>
                  <Th align="right">Tax</Th>
                  <Th align="right">Price to retailer (incl. tax)</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50/60">
                    <Td>
                      <span className="font-medium text-gray-900">{p.product_name}</span>
                      {p.strength && <span className="ml-1 text-gray-500">{p.strength}</span>}
                      {(p.generic_name || p.pack_size) && (
                        <p className="mt-0.5 text-[11px] text-gray-400">
                          {[p.generic_name, p.pack_size].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </Td>
                    <Td className="max-w-xs text-[12.5px] text-gray-600">{p.composition || '—'}</Td>
                    <Td className="max-w-xs text-[12.5px] text-gray-600">{p.uses || '—'}</Td>
                    <Td align="right" className="tabular-nums">{money(p.mrp)}</Td>
                    <Td align="right" className="tabular-nums">{money(p.retailer_price)}</Td>
                    <Td align="right" className="tabular-nums text-gray-500">{p.gst_rate}%</Td>
                    <Td align="right" className="tabular-nums font-semibold text-gray-900">
                      {money(priceInclGst(p.retailer_price, p.gst_rate))}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}

        <Pagination
          page={page} pageCount={pageCount} total={total} pageSize={PAGE_SIZE}
          searchParams={params} basePath="/erp/mr/price-list"
        />
      </Card>
    </>
  )
}
