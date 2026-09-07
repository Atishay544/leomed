import { Gift } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { listSchemes } from '@/lib/erp/data/pricing'
import { PAGE_SIZE, parsePage } from '@/lib/erp/data/query'
import { formatDate } from '@/lib/erp/format'
import { PRICING_STATUSES, SCHEME_TYPES } from '@/lib/erp/types'
import { FilterForm, FilterSelect } from '@/components/erp/FilterForm'
import Pagination from '@/components/erp/Pagination'
import SchemeDialog from '@/components/erp/pricing/SchemeDialog'
import SchemeStatusSelect from '@/components/erp/pricing/SchemeStatusSelect'
import { Badge, Card, EmptyState, PageHeader, TableWrap, Td, Th } from '@/components/erp/ui'

export const metadata = { title: 'Schemes' }

interface Props {
  searchParams: Promise<{ page?: string; status?: string; schemeType?: string }>
}

export default async function SchemesPage({ searchParams }: Props) {
  await requireCapability('pricing.manage')
  const params = await searchParams
  const page = parsePage(params.page)

  const { rows, total, pageCount } = await listSchemes({ page, status: params.status, schemeType: params.schemeType })

  return (
    <>
      <PageHeader
        title="Schemes"
        description="Percentage-margin overrides and Buy-X-Get-Y free quantity — targeted globally, by customer type, or to specific customers."
        action={<SchemeDialog />}
      />

      <Card padded={false}>
        <FilterForm action="/erp/pricing/schemes" hasFilters={!!(params.status || params.schemeType)}>
          <FilterSelect name="status" label="Status" defaultValue={params.status}
                        options={PRICING_STATUSES.map(s => ({ value: s, label: s }))} allLabel="All statuses" />
          <FilterSelect name="schemeType" label="Type" defaultValue={params.schemeType}
                        options={SCHEME_TYPES.map(s => ({ value: s, label: s === 'FREE_QUANTITY' ? 'Free Quantity' : 'Percentage Margin' }))} allLabel="All types" />
        </FilterForm>

        {rows.length === 0 ? (
          <EmptyState icon={Gift} title="No schemes yet" />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[900px]">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Scheme</Th>
                  <Th>Type</Th>
                  <Th>Product</Th>
                  <Th>Customer type</Th>
                  <Th>Terms</Th>
                  <Th>Effective</Th>
                  <Th align="right">Status</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(s => (
                  <tr key={s.id}>
                    <Td className="font-medium text-gray-900">{s.scheme_name} <span className="text-gray-400">v{s.version}</span></Td>
                    <Td><Badge className={s.scheme_type === 'FREE_QUANTITY' ? 'bg-blue-50 text-blue-700 ring-blue-600/20' : 'bg-violet-50 text-violet-700 ring-violet-600/20'}>
                      {s.scheme_type === 'FREE_QUANTITY' ? 'Free Qty' : 'Margin'}
                    </Badge></Td>
                    <Td>{s.erp_products?.product_name ?? '—'}</Td>
                    <Td>{s.customer_type ?? 'All'}</Td>
                    <Td>
                      {s.scheme_type === 'FREE_QUANTITY'
                        ? `Buy ${s.buy_quantity} Get ${s.free_quantity}`
                        : `${s.calculation_method} ${s.percentage}% of ${s.calculation_basis}`}
                    </Td>
                    <Td>{formatDate(s.effective_from)}{s.effective_to && ` – ${formatDate(s.effective_to)}`}</Td>
                    <Td align="right"><SchemeStatusSelect id={s.id} status={s.status} /></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}

        <Pagination page={page} pageCount={pageCount} total={total} pageSize={PAGE_SIZE} searchParams={params} basePath="/erp/pricing/schemes" />
      </Card>
    </>
  )
}
