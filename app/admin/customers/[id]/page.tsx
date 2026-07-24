import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin-auth'

export const metadata = { title: 'Customer Detail' }

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

export default async function CustomerDetailPage({ params }: PageProps) {
  await requireAdmin()
  const supabase = createAdminClient()

  const { id } = await params

  const [profileRes, ordersRes, authUserRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, phone, role, created_at, updated_at')
      .eq('id', id)
      .single(),
    supabase
      .from('orders')
      .select(`
        id, total, status, payment_status, created_at,
        order_items(quantity, unit_price, snapshot, products(name, slug))
      `)
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase.auth.admin.getUserById(id).catch(() => ({ data: { user: null } })),
  ])

  const customer = profileRes.data
  if (!customer) notFound()

  const orders  = ordersRes.data ?? []
  const email   = (authUserRes as any)?.data?.user?.email ?? ''

  const totalSpent = orders
    .filter(o => o.status === 'delivered')
    .reduce((sum, o) => sum + Number(o.total), 0)

  const totalOrders = orders.length

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Link href="/admin/customers" className="text-sm text-gray-500 hover:text-gray-700">Customers</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-bold text-gray-900">{customer.full_name || 'Unknown'}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left: profile + stats */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Profile</h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">Name</dt>
                <dd className="text-gray-700 font-medium">{customer.full_name || '—'}</dd>
              </div>
              {email && (
                <div>
                  <dt className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">Email</dt>
                  <dd>
                    <a href={`mailto:${email}`} className="text-blue-600 hover:underline text-sm break-all">{email}</a>
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">Phone</dt>
                <dd>
                  {customer.phone
                    ? <a href={`tel:${customer.phone}`} className="text-gray-700 hover:text-green-600">{customer.phone}</a>
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">Joined</dt>
                <dd className="text-gray-700">{new Date(customer.created_at).toLocaleDateString('en-IN', { dateStyle: 'long' })}</dd>
              </div>
            </dl>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">Total Orders</p>
              <p className="text-2xl font-bold text-gray-900">{totalOrders}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">Total Spent</p>
              <p className="text-lg font-bold text-gray-900">₹{totalSpent.toLocaleString('en-IN')}</p>
            </div>
          </div>
        </div>

        {/* Right: order history with items */}
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-base font-semibold text-gray-800">Order History</h2>

          {orders.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-10 text-center text-gray-400">
              No orders yet.
            </div>
          )}

          {orders.map(order => {
            const items = (order.order_items as any[]) ?? []
            return (
              <div key={order.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Order header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
                  <div className="flex items-center gap-3">
                    <Link href={`/admin/orders/${order.id}`} className="font-mono text-xs text-blue-600 hover:underline font-semibold">
                      #{order.id.slice(0, 8).toUpperCase()}
                    </Link>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {order.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span className="font-semibold text-gray-700">₹{Number(order.total).toLocaleString('en-IN')}</span>
                    <span>{new Date(order.created_at).toLocaleDateString('en-IN')}</span>
                  </div>
                </div>

                {/* Items */}
                {items.length > 0 && (
                  <div className="divide-y divide-gray-50">
                    {items.map((item: any, idx: number) => {
                      const name = item.products?.name ?? item.snapshot?.name ?? 'Product'
                      const slug = item.products?.slug
                      return (
                        <div key={idx} className="flex items-center justify-between px-4 py-2.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.5 font-medium shrink-0">×{item.quantity}</span>
                            {slug
                              ? <Link href={`/products/${slug}`} className="text-sm text-gray-700 hover:text-blue-600 truncate">{name}</Link>
                              : <span className="text-sm text-gray-700 truncate">{name}</span>
                            }
                          </div>
                          <span className="text-xs text-gray-400 shrink-0 ml-3">
                            ₹{(Number(item.unit_price) * item.quantity).toLocaleString('en-IN')}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
