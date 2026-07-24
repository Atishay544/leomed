import { requireUser } from '@/lib/user-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { formatPrice } from '@/lib/utils'
import { Package } from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  pending:         'bg-yellow-100 text-yellow-700',
  confirmed:       'bg-blue-100 text-blue-700',
  cod_upfront_paid:'bg-blue-100 text-blue-700',
  processing:      'bg-purple-100 text-purple-700',
  shipped:         'bg-indigo-100 text-indigo-700',
  delivered:       'bg-green-100 text-green-700',
  cancelled:       'bg-red-100 text-red-600',
  refunded:        'bg-gray-100 text-gray-600',
}

export default async function OrdersPage() {
  // requireUser is React.cache() — deduplicates auth across layout + page
  const { user } = await requireUser('/account/orders')

  // Admin client bypasses RLS → no per-row policy evaluation → ~10× faster
  // Security: filter is enforced by .eq('user_id', user.id)
  const admin = createAdminClient()
  const { data: orders } = await admin
    .from('orders')
    .select('id,created_at,status,total_amount,items_count')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(0, 19)

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold mb-6">My Orders</h1>

      {!orders || orders.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Package size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-lg mb-4">No orders yet</p>
          <Link href="/products" className="inline-block bg-black text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800 transition">
            Start Shopping
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map(order => (
            <Link key={order.id} href={`/account/orders/${order.id}`}
              className="block border rounded-2xl p-5 hover:border-gray-400 transition group">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-sm text-gray-500">Order ID</p>
                  <p className="font-mono text-sm font-medium">{order.id.slice(0, 8).toUpperCase()}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Date</p>
                  <p className="text-sm">{new Date(order.created_at).toLocaleDateString('en-IN')}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Items</p>
                  <p className="text-sm">{order.items_count ?? 0}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total</p>
                  <p className="font-bold">{formatPrice(order.total_amount)}</p>
                </div>
                <span className={`text-xs font-semibold px-3 py-1 rounded-full capitalize ${STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {order.status === 'cod_upfront_paid' ? 'confirmed' : order.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
