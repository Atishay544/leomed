import Link from 'next/link'
import { Plus, ShoppingCart } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { listSalesInvoices } from '@/lib/erp/data/billing'
import { listDistributors, listChemists } from '@/lib/erp/data/masters'
import { PAGE_SIZE, parsePage } from '@/lib/erp/data/query'
import { can } from '@/lib/erp/permissions'
import { formatDate, money, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_STYLES } from '@/lib/erp/format'
import { PAYMENT_STATUSES } from '@/lib/erp/types'
import { FilterDate, FilterForm, FilterSelect } from '@/components/erp/FilterForm'
import SearchBar from '@/components/erp/SearchBar'
import Pagination from '@/components/erp/Pagination'
import { Badge, ButtonLink, Card, EmptyState, PageHeader, TableWrap, Td, Th } from '@/components/erp/ui'

export const metadata = { title: 'Sales' }

interface Props {
  searchParams: Promise<{
    page?: string; q?: string; from?: string; to?: string
    distributor?: string; chemist?: string; payment?: string
  }>
}

export default async function SalesPage({ searchParams }: Props) {
  const session = await requireCapability('billing.sales.read')
  const params = await searchParams
  const page = parsePage(params.page)

  const [{ rows, total, pageCount }, distributors, chemists] = await Promise.all([
    listSalesInvoices({
      page, q: params.q, from: params.from, to: params.to,
      partyId: params.distributor, chemistId: params.chemist, paymentStatus: params.payment,
    }),
    listDistributors({ page: 1 }),
    listChemists({ page: 1 }),
  ])

  const canWrite = can(session.role, 'billing.sales.write')
  const hasFilters = !!(params.from || params.to || params.distributor || params.chemist || params.payment)
  const pageTotal = rows.reduce((sum, i) => sum + Number(i.grand_total ?? 0), 0)

  return (
    <>
      <PageHeader
        title="Sales"
        description="Leomed's own invoices to distributors or direct to chemists. Saving one deducts stock from the batches sold."
        action={canWrite && (
          <ButtonLink href="/erp/accounting/sales/new">
            <Plus size={15} /> New sales invoice
          </ButtonLink>
        )}
      />

      <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
        <p className="text-[12.5px] leading-relaxed text-gray-600">
          These are actual company sales. Orders that MRs collect from doctors and chemists are
          tracked separately as <Link href="/erp/mr/orders" className="font-medium text-emerald-700 hover:underline">field orders</Link> and
          never become invoices automatically.
        </p>
      </div>

      <Card padded={false}>
        <div className="border-b border-gray-100 px-4 py-3">
          <SearchBar placeholder="Invoice number…" />
        </div>
        <FilterForm action="/erp/accounting/sales" hasFilters={hasFilters}>
          <FilterDate name="from" label="From" defaultValue={params.from} />
          <FilterDate name="to"   label="To"   defaultValue={params.to} />
          <FilterSelect
            name="distributor" label="Distributor" defaultValue={params.distributor}
            options={distributors.rows.map(d => ({ value: d.id, label: d.distributor_name }))}
            allLabel="All distributors"
          />
          <FilterSelect
            name="chemist" label="Chemist" defaultValue={params.chemist}
            options={chemists.rows.map(c => ({ value: c.id, label: c.chemist_name }))}
            allLabel="All chemists"
          />
          <FilterSelect
            name="payment" label="Payment" defaultValue={params.payment}
            options={PAYMENT_STATUSES.map(s => ({ value: s, label: PAYMENT_STATUS_LABELS[s] }))}
          />
        </FilterForm>

        {rows.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title={hasFilters || params.q ? 'No sales match' : 'No sales invoices yet'}
            description={
              canWrite
                ? 'Raise your first invoice to a distributor or chemist.'
                : 'Sales invoices raised by accounting will appear here.'
            }
            action={canWrite && (
              <ButtonLink href="/erp/accounting/sales/new"><Plus size={15} /> New sales invoice</ButtonLink>
            )}
          />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[900px]">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Invoice</Th>
                  <Th>Date</Th>
                  <Th>Bill to</Th>
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
                          href={`/erp/accounting/sales/${inv.id}`}
                          className="font-mono text-[12px] font-medium text-emerald-700 hover:underline"
                        >
                          {inv.invoice_number}
                        </Link>
                      </Td>
                      <Td>{formatDate(inv.invoice_date)}</Td>
                      <Td>
                        <span className="font-medium text-gray-900">
                          {inv.erp_distributors?.distributor_name ?? inv.erp_chemists?.chemist_name ?? '—'}
                        </span>
                        {inv.chemist_id && (
                          <Badge className="ml-1.5 bg-blue-50 text-blue-700 ring-blue-600/20">Direct</Badge>
                        )}
                      </Td>
                      <Td align="center" className="tabular-nums">
                        {inv.erp_sales_invoice_items?.length ?? 0}
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
          searchParams={params} basePath="/erp/accounting/sales"
        />
      </Card>
    </>
  )
}
