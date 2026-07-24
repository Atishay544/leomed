import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin-auth'

export const metadata = { title: 'Customers' }

const PAGE_SIZE = 25

interface PageProps {
  searchParams: Promise<{ q?: string; page?: string }>
}

export default async function CustomersPage({ searchParams }: PageProps) {
  const supabase = createAdminClient()

  await requireAdmin()

  const params = await searchParams
  const q = params.q?.trim() ?? ''
  const page = Math.max(1, parseInt(params.page ?? '1', 10))
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from('profiles')
    .select('id, full_name, phone, role, created_at', { count: 'exact' })
    .eq('role', 'customer')
    .order('created_at', { ascending: false })
    .range(from, to)

  if (q) query = query.ilike('full_name', `%${q}%`)

  const { data: customers, count } = await query

  const customerIds = customers?.map(c => c.id) ?? []

  // Fetch emails from Supabase Auth
  const emailMap = new Map<string, string>()
  try {
    const { data: { users: authUsers } } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 })
    for (const u of authUsers ?? []) {
      if (u.email) emailMap.set(u.id, u.email)
    }
  } catch { /* auth admin may not be available in all envs */ }

  // Fetch most-recent order + items per customer
  const orderMap = new Map<string, { count: number; items: string[] }>()
  if (customerIds.length > 0) {
    const { data: orders } = await supabase
      .from('orders')
      .select('id, user_id, order_items(quantity, snapshot, products(name))')
      .in('user_id', customerIds)
      .order('created_at', { ascending: false })
      .limit(customerIds.length * 6)

    for (const o of orders ?? []) {
      if (!orderMap.has(o.user_id)) {
        const items = ((o as any).order_items ?? []).map((i: any) => {
          const name = i.products?.name ?? i.snapshot?.name ?? 'Product'
          return `${name} ×${i.quantity}`
        })
        orderMap.set(o.user_id, { count: 1, items })
      } else {
        orderMap.get(o.user_id)!.count++
      }
    }
  }

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE)

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Customers</h1>

      {/* Search */}
      <form method="GET" className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex gap-3">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Search by name…"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
        <button
          type="submit"
          className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
        >
          Search
        </button>
        {q && (
          <Link href="/admin/customers" className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">
            Clear
          </Link>
        )}
      </form>

      {/* Desktop table (md+) */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Customer</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Contact</th>
                <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">Orders</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Last Purchase</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {customers?.map(customer => {
                const od    = orderMap.get(customer.id)
                const email = emailMap.get(customer.id) ?? ''
                return (
                  <tr key={customer.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/admin/customers/${customer.id}`} className="font-medium text-gray-900 hover:text-blue-600">
                        {customer.full_name || <span className="text-gray-400 italic">No name</span>}
                      </Link>
                    </td>
                    <td className="px-4 py-3 space-y-0.5">
                      {email && (
                        <p className="text-xs">
                          <a href={`mailto:${email}`} className="text-blue-600 hover:underline">{email}</a>
                        </p>
                      )}
                      {customer.phone && (
                        <p className="text-xs">
                          <a href={`tel:${customer.phone}`} className="text-gray-500 hover:text-green-600">{customer.phone}</a>
                        </p>
                      )}
                      {!email && !customer.phone && <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 font-medium">
                      {od?.count ?? 0}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-xs">
                      {od?.items?.length ? (
                        <span className="block truncate">
                          {od.items.slice(0, 2).join(', ')}
                          {od.items.length > 2 && <span className="text-gray-400"> +{od.items.length - 2} more</span>}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {new Date(customer.created_at).toLocaleDateString('en-IN')}
                    </td>
                  </tr>
                )
              })}
              {(!customers || customers.length === 0) && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-400">No customers found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <p className="text-sm text-gray-500">Showing {from + 1}–{Math.min(to + 1, count ?? 0)} of {count}</p>
            <div className="flex gap-2">
              {page > 1 && (
                <Link href={`/admin/customers?q=${q}&page=${page - 1}`} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Previous</Link>
              )}
              {page < totalPages && (
                <Link href={`/admin/customers?q=${q}&page=${page + 1}`} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Next</Link>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mobile card list (< md) */}
      <div className="md:hidden space-y-3">
        {(!customers || customers.length === 0) && (
          <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-gray-400 text-sm">
            No customers found.
          </div>
        )}
        {customers?.map(customer => {
          const od    = orderMap.get(customer.id)
          const email = emailMap.get(customer.id) ?? ''
          return (
            <div key={customer.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <Link href={`/admin/customers/${customer.id}`} className="font-semibold text-gray-900 hover:text-blue-600 text-sm">
                  {customer.full_name || <span className="text-gray-400 italic">No name</span>}
                </Link>
                <span className="text-xs text-gray-400 shrink-0">
                  {new Date(customer.created_at).toLocaleDateString('en-IN')}
                </span>
              </div>
              <div className="space-y-1.5">
                {email && (
                  <p className="text-xs">
                    <a href={`mailto:${email}`} className="text-blue-600 hover:underline">{email}</a>
                  </p>
                )}
                {customer.phone && (
                  <p className="text-xs">
                    <a href={`tel:${customer.phone}`} className="text-gray-500">{customer.phone}</a>
                  </p>
                )}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-gray-500">Orders</span>
                  <span className="text-sm font-semibold text-gray-800">{od?.count ?? 0}</span>
                </div>
                {od?.items?.length ? (
                  <p className="text-xs text-gray-400 truncate">
                    {od.items.slice(0, 2).join(', ')}
                    {od.items.length > 2 && ` +${od.items.length - 2} more`}
                  </p>
                ) : null}
              </div>
            </div>
          )
        })}
        {totalPages > 1 && (
          <div className="flex items-center justify-between py-2">
            <p className="text-sm text-gray-500">Showing {from + 1}–{Math.min(to + 1, count ?? 0)} of {count}</p>
            <div className="flex gap-2">
              {page > 1 && (
                <Link href={`/admin/customers?q=${q}&page=${page - 1}`} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Previous</Link>
              )}
              {page < totalPages && (
                <Link href={`/admin/customers?q=${q}&page=${page + 1}`} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Next</Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
