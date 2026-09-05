import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ClipboardList, Package, Store } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { getChemistVisit } from '@/lib/erp/data/visits'
import {
  FIELD_ORDER_STATUS_LABELS, FIELD_ORDER_STATUS_STYLES, formatDate, formatTime,
  money, qty, VISIT_PURPOSE_LABELS,
} from '@/lib/erp/format'
import { Badge, Card, CardHeader, TableWrap, Td, Th } from '@/components/erp/ui'
import type { FieldOrderStatus, VisitPurpose } from '@/lib/erp/types'

export const metadata = { title: 'Chemist Visit' }

interface VisitDetail {
  id: string
  visit_date: string
  visit_time: string | null
  purpose: VisitPurpose
  discussion: string | null
  remarks: string | null
  follow_up_required: boolean
  follow_up_date: string | null
  erp_chemists: {
    chemist_name: string; chemist_code: string; owner_name: string | null
    phone: string | null; area: string | null; city: string | null; gst_number: string | null
  } | null
  erp_users: { name: string; mr_code: string | null } | null
  erp_field_orders: {
    id: string; order_number: string; order_book_number: string | null
    status: FieldOrderStatus; estimated_value: number
    erp_field_order_items: {
      id: string; quantity: number; unit: string; unit_rate: number; line_value: number
      erp_products: { product_name: string; strength: string | null } | null
    }[] | null
  }[] | null
}

export default async function ChemistVisitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireCapability('visits.read.own')
  const { id } = await params

  const visit = (await getChemistVisit(id)) as VisitDetail | null
  if (!visit) notFound()

  const chemist = visit.erp_chemists
  const order = visit.erp_field_orders?.[0]

  return (
    <>
      <div className="mb-4">
        <Link
          href="/erp/mr/chemist-visits"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft size={14} /> Chemist visits
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                <Store size={19} />
              </span>
              <div className="min-w-0 flex-1">
                <h1 className="text-lg font-bold text-gray-900">{chemist?.chemist_name ?? 'Unknown chemist'}</h1>
                <p className="mt-0.5 text-[12.5px] text-gray-500">
                  {chemist?.owner_name ?? chemist?.chemist_code}
                </p>
                <div className="mt-2">
                  <Badge className="bg-blue-50 text-blue-700 ring-blue-600/20">
                    {VISIT_PURPOSE_LABELS[visit.purpose]}
                  </Badge>
                </div>
              </div>
              {chemist?.phone && (
                <a
                  href={`tel:${chemist.phone}`}
                  className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-[12.5px]
                             font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  Call
                </a>
              )}
            </div>

            {visit.discussion && (
              <div className="mt-4 border-t border-gray-100 pt-3.5">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Discussion</p>
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-gray-700">{visit.discussion}</p>
              </div>
            )}

            {visit.remarks && (
              <div className="mt-3.5 border-t border-gray-100 pt-3.5">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Remarks</p>
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-gray-700">{visit.remarks}</p>
              </div>
            )}
          </Card>

          {order ? (
            <Card padded={false}>
              <CardHeader
                title="Field order"
                action={
                  <Badge className={FIELD_ORDER_STATUS_STYLES[order.status]}>
                    {FIELD_ORDER_STATUS_LABELS[order.status]}
                  </Badge>
                }
              />
              <div className="border-b border-gray-100 px-5 py-3">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12.5px]">
                  <span className="text-gray-500">
                    Order <Link href={`/erp/mr/orders/${order.id}`} className="font-mono font-medium text-emerald-700 hover:underline">
                      {order.order_number}
                    </Link>
                  </span>
                  {order.order_book_number && (
                    <span className="text-gray-500">
                      Book no. <span className="font-mono text-gray-800">{order.order_book_number}</span>
                    </span>
                  )}
                </div>
                <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-[11.5px] leading-relaxed text-blue-800">
                  A field order records demand and MR performance. It is not a Leomed sales
                  invoice and has not moved any stock.
                </p>
              </div>
              <TableWrap>
                <table className="w-full min-w-[520px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <Th>Product</Th>
                      <Th align="right">Qty</Th>
                      <Th align="right">Rate</Th>
                      <Th align="right">Value</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {order.erp_field_order_items?.map(item => (
                      <tr key={item.id}>
                        <Td>
                          <span className="font-medium text-gray-900">{item.erp_products?.product_name ?? '—'}</span>
                          {item.erp_products?.strength && (
                            <span className="ml-1 text-gray-500">{item.erp_products.strength}</span>
                          )}
                        </Td>
                        <Td align="right" className="tabular-nums">{qty(item.quantity)} {item.unit}</Td>
                        <Td align="right" className="tabular-nums">{money(item.unit_rate)}</Td>
                        <Td align="right" className="tabular-nums font-medium text-gray-900">{money(item.line_value)}</Td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <Td className="font-semibold text-gray-700">Estimated value</Td>
                      <Td /><Td />
                      <Td align="right" className="tabular-nums font-bold text-gray-900">
                        {money(order.estimated_value)}
                      </Td>
                    </tr>
                  </tfoot>
                </table>
              </TableWrap>
            </Card>
          ) : (
            <Card>
              <div className="flex items-center gap-2 text-gray-500">
                <Package size={15} />
                <p className="text-[12.5px]">No order was taken during this visit.</p>
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 text-[13px] font-semibold text-gray-800">Visit</h2>
            <dl className="space-y-2.5 text-[13px]">
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">Date</dt>
                <dd className="font-medium text-gray-900">{formatDate(visit.visit_date)}</dd>
              </div>
              {visit.visit_time && (
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">Time</dt>
                  <dd className="font-medium text-gray-900">{formatTime(visit.visit_time)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">Recorded by</dt>
                <dd className="text-right font-medium text-gray-900">
                  {visit.erp_users?.name ?? '—'}
                  {visit.erp_users?.mr_code && (
                    <span className="block font-mono text-[11px] text-gray-400">{visit.erp_users.mr_code}</span>
                  )}
                </dd>
              </div>
              {chemist?.gst_number && (
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">GST</dt>
                  <dd className="font-mono text-[11.5px] text-gray-900">{chemist.gst_number}</dd>
                </div>
              )}
            </dl>
          </Card>

          {visit.follow_up_required && visit.follow_up_date && (
            <Card>
              <div className="flex items-center gap-2">
                <ClipboardList size={15} className="text-amber-600" />
                <h2 className="text-[13px] font-semibold text-gray-800">Follow-up scheduled</h2>
              </div>
              <p className="mt-2 text-[13px] text-gray-700">{formatDate(visit.follow_up_date)}</p>
              <Link
                href="/erp/mr/followups"
                className="mt-2.5 inline-block text-[12.5px] font-medium text-emerald-700 hover:underline"
              >
                Open follow-ups
              </Link>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
