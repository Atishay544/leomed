import { Tag } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { listPricingRules } from '@/lib/erp/data/pricing'
import { PAGE_SIZE, parsePage } from '@/lib/erp/data/query'
import { formatDate } from '@/lib/erp/format'
import { PRICING_STATUSES } from '@/lib/erp/types'
import { FilterForm, FilterSelect } from '@/components/erp/FilterForm'
import Pagination from '@/components/erp/Pagination'
import NegotiatedPricingDialog from '@/components/erp/pricing/NegotiatedPricingDialog'
import PricingRuleStatusButton from '@/components/erp/pricing/PricingRuleStatusButton'
import { Badge, Card, EmptyState, PageHeader, TableWrap, Td, Th } from '@/components/erp/ui'

export const metadata = { title: 'Negotiated Pricing' }

interface Props {
  searchParams: Promise<{ page?: string; status?: string }>
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE:    'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  DRAFT:     'bg-gray-100 text-gray-600 ring-gray-500/20',
  INACTIVE:  'bg-gray-100 text-gray-500 ring-gray-400/20',
  EXPIRED:   'bg-amber-50 text-amber-700 ring-amber-600/20',
  CANCELLED: 'bg-red-50 text-red-700 ring-red-600/20',
}

export default async function NegotiatedPricingPage({ searchParams }: Props) {
  await requireCapability('pricing.manage')
  const params = await searchParams
  const page = parsePage(params.page)

  const { rows, total, pageCount } = await listPricingRules({ page, status: params.status, scope: 'NEGOTIATED' })

  return (
    <>
      <PageHeader
        title="Negotiated Pricing"
        description="Customer-specific margins that override the product default. Every edit is a new, dated version — nothing is overwritten."
        action={<NegotiatedPricingDialog />}
      />

      <Card padded={false}>
        <FilterForm action="/erp/pricing/negotiated" hasFilters={!!params.status}>
          <FilterSelect name="status" label="Status" defaultValue={params.status}
                        options={PRICING_STATUSES.map(s => ({ value: s, label: s }))} allLabel="All statuses" />
        </FilterForm>

        {rows.length === 0 ? (
          <EmptyState icon={Tag} title="No negotiated pricing yet" description="Default product pricing applies to everyone until a customer-specific rule is added." />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[880px]">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Customer</Th>
                  <Th>Type</Th>
                  <Th>Product</Th>
                  <Th>Basis / Method</Th>
                  <Th align="right">%</Th>
                  <Th>Effective</Th>
                  <Th>Status</Th>
                  <Th align="right">Action</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(r => (
                  <tr key={r.id}>
                    <Td className="font-medium text-gray-900">
                      {r.erp_distributors?.distributor_name ?? r.erp_chemists?.chemist_name ?? r.erp_doctors?.doctor_name ?? '—'}
                    </Td>
                    <Td>{r.customer_type}</Td>
                    <Td>{r.erp_products?.product_name ?? '—'} <span className="text-gray-400">v{r.version}</span></Td>
                    <Td>{r.calculation_basis} / {r.calculation_method}</Td>
                    <Td align="right" className="tabular-nums">{r.percentage != null ? `${r.percentage}%` : `₹${r.fixed_amount}`}</Td>
                    <Td>{formatDate(r.effective_from)}{r.effective_to && ` – ${formatDate(r.effective_to)}`}</Td>
                    <Td><Badge className={STATUS_STYLES[r.status]}>{r.status}</Badge></Td>
                    <Td align="right"><PricingRuleStatusButton id={r.id} active={r.status === 'ACTIVE'} /></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}

        <Pagination page={page} pageCount={pageCount} total={total} pageSize={PAGE_SIZE} searchParams={params} basePath="/erp/pricing/negotiated" />
      </Card>
    </>
  )
}
