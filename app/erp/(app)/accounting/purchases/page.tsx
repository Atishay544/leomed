import Link from 'next/link'
import { Plus, Receipt } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { listPurchaseInvoices } from '@/lib/erp/data/billing'
import { listSuppliers } from '@/lib/erp/data/masters'
import { PAGE_SIZE, parsePage } from '@/lib/erp/data/query'
import { can } from '@/lib/erp/permissions'
import { formatDate, money, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_STYLES } from '@/lib/erp/format'
import { PAYMENT_STATUSES } from '@/lib/erp/types'
import { FilterDate, FilterForm, FilterSelect } from '@/components/erp/FilterForm'
import SearchBar from '@/components/erp/SearchBar'
import Pagination from '@/components/erp/Pagination'
import { Badge, ButtonLink, Card, EmptyState, PageHeader, TableWrap, Td, Th } from '@/components/erp/ui'

export const metadata = { title: 'Purchases' }

interface Props {
  searchParams: Promise<{
    page?: string; q?: string; from?: string; to?: string
    supplier?: string; payment?: string
  }>
}

export default async function PurchasesPage({ searchParams }: Props) {
  const session = await requireCapability('billing.purchase.read')
  const params = await searchParams
  const page = parsePage(params.page)

  const [{ rows, total, pageCount }, suppliers] = await Promise.all([
    listPurchaseInvoices({
      page, q: params.q, from: params.from, to: params.to,
      partyId: params.supplier, paymentStatus: params.payment,
    }),
    listSuppliers({ page: 1 }),
  ])

  const canWrite = can(session.role, 'billing.purchase.write')
  const hasFilters = !!(params.from || params.to || params.supplier || params.payment)
  const pageTotal = rows.reduce((sum, i) => sum + Number(i.grand_total ?? 0), 0)

  return (
    <>
      <PageHeader
        title="Purchases"
        description="Invoices from suppliers. Saving one adds stock to the batches it lists."
        action={canWrite && (
          <ButtonLink href="/erp/accounting/purchases/new">
            <Plus size={15} /> Record purchase
          </ButtonLink>
        )}
      />

      <Card padded={false}>
        <div className="border-b border-gray-100 px-4 py-3">
          <SearchBar placeholder="Invoice number…" />
        </div>
        <FilterForm action="/erp/accounting/purchases" hasFilters={hasFilters}>
          <FilterDate name="from" label="From" defaultValue={params.from} />
          <FilterDate name="to"   label="To"   defaultValue={params.to} />
          <FilterSelect
            name="supplier" label="Supplier" defaultValue={params.supplier}
            options={suppliers.rows.map(s => ({ value: s.id, label: s.supplier_name }))}
            allLabel="All suppliers"
          />
          <FilterSelect
            name="payment" label="Payment" defaultValue={params.payment}
            options={PAYMENT_STATUSES.map(s => ({ value: s, label: PAYMENT_STATUS_LABELS[s] }))}
          />
        </FilterForm>

        {rows.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={hasFilters || params.q ? 'No purchases match' : 'No purchase invoices yet'}
            description={
              canWrite
                ? 'Record a purchase invoice to bring stock into inventory.'
                : 'Purchase invoices recorded by accounting will appear here.'
            }
            action={canWrite && (
              <ButtonLink href="/erp/accounting/purchases/new"><Plus size={15} /> Record purchase</ButtonLink>
            )}
          />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[900px]">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Invoice</Th>
                  <Th>Date</Th>
                  <Th>Supplier</Th>
                  <Th align="center">Lines</Th>
                  <Th align="right">Taxable</Th>
                  <Th align="right">GST</Th>
                  <Th align="right">Total</Th>
                  <Th>Payment</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(inv => {
                  const due = Number(inv.grand_total ?? 0) - Number(inv.amount_paid ?? 0)
                  return (
                    <tr key={inv.id} className="hover:bg-gray-50/60">
                      <Td>
                        <Link
                          href={`/erp/accounting/purchases/${inv.id}`}
                          className="font-mono text-[12px] font-medium text-emerald-700 hover:underline"
                        >
                          {inv.invoice_number}
                        </Link>
                      </Td>
                      <Td>{formatDate(inv.invoice_date)}</Td>
                      <Td>
                        <span className="font-medium text-gray-900">
                          {inv.erp_suppliers?.supplier_name ?? '—'}
                        </span>
                      </Td>
                      <Td align="center" className="tabular-nums">
                        {inv.erp_purchase_invoice_items?.length ?? 0}
                      </Td>
                      <Td align="right" className="tabular-nums">
                        {money(Number(inv.subtotal) - Number(inv.discount))}
                      </Td>
                      <Td align="right" className="tabular-nums">{money(inv.tax)}</Td>
                      <Td align="right" className="tabular-nums font-medium text-gray-900">
                        {money(inv.grand_total)}
                      </Td>
                      <Td>
                        <Badge className={PAYMENT_STATUS_STYLES[inv.payment_status]}>
                          {PAYMENT_STATUS_LABELS[inv.payment_status]}
                        </Badge>
                        {due > 0 && (
                          <p className="mt-0.5 text-[11px] tabular-nums text-gray-500">{money(due)} due</p>
                        )}
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <Td className="font-semibold text-gray-700">This page</Td>
                  <Td /><Td /><Td /><Td /><Td />
                  <Td align="right" className="tabular-nums font-bold text-gray-900">{money(pageTotal)}</Td>
                  <Td />
                </tr>
              </tfoot>
            </table>
          </TableWrap>
        )}

        <Pagination
          page={page} pageCount={pageCount} total={total} pageSize={PAGE_SIZE}
          searchParams={params} basePath="/erp/accounting/purchases"
        />
      </Card>
    </>
  )
}
