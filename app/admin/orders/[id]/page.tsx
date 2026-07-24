import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin-auth'
import OrderDetailActions from './OrderDetailActions'
import InvoiceButton from './InvoiceButton'
import DeliveryPanel from './DeliveryPanel'

export const metadata = { title: 'Order Detail' }

interface PageProps {
  params: Promise<{ id: string }>
}

const STATUS_COLORS: Record<string, string> = {
  pending:          'bg-yellow-100 text-yellow-800',
  confirmed:        'bg-blue-100 text-blue-800',
  cod_upfront_paid: 'bg-teal-100 text-teal-800',
  processing:       'bg-purple-100 text-purple-800',
  shipped:          'bg-indigo-100 text-indigo-800',
  delivered:        'bg-green-100 text-green-800',
  cancelled:        'bg-red-100 text-red-800',
  refunded:         'bg-gray-100 text-gray-700',
}

export default async function OrderDetailPage({ params }: PageProps) {
  await requireAdmin()
  const supabase = createAdminClient()

  const { id } = await params

  const { data: order } = await supabase
    .from('orders')
    .select(`
      id, status, subtotal, tax, shipping, total, tracking_number,
      shipping_address, created_at, updated_at, user_id,
      discount_amount, metadata, payment_status,
      delivery_partner, delivery_awb, delivery_rate, delivery_service,
      order_items(id, quantity, unit_price, total, snapshot)
    `)
    .eq('id', id)
    .single()

  if (!order) notFound()

  // Fetch customer profile + auth email in parallel
  const [{ data: customer }, { data: authUser }] = await Promise.all([
    supabase.from('profiles').select('full_name, phone').eq('id', order.user_id).single(),
    supabase.auth.admin.getUserById(order.user_id),
  ])
  const customerEmail = authUser?.user?.email ?? null

  const address  = order.shipping_address as any
  const meta     = (order.metadata ?? {}) as Record<string, any>
  const pmMethod = meta.payment_method as string | undefined

  const PM_LABELS: Record<string, { label: string; color: string }> = {
    online:      { label: 'Paid Online',      color: 'bg-blue-100 text-blue-800' },
    cod:         { label: 'Cash on Delivery', color: 'bg-orange-100 text-orange-800' },
    cod_upfront: { label: 'COD Upfront',      color: 'bg-green-100 text-green-800' },
    upi:         { label: 'UPI Transfer',     color: 'bg-purple-100 text-purple-800' },
    partial_cod: { label: 'Partial COD',      color: 'bg-amber-100 text-amber-800' },
  }

  const PS_LABELS: Record<string, { label: string; color: string }> = {
    prepaid:       { label: 'Prepaid',          color: 'bg-emerald-100 text-emerald-800' },
    cod:           { label: 'COD',              color: 'bg-amber-100 text-amber-800' },
    partial:       { label: 'Partial',          color: 'bg-purple-100 text-purple-800' },
    upi_pending:   { label: 'UPI – Unverified', color: 'bg-red-100 text-red-700' },
    upi_confirmed: { label: 'UPI – Confirmed',  color: 'bg-emerald-100 text-emerald-800' },
  }
  const paymentStatus = (order as any).payment_status as string | undefined
  const utrNumber = meta.utr_number as string | undefined

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/orders" className="text-sm text-gray-500 hover:text-gray-700">Orders</Link>
          <span className="text-gray-300">/</span>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 font-mono">#{id.slice(0, 8).toUpperCase()}</h1>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-700'}`}>
            {order.status}
          </span>
          {pmMethod && PM_LABELS[pmMethod] && (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${PM_LABELS[pmMethod].color}`}>
              {PM_LABELS[pmMethod].label}
            </span>
          )}
          {paymentStatus && PS_LABELS[paymentStatus] && (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${PS_LABELS[paymentStatus].color}`}>
              {PS_LABELS[paymentStatus].label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <InvoiceButton order={{
            ...order,
            customer: { full_name: customer?.full_name ?? undefined, email: customerEmail ?? undefined, phone: customer?.phone ?? undefined },
          }} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order items */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">Items</h2>
            </div>
            <div className="overflow-x-auto">
          <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Product</th>
                  <th className="text-right px-5 py-3 text-xs text-gray-500 font-medium">Qty</th>
                  <th className="text-right px-5 py-3 text-xs text-gray-500 font-medium">Unit</th>
                  <th className="text-right px-5 py-3 text-xs text-gray-500 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {(order.order_items as any[]).map((item: any) => (
                  <tr key={item.id} className="border-t border-gray-100">
                    <td className="px-5 py-3 text-gray-700">{item.snapshot?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-right text-gray-600">{item.quantity}</td>
                    <td className="px-5 py-3 text-right text-gray-600">₹{Number(item.unit_price).toLocaleString('en-IN')}</td>
                    <td className="px-5 py-3 text-right font-medium">₹{Number(item.total).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
            <div className="px-5 py-4 border-t border-gray-100 space-y-1.5">
              <div className="flex justify-between text-sm text-gray-500">
                <span>Subtotal</span><span>₹{Number(order.subtotal).toLocaleString('en-IN')}</span>
              </div>
              {(order as any).discount_amount > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Discount</span><span>-₹{Number((order as any).discount_amount).toLocaleString('en-IN')}</span>
                </div>
              )}
              <div className="flex justify-between text-sm text-gray-500">
                <span>Tax</span><span>₹{Number(order.tax).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-500">
                <span>Shipping</span><span>₹{Number(order.shipping).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-gray-900 pt-1 border-t border-gray-100">
                <span>Total</span><span>₹{Number(order.total).toLocaleString('en-IN')}</span>
              </div>
              {/* COD upfront breakdown */}
              {pmMethod === 'cod_upfront' && meta.amount_charged && (
                <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
                  <div className="flex justify-between text-sm text-blue-700">
                    <span>Paid upfront ({meta.offer_upfront_pct}%)</span>
                    <span>₹{Number(meta.amount_charged).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-sm text-orange-700">
                    <span>Due on delivery</span>
                    <span>₹{Number(meta.amount_on_delivery).toLocaleString('en-IN')}</span>
                  </div>
                </div>
              )}
              {pmMethod === 'cod' && meta.amount_on_delivery && (
                <div className="flex justify-between text-sm text-orange-700 mt-2 pt-2 border-t border-gray-100">
                  <span>Collect on delivery</span>
                  <span>₹{Number(meta.amount_on_delivery).toLocaleString('en-IN')}</span>
                </div>
              )}
            </div>
          </div>

          {/* Status + Tracking actions */}
          <OrderDetailActions
            orderId={order.id}
            currentStatus={order.status}
            currentTracking={order.tracking_number ?? ''}
            utrNumber={utrNumber ?? null}
            paymentStatus={paymentStatus ?? null}
          />

          {/* Delivery / Shipping Panel */}
          <DeliveryPanel
            orderId={order.id}
            orderStatus={order.status}
            toPin={address?.pincode ?? address?.zip ?? ''}
            totalAmount={Number(order.total)}
            currentPartner={(order as any).delivery_partner ?? null}
            currentAwb={(order as any).delivery_awb ?? null}
            currentRate={(order as any).delivery_rate ?? null}
            currentService={(order as any).delivery_service ?? null}
          />
        </div>

        {/* Sidebar: Customer + Address */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">Customer</h2>
            <p className="text-sm text-gray-700 font-medium">{customer?.full_name ?? '—'}</p>
            {customerEmail && <p className="text-sm text-gray-500 mt-1">{customerEmail}</p>}
            {customer?.phone && <p className="text-sm text-gray-500 mt-1">{customer.phone}</p>}
            <p className="text-xs text-gray-400 mt-2">
              Ordered {new Date(order.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">Shipping Address</h2>
            <div className="text-sm text-gray-600 space-y-0.5">
              {(address?.name || address?.full_name) && (
                <p className="font-medium text-gray-700">{address.name ?? address.full_name}</p>
              )}
              {address?.phone && <p className="text-gray-500">{address.phone}</p>}
              {address?.line1 && <p>{address.line1}</p>}
              {address?.line2 && <p>{address.line2}</p>}
              {address?.city && <p>{address.city}{address.state ? `, ${address.state}` : ''}</p>}
              {(address?.pincode || address?.zip) && <p>{address.pincode ?? address.zip}</p>}
              {address?.country && <p>{address.country}</p>}
            </div>
          </div>

          {order.tracking_number && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-800 mb-2">Tracking Number</h2>
              <p className="font-mono text-sm text-gray-700">{order.tracking_number}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
