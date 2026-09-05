import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, ArrowLeft, ShoppingCart } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { getSalesInvoice } from '@/lib/erp/data/billing'
import { can } from '@/lib/erp/permissions'
import { gstSplit } from '@/lib/erp/invoice-math'
import {
  formatDate, formatDateTime, money, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_STYLES, qty,
} from '@/lib/erp/format'
import PaymentPanel, { type PaymentEntry } from '@/components/erp/billing/PaymentPanel'
import { Badge, Card, CardHeader, TableWrap, Td, Th } from '@/components/erp/ui'
import type { PaymentMethod, PaymentStatus } from '@/lib/erp/types'

export const metadata = { title: 'Sales Invoice' }

interface InvoiceDetail {
  id: string
  invoice_number: string
  invoice_date: string
  subtotal: number
  discount: number
  tax: number
  grand_total: number
  amount_paid: number
  payment_status: PaymentStatus
  is_interstate: boolean
  remarks: string | null
  expired_sale_override: boolean
  expired_sale_reason: string | null
  expired_sale_approved_at: string | null
  erp_users: { name: string } | null
  erp_sales_receipts: {
    id: string; receipt_date: string; amount: number; payment_method: PaymentMethod
    reference_number: string | null; remarks: string | null; created_at: string
    erp_users: { name: string } | null
  }[] | null
  erp_distributors: {
    distributor_name: string; distributor_code: string; gst_number: string | null
    city: string | null; state: string | null; phone: string | null
    drug_license_number: string | null
  } | null
  erp_sales_invoice_items: {
    id: string; quantity: number; free_quantity: number; sale_rate: number
    discount_percent: number; gst_rate: number; taxable_amount: number
    tax_amount: number; line_total: number
    erp_products: { product_name: string; product_code: string; strength: string | null; unit: string } | null
    erp_product_batches: { batch_number: string; expiry_date: string } | null
  }[] | null
}

export default async function SalesInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requireCapability('billing.sales.read')
  const { id } = await params

  const invoice = (await getSalesInvoice(id)) as InvoiceDetail | null
  if (!invoice) notFound()

  const distributor = invoice.erp_distributors
  const tax = gstSplit(Number(invoice.tax), invoice.is_interstate)

  const receipts: PaymentEntry[] = (invoice.erp_sales_receipts ?? [])
    .map(r => ({
      id: r.id,
      date: r.receipt_date,
      amount: Number(r.amount),
      payment_method: r.payment_method,
      reference_number: r.reference_number,
      remarks: r.remarks,
      recordedBy: r.erp_users?.name ?? null,
    }))
    .sort((a, b) => b.date.localeCompare(a.date))

  const received = receipts.reduce((sum, r) => sum + r.amount, 0)
  const due = Number(invoice.grand_total) - received

  return (
    <>
      <div className="mb-4">
        <Link
          href="/erp/accounting/sales"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft size={14} /> Sales
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                  <ShoppingCart size={19} />
                </span>
                <div>
                  <h1 className="font-mono text-lg font-bold text-gray-900">{invoice.invoice_number}</h1>
                  <p className="mt-0.5 text-[12.5px] text-gray-500">
                    {formatDate(invoice.invoice_date)} · {distributor?.distributor_name ?? 'Unknown distributor'}
                  </p>
                </div>
              </div>
              <Badge className={PAYMENT_STATUS_STYLES[invoice.payment_status]}>
                {PAYMENT_STATUS_LABELS[invoice.payment_status]}
              </Badge>
            </div>

            {/* Q9: selling expired stock is an exception that must stay visible
                on the document it applies to, not only in the audit log. */}
            {invoice.expired_sale_override && (
              <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-3.5 py-3">
                <p className="flex items-center gap-1.5 text-[13px] font-semibold text-red-900">
                  <AlertTriangle size={14} /> Expired stock sold under authorisation
                </p>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-red-800">
                  {invoice.expired_sale_reason}
                </p>
                <p className="mt-1.5 text-[11.5px] text-red-700">
                  Approved by {invoice.erp_users?.name ?? 'an administrator'}
                  {invoice.expired_sale_approved_at &&
                    ` on ${formatDateTime(invoice.expired_sale_approved_at)}`}
                </p>
              </div>
            )}
          </Card>

          <Card padded={false}>
            <CardHeader title={`Products (${invoice.erp_sales_invoice_items?.length ?? 0})`} />
            <TableWrap>
              <table className="w-full min-w-[820px]">
                <thead className="bg-gray-50">
                  <tr>
                    <Th>Product</Th>
                    <Th>Batch / expiry</Th>
                    <Th align="right">Qty</Th>
                    <Th align="right">Free</Th>
                    <Th align="right">Rate</Th>
                    <Th align="right">Disc</Th>
                    <Th align="right">GST</Th>
                    <Th align="right">Total</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invoice.erp_sales_invoice_items?.map(item => (
                    <tr key={item.id}>
                      <Td>
                        <span className="font-medium text-gray-900">
                          {item.erp_products?.product_name ?? '—'}
                        </span>
                        {item.erp_products?.strength && (
                          <span className="ml-1 text-gray-500">{item.erp_products.strength}</span>
                        )}
                        <p className="mt-0.5 font-mono text-[11px] text-gray-400">
                          {item.erp_products?.product_code}
                        </p>
                      </Td>
                      <Td>
                        <span className="font-mono text-[12px]">
                          {item.erp_product_batches?.batch_number ?? '—'}
                        </span>
                        {item.erp_product_batches?.expiry_date && (
                          <p className="mt-0.5 text-[11px] text-gray-400">
                            exp {formatDate(item.erp_product_batches.expiry_date)}
                          </p>
                        )}
                      </Td>
                      <Td align="right" className="tabular-nums">
                        {qty(item.quantity)} {item.erp_products?.unit}
                      </Td>
                      <Td align="right" className="tabular-nums">
                        {item.free_quantity > 0 ? qty(item.free_quantity) : '—'}
                      </Td>
                      <Td align="right" className="tabular-nums">{money(item.sale_rate)}</Td>
                      <Td align="right" className="tabular-nums">
                        {item.discount_percent > 0 ? `${item.discount_percent}%` : '—'}
                      </Td>
                      <Td align="right" className="tabular-nums">
                        {item.gst_rate}%
                        <p className="mt-0.5 text-[11px] text-gray-400">{money(item.tax_amount)}</p>
                      </Td>
                      <Td align="right" className="tabular-nums font-medium text-gray-900">
                        {money(item.line_total)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 text-[13px] font-semibold text-gray-800">Distributor</h2>
            <p className="text-[14px] font-semibold text-gray-900">{distributor?.distributor_name ?? '—'}</p>
            <p className="mt-0.5 font-mono text-[11.5px] text-gray-400">{distributor?.distributor_code}</p>
            {distributor?.gst_number && (
              <p className="mt-2 text-[12.5px] text-gray-600">
                GST <span className="font-mono">{distributor.gst_number}</span>
              </p>
            )}
            {distributor?.drug_license_number && (
              <p className="mt-0.5 text-[12.5px] text-gray-600">
                DL <span className="font-mono">{distributor.drug_license_number}</span>
              </p>
            )}
            {(distributor?.city || distributor?.state) && (
              <p className="mt-0.5 text-[12.5px] text-gray-600">
                {[distributor?.city, distributor?.state].filter(Boolean).join(', ')}
              </p>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 text-[13px] font-semibold text-gray-800">Totals</h2>
            <dl className="space-y-2 text-[13px]">
              <div className="flex justify-between">
                <dt className="text-gray-500">Subtotal</dt>
                <dd className="tabular-nums text-gray-900">{money(invoice.subtotal)}</dd>
              </div>
              {Number(invoice.discount) > 0 && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Discount</dt>
                  <dd className="tabular-nums text-gray-900">− {money(invoice.discount)}</dd>
                </div>
              )}
              {invoice.is_interstate ? (
                <div className="flex justify-between">
                  <dt className="text-gray-500">IGST</dt>
                  <dd className="tabular-nums text-gray-900">{money(tax.igst)}</dd>
                </div>
              ) : (
                <>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">CGST</dt>
                    <dd className="tabular-nums text-gray-900">{money(tax.cgst)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">SGST</dt>
                    <dd className="tabular-nums text-gray-900">{money(tax.sgst)}</dd>
                  </div>
                </>
              )}
              <div className="flex justify-between border-t border-gray-100 pt-2">
                <dt className="font-semibold text-gray-700">Grand total</dt>
                <dd className="text-[15px] font-bold tabular-nums text-gray-900">
                  {money(invoice.grand_total)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Received</dt>
                <dd className="tabular-nums text-gray-900">{money(received)}</dd>
              </div>
              {due > 0 && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Outstanding</dt>
                  <dd className="font-semibold tabular-nums text-red-700">{money(due)}</dd>
                </div>
              )}
            </dl>
          </Card>

          <Card>
            <h2 className="mb-3 text-[13px] font-semibold text-gray-800">
              Receipts ({receipts.length})
            </h2>
            <PaymentPanel
              kind="sales"
              invoiceId={invoice.id}
              grandTotal={Number(invoice.grand_total)}
              entries={receipts}
              canRecord={can(session.role, 'billing.sales.write')}
              canDelete={session.role === 'ADMIN'}
            />
          </Card>

          {invoice.remarks && (
            <Card>
              <h2 className="mb-2 text-[13px] font-semibold text-gray-800">Remarks</h2>
              <p className="text-[12.5px] leading-relaxed text-gray-700">{invoice.remarks}</p>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
