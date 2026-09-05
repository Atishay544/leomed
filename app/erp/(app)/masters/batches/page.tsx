import Link from 'next/link'
import { Boxes } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { listBatches, PAGE_SIZE, searchProductsForPicker } from '@/lib/erp/data/masters'
import { getErpSettings } from '@/lib/erp/data/settings'
import { parsePage } from '@/lib/erp/data/query'
import { saveBatch } from '@/lib/erp/actions/masters'
import { can } from '@/lib/erp/permissions'
import { daysUntil, formatDate, money, qty } from '@/lib/erp/format'
import { BATCH_FIELDS } from '@/components/erp/master-fields'
import type { FieldSpec } from '@/components/erp/form/Field'
import MasterFormDialog from '@/components/erp/MasterFormDialog'
import SearchBar from '@/components/erp/SearchBar'
import Pagination from '@/components/erp/Pagination'
import { Badge, Card, EmptyState, PageHeader, TableWrap, Td, Th } from '@/components/erp/ui'

export const metadata = { title: 'Batches' }

const FILTERS = [
  { key: 'all',      label: 'All' },
  { key: 'in-stock', label: 'In stock' },
  { key: 'expiring', label: 'Expiring soon' },
  { key: 'expired',  label: 'Expired' },
] as const

interface Props {
  searchParams: Promise<{ q?: string; page?: string; filter?: string; product?: string }>
}

export default async function BatchesPage({ searchParams }: Props) {
  const session = await requireCapability('inventory.read')
  const params = await searchParams
  const page = parsePage(params.page)
  const filter = params.filter ?? 'all'

  const settings = await getErpSettings()
  const canWrite = can(session.role, 'billing.purchase.write')

  const [{ rows, total, pageCount }, products] = await Promise.all([
    listBatches({
      q: params.q, page, filter, productId: params.product,
      expiryWarningDays: settings.expiry_warning_days,
    }),
    canWrite ? searchProductsForPicker('', 200) : Promise.resolve([]),
  ])

  // The product picker is built here because its options come from the
  // database; everything else about the form is static.
  const batchFields: FieldSpec[] = [
    {
      name: 'product_id',
      label: 'Product',
      type: 'select',
      required: true,
      span: 2,
      options: products.map(p => ({
        value: String((p as { id: string }).id),
        label: [
          (p as { product_name: string }).product_name,
          (p as { strength: string | null }).strength,
          (p as { pack_size: string | null }).pack_size,
        ].filter(Boolean).join(' · '),
      })),
    },
    ...BATCH_FIELDS,
  ]

  const filterHref = (key: string) => {
    const next = new URLSearchParams()
    if (params.q) next.set('q', params.q)
    if (params.product) next.set('product', params.product)
    if (key !== 'all') next.set('filter', key)
    const qs = next.toString()
    return qs ? `/erp/masters/batches?${qs}` : '/erp/masters/batches'
  }

  return (
    <>
      <PageHeader
        title="Batches"
        description={`Batch-level stock with expiry tracking. Batches expiring within ${settings.expiry_warning_days} days are flagged.`}
        action={canWrite && products.length > 0 && (
          <MasterFormDialog
            action={saveBatch}
            fields={batchFields}
            title="Open a batch"
            triggerLabel="Add batch"
            submitLabel="Create batch"
          />
        )}
      />

      <Card padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
          <SearchBar placeholder="Batch number or product…" />
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTERS.map(f => (
              <Link
                key={f.key}
                href={filterHref(f.key)}
                className={`rounded-lg px-2.5 py-1 text-[12px] font-medium transition ${
                  filter === f.key
                    ? 'bg-emerald-700 text-white'
                    : 'border border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {f.label}
              </Link>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title="No batches to show"
            description={
              filter === 'expired' ? 'Nothing has expired — good.'
              : filter === 'expiring' ? `Nothing is expiring in the next ${settings.expiry_warning_days} days.`
              : 'Batches are created automatically when you record a purchase invoice.'
            }
          />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[900px]">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Product</Th>
                  <Th>Batch</Th>
                  <Th>Expiry</Th>
                  <Th align="right">In stock</Th>
                  <Th align="right">MRP</Th>
                  <Th align="right">Sale rate</Th>
                  <Th align="right">Stock value</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(b => {
                  const days = daysUntil(b.expiry_date)
                  const expired = days != null && days < 0
                  const expiring = days != null && days >= 0 && days <= settings.expiry_warning_days
                  return (
                    <tr key={b.id} className="hover:bg-gray-50/60">
                      <Td>
                        <span className="font-medium text-gray-900">
                          {b.erp_products?.product_name ?? '—'}
                        </span>
                        <p className="mt-0.5 font-mono text-[11px] text-gray-400">
                          {b.erp_products?.product_code}
                        </p>
                      </Td>
                      <Td className="font-mono text-[12px]">{b.batch_number}</Td>
                      <Td>
                        {formatDate(b.expiry_date)}
                        {expired && (
                          <Badge className="ml-2 bg-red-50 text-red-700 ring-red-600/20">
                            Expired
                          </Badge>
                        )}
                        {expiring && (
                          <Badge className="ml-2 bg-amber-50 text-amber-700 ring-amber-600/20">
                            {days === 0 ? 'Expires today' : `${days}d left`}
                          </Badge>
                        )}
                      </Td>
                      <Td align="right" className="tabular-nums font-medium">
                        <span className={b.current_quantity === 0 ? 'text-gray-400' : 'text-gray-900'}>
                          {qty(b.current_quantity)}
                        </span>
                        <span className="ml-1 text-[11px] text-gray-400">
                          {b.erp_products?.unit ?? ''}
                        </span>
                      </Td>
                      <Td align="right" className="tabular-nums">{money(b.mrp)}</Td>
                      <Td align="right" className="tabular-nums">{money(b.sale_rate)}</Td>
                      <Td align="right" className="tabular-nums text-gray-900">
                        {money(b.current_quantity * b.purchase_rate)}
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
          searchParams={params} basePath="/erp/masters/batches"
        />
      </Card>
    </>
  )
}
