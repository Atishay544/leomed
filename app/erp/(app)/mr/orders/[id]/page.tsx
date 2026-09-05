import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ClipboardList } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { getFieldOrder } from '@/lib/erp/data/visits'
import { can } from '@/lib/erp/permissions'
import {
  FIELD_ORDER_STATUS_LABELS, FIELD_ORDER_STATUS_STYLES, formatDate, money, qty,
} from '@/lib/erp/format'
import FieldOrderStatusSelect from '@/components/erp/FieldOrderStatusSelect'
import { Badge, Card, CardHeader, TableWrap, Td, Th } from '@/components/erp/ui'
import type { CustomerType, FieldOrderStatus } from '@/lib/erp/types'

export const metadata = { title: 'Field Order' }

interface OrderDetail {
  id: string
  order_number: string
  customer_type: CustomerType
  order_date: string
  order_book_number: string | null
  status: FieldOrderStatus
  estimated_value: number
  remarks: string | null
  doctor_visit_id: string | null
  chemist_visit_id: string | null
  erp_doctors: {
    doctor_name: string; doctor_code: string; phone: string | null
    area: string | null; city: string | null; clinic_name: string | null
  } | null
  erp_chemists: {
    chemist_name: string; chemist_code: string; phone: string | null
    area: string | null; city: string | null; owner_name: string | null
  } | null
  erp_users: { name: string; mr_code: string | null } | null
  erp_field_order_items: {
    id: string; quantity: number; unit: string; unit_rate: number
    discount_percent: number; line_value: number; remarks: string | null
    erp_products: { product_name: string; product_code: string; strength: string | null; pack_size: string | null } | null
  }[] | null
}

export default async function FieldOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requireCapability('orders.read.own')
  const { id } = await params

  const order = (await getFieldOrder(id)) as OrderDetail | null
  if (!order) notFound()

  const isDoctor = order.customer_type === 'DOCTOR'
  const customerName = isDoctor
    ? order.erp_doctors?.doctor_name
    : order.erp_chemists?.chemist_name
  const customerDetail = isDoctor
    ? order.erp_doctors?.clinic_name
    : order.erp_chemists?.owner_name
  const phone = isDoctor ? order.erp_doctors?.phone : order.erp_chemists?.phone
  const area = isDoctor
    ? [order.erp_doctors?.area, order.erp_doctors?.city]
    : [order.erp_chemists?.area, order.erp_chemists?.city]

  const visitHref = order.doctor_visit_id
    ? `/erp/mr/doctor-visits/${order.doctor_visit_id}`
    : order.chemist_visit_id
      ? `/erp/mr/chemist-visits/${order.chemist_visit_id}`
      : null

  return (
    <>
      <div className="mb-4">
        <Link
          href="/erp/mr/orders"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft size={14} /> Field orders
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                  <ClipboardList size={19} />
                </span>
                <div>
                  <h1 className="font-mono text-lg font-bold text-gray-900">{order.order_number}</h1>
                  <p className="mt-0.5 text-[12.5px] text-gray-500">
                    {formatDate(order.order_date)} · from {isDoctor ? 'a doctor' : 'a chemist'}
                  </p>
                </div>
              </div>
              <Badge className={FIELD_ORDER_STATUS_STYLES[order.status]}>
                {FIELD_ORDER_STATUS_LABELS[order.status]}
              </Badge>
            </div>

            <p className="mt-4 rounded-lg bg-blue-50 px-3.5 py-2.5 text-[12px] leading-relaxed text-blue-900">
              This is a <strong>field order</strong> — a record of what was asked for during a
              visit. It measures demand and MR performance. It has not created a sales invoice,
              has not moved any stock, and is not money owed to Leomed.
            </p>
          </Card>

          <Card padded={false}>
            <CardHeader title={`Products ordered (${order.erp_field_order_items?.length ?? 0})`} />
            <TableWrap>
              <table className="w-full min-w-[560px]">
                <thead className="bg-gray-50">
                  <tr>
                    <Th>Product</Th>
                    <Th align="right">Quantity</Th>
                    <Th align="right">Rate</Th>
                    <Th align="right">Discount</Th>
                    <Th align="right">Est. value</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {order.erp_field_order_items?.map(item => (
                    <tr key={item.id}>
                      <Td>
                        <span className="font-medium text-gray-900">
                          {item.erp_products?.product_name ?? '—'}
                        </span>
                        {item.erp_products?.strength && (
                          <span className="ml-1 text-gray-500">{item.erp_products.strength}</span>
                        )}
                        <p className="mt-0.5 font-mono text-[11px] text-gray-400">
                          {[item.erp_products?.product_code, item.erp_products?.pack_size]
                            .filter(Boolean).join(' · ')}
                        </p>
                        {item.remarks && (
                          <p className="mt-0.5 text-[11.5px] text-gray-500">{item.remarks}</p>
                        )}
                      </Td>
                      <Td align="right" className="tabular-nums">{qty(item.quantity)} {item.unit}</Td>
                      <Td align="right" className="tabular-nums">{money(item.unit_rate)}</Td>
                      <Td align="right" className="tabular-nums">
                        {item.discount_percent > 0 ? `${item.discount_percent}%` : '—'}
                      </Td>
                      <Td align="right" className="tabular-nums font-medium text-gray-900">
                        {money(item.line_value)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <Td className="font-semibold text-gray-700">Estimated field order value</Td>
                    <Td /><Td /><Td />
                    <Td align="right" className="tabular-nums text-[15px] font-bold text-gray-900">
                      {money(order.estimated_value)}
                    </Td>
                  </tr>
                </tfoot>
              </table>
            </TableWrap>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 text-[13px] font-semibold text-gray-800">
              {isDoctor ? 'Doctor' : 'Chemist'}
            </h2>
            <p className="text-[14px] font-semibold text-gray-900">{customerName ?? '—'}</p>
            {customerDetail && <p className="mt-0.5 text-[12.5px] text-gray-500">{customerDetail}</p>}
            {area.filter(Boolean).length > 0 && (
              <p className="mt-0.5 text-[12.5px] text-gray-500">{area.filter(Boolean).join(', ')}</p>
            )}
            {phone && (
              <a
                href={`tel:${phone}`}
                className="mt-3 inline-block rounded-lg border border-gray-300 px-3 py-1.5
                           text-[12.5px] font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Call {phone}
              </a>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 text-[13px] font-semibold text-gray-800">Order details</h2>
            <dl className="space-y-2.5 text-[13px]">
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">Order book no.</dt>
                <dd className="font-mono font-medium text-gray-900">
                  {order.order_book_number ?? '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">Recorded by</dt>
                <dd className="text-right font-medium text-gray-900">
                  {order.erp_users?.name ?? '—'}
                  {order.erp_users?.mr_code && (
                    <span className="block font-mono text-[11px] text-gray-400">
                      {order.erp_users.mr_code}
                    </span>
                  )}
                </dd>
              </div>
              {visitHref && (
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">From visit</dt>
                  <dd>
                    <Link href={visitHref} className="font-medium text-emerald-700 hover:underline">
                      Open visit
                    </Link>
                  </dd>
                </div>
              )}
            </dl>

            {order.remarks && (
              <div className="mt-3.5 border-t border-gray-100 pt-3">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Remarks
                </p>
                <p className="text-[12.5px] leading-relaxed text-gray-700">{order.remarks}</p>
              </div>
            )}
          </Card>

          {can(session.role, 'orders.manage_status') && (
            <Card>
              <h2 className="mb-1 text-[13px] font-semibold text-gray-800">Fulfilment status</h2>
              <p className="mb-3 text-[11.5px] leading-relaxed text-gray-500">
                Tracks what the distributor network did with this demand. Changing it raises no
                invoice and moves no stock.
              </p>
              <FieldOrderStatusSelect orderId={order.id} status={order.status} />
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
